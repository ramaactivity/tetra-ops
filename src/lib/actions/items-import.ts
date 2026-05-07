"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import type { ImportResult } from "@/lib/csv-import/types";
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
	category: z.enum(["consumable", "equipment"]),
	unit: z.string().trim().min(1).max(20),
	min_stock_alert: z.coerce.number().int().nonnegative().default(0),
	purchase_price_avg: z.coerce.number().int().nonnegative().default(0),
	purchase_price: z
		.union([z.coerce.number().int().nonnegative(), z.literal("")])
		.optional()
		.transform((v) => (typeof v === "number" ? v : null)),
	useful_life_months: z
		.union([z.coerce.number().int().positive(), z.literal("")])
		.optional()
		.transform((v) => (typeof v === "number" ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	is_active: z.coerce.boolean().default(true),
});

function normalizeCategory(raw: string): "consumable" | "equipment" | null {
	const v = raw.trim().toLowerCase();
	if (v === "consumable" || v === "consumables") return "consumable";
	if (v === "equipment" || v === "alat" || v === "equipment_owned") {
		return "equipment";
	}
	if (v === "packaging" || v === "uniform") return "consumable";
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
	if (skus.length === 0) return [];
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("inventory_items")
		.select("sku")
		.in("sku", skus);
	if (error) throw new Error(`Duplicate check: ${error.message}`);
	return (data ?? []).map((r) => r.sku as string);
}

// ─────────────────────────────────────────────────────────────────────────
// Public action 2 — commit (upsert by SKU)
// ─────────────────────────────────────────────────────────────────────────

export async function commitItemImport(
	rows: Record<string, string>[],
	rowOffset = 0,
): Promise<ImportResult> {
	await requireOwnerLevel();
	const supabase = await createClient();

	let inserted = 0;
	let updated = 0;
	let skipped = 0;
	let errors = 0;
	const resultRows: ImportResult["rows"] = [];

	for (let i = 0; i < rows.length; i++) {
		const rowNum = rowOffset + i + 2;
		const obj = rows[i];
		const sku = (obj.sku ?? "").trim();
		const name = (obj.name ?? "").trim();

		if (!sku || !name) {
			skipped++;
			resultRows.push({
				row: rowNum,
				primaryKey: sku || null,
				label: name || null,
				status: "skipped",
				message: "SKU / Name kosong",
			});
			continue;
		}

		const cat = normalizeCategory(obj.category ?? "consumable");
		if (!cat) {
			errors++;
			resultRows.push({
				row: rowNum,
				primaryKey: sku,
				label: name,
				status: "error",
				message: `Category tidak dikenal: "${obj.category}"`,
			});
			continue;
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
			errors++;
			resultRows.push({
				row: rowNum,
				primaryKey: sku,
				label: name,
				status: "error",
				message: validation.error.issues
					.map((iss) => `${iss.path.join(".")}: ${iss.message}`)
					.join("; "),
			});
			continue;
		}

		const { data: existing } = await supabase
			.from("inventory_items")
			.select("id")
			.eq("sku", validation.data.sku)
			.maybeSingle();

		if (existing) {
			const { error } = await supabase
				.from("inventory_items")
				.update({
					...validation.data,
					updated_at: new Date().toISOString(),
				})
				.eq("id", existing.id);
			if (error) {
				errors++;
				resultRows.push({
					row: rowNum,
					primaryKey: sku,
					label: name,
					status: "error",
					message: error.message,
				});
			} else {
				updated++;
				resultRows.push({
					row: rowNum,
					primaryKey: sku,
					label: name,
					status: "updated",
					category: "updated",
				});
			}
		} else {
			const { error } = await supabase
				.from("inventory_items")
				.insert(validation.data);
			if (error) {
				errors++;
				resultRows.push({
					row: rowNum,
					primaryKey: sku,
					label: name,
					status: "error",
					message: error.message,
				});
			} else {
				inserted++;
				resultRows.push({
					row: rowNum,
					primaryKey: sku,
					label: name,
					status: "inserted",
					category: "inserted",
				});
			}
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
			{ label: "Errors", value: errors, tone: errors > 0 ? "rose" : "muted" },
		],
		rows: resultRows,
	};
}
