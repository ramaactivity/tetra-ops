"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	PER_BATCH_CONCURRENCY,
	PER_BATCH_TIMEOUT_MS,
	runWithConcurrency,
	withRetry,
	withTimeout,
} from "@/lib/csv-import/resilience";
import type { ImportResult, ImportResultRow } from "@/lib/csv-import/types";
import { createClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

const ItemRowSchema = z.object({
	sku: z
		.string()
		.trim()
		.min(2)
		.max(40)
		.regex(/^[A-Z0-9_-]+$/i, "SKU invalid"),
	name: z.string().trim().min(1).max(120),
	category: z.enum(["inventory", "fixed_asset"]),
	unit: z.string().trim().min(1).max(20),
	min_stock_alert: z.coerce.number().int().nonnegative().default(0),
	purchase_price_avg: z.coerce.number().int().nonnegative().default(0),
	purchase_price: z
		.union([z.coerce.number().int().nonnegative(), z.literal("")])
		.nullish()
		.transform((v) => (typeof v === "number" ? v : null)),
	useful_life_months: z
		.union([z.coerce.number().int().positive(), z.literal("")])
		.nullish()
		.transform((v) => (typeof v === "number" ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.nullish()
		.transform((v) => (v ? v : null)),
	is_active: z.coerce.boolean().default(true),
});

function normalizeCategory(raw: string): "inventory" | "fixed_asset" | null {
	const v = raw.trim().toLowerCase();
	if (v === "inventory" || v === "consumables") return "inventory";
	if (v === "fixed_asset" || v === "alat" || v === "equipment_owned") {
		return "fixed_asset";
	}
	if (v === "packaging" || v === "uniform") return "inventory";
	return null;
}

function normalizeBool(raw: string | undefined): boolean {
	if (!raw) return true;
	const v = raw.trim().toLowerCase();
	return v === "true" || v === "1" || v === "y" || v === "yes" || v === "ya";
}

// ─────────────────────────────────────────────────────────────────────────
// Public action 1 — duplicate check
// ─────────────────────────────────────────────────────────────────────────

export async function checkItemDuplicates(skus: string[]): Promise<string[]> {
	await requireOwnerLevel();
	const filtered = skus.filter(Boolean);
	if (filtered.length === 0) return [];
	const supabase = await createClient();
	const { data, error } = await withRetry(() =>
		supabase.from("inventory_items").select("sku").in("sku", filtered),
	);
	if (error) throw new Error(`Duplicate check: ${error.message}`);
	return (data ?? []).map((r) => r.sku as string);
}

// ─────────────────────────────────────────────────────────────────────────
// Public action 2 — commit (upsert by SKU, parallel within batch)
// ─────────────────────────────────────────────────────────────────────────

export async function commitItemImport(
	rows: Record<string, string>[],
	rowOffset = 0,
): Promise<ImportResult> {
	return withTimeout(
		async () => {
			await requireOwnerLevel();
			const supabase = await createClient();

			let inserted = 0;
			let updated = 0;
			let skipped = 0;
			let errors = 0;
			const resultRows: ImportResultRow[] = [];

			// Pre-fetch existing SKUs in this batch to classify insert vs update
			const skusInBatch = rows
				.map((r) => (r.sku ?? "").trim())
				.filter(Boolean);
			const existingSkus = new Set<string>();
			if (skusInBatch.length > 0) {
				const { data: existing } = await withRetry(() =>
					supabase.from("inventory_items").select("sku").in("sku", skusInBatch),
				);
				for (const r of existing ?? []) {
					if (r.sku) existingSkus.add(r.sku as string);
				}
			}

			const tasks = rows.map((obj, i) => async (): Promise<ImportResultRow> => {
				const rowNum = rowOffset + i + 2;
				const sku = (obj.sku ?? "").trim();
				const name = (obj.name ?? "").trim();

				if (!sku || !name) {
					return {
						row: rowNum,
						primaryKey: sku || null,
						label: name || null,
						status: "skipped",
						message: "SKU / Name kosong",
					};
				}

				const cat = normalizeCategory(obj.category ?? "inventory");
				if (!cat) {
					return {
						row: rowNum,
						primaryKey: sku,
						label: name,
						status: "error",
						message: `Category tidak dikenal: "${obj.category}"`,
					};
				}

				const validation = ItemRowSchema.safeParse({
					sku,
					name,
					category: cat,
					unit: obj.unit || "pcs",
					min_stock_alert: obj.min_stock_alert || "0",
					purchase_price_avg: obj.purchase_price_avg || "0",
					purchase_price: obj.purchase_price || "",
					useful_life_months: obj.useful_life_months || "",
					notes: obj.notes || "",
					is_active: normalizeBool(obj.is_active),
				});

				if (!validation.success) {
					return {
						row: rowNum,
						primaryKey: sku,
						label: name,
						status: "error",
						message: validation.error.issues
							.map((iss) =>
								iss.path.length
									? `${iss.path.join(".")}: ${iss.message}`
									: iss.message,
							)
							.join("; "),
					};
				}

				const isUpdate = existingSkus.has(validation.data.sku);

				try {
					const { error } = await withRetry(() =>
						supabase
							.from("inventory_items")
							.upsert(
								{
									...validation.data,
									updated_at: new Date().toISOString(),
								},
								{ onConflict: "sku", ignoreDuplicates: false },
							),
					);
					if (error) throw new Error(error.message);
					return {
						row: rowNum,
						primaryKey: sku,
						label: name,
						status: isUpdate ? "updated" : "inserted",
						category: isUpdate ? "updated" : "inserted",
					};
				} catch (err) {
					return {
						row: rowNum,
						primaryKey: sku,
						label: name,
						status: "error",
						message: err instanceof Error ? err.message : "Unknown DB error",
					};
				}
			});

			const settled = await runWithConcurrency(tasks, PER_BATCH_CONCURRENCY);
			for (const s of settled) {
				if (s.status === "fulfilled") {
					const r = s.value;
					resultRows.push(r);
					if (r.status === "inserted") inserted++;
					else if (r.status === "updated") updated++;
					else if (r.status === "skipped") skipped++;
					else if (r.status === "error") errors++;
				} else {
					errors++;
					resultRows.push({
						row: rowOffset + 2,
						primaryKey: null,
						label: null,
						status: "error",
						message:
							s.reason instanceof Error ? s.reason.message : "Worker rejected",
					});
				}
			}

			revalidatePath("/settings/items");
			revalidatePath("/warehouse");

			return {
				totalRows: rows.length,
				stats: [
					{ label: "Inserted", value: inserted, tone: "emerald" },
					{ label: "Updated", value: updated, tone: "primary" },
					{ label: "Skipped", value: skipped, tone: "muted" },
					{
						label: "Errors",
						value: errors,
						tone: errors > 0 ? "rose" : "muted",
					},
				],
				rows: resultRows,
			};
		},
		PER_BATCH_TIMEOUT_MS,
		"items batch import",
	);
}
