"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export type ImportResultRow = {
	row: number;
	sku: string | null;
	name: string | null;
	status: "inserted" | "updated" | "skipped" | "error";
	message?: string;
};

export type ImportResult = {
	totalRows: number;
	inserted: number;
	updated: number;
	skipped: number;
	errors: number;
	rows: ImportResultRow[];
};

export type ImportFormState =
	| { result?: ImportResult; error?: string; values?: { csv: string } }
	| undefined;

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

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const HEADER_ALIASES: Record<string, string> = {
	// Phase-2 sheet headers (SYS_ITEMS.csv) → our schema
	item_id: "sku",
	item_name: "name",
	standard_cost_rp: "purchase_price_avg",
	reorder_level: "min_stock_alert",
	is_active: "is_active",
	purchase_price: "purchase_price",
	useful_life_months: "useful_life_months",
	notes: "notes",
	// Already-aligned
	sku: "sku",
	name: "name",
	category: "category",
	unit: "unit",
	min_stock_alert: "min_stock_alert",
	purchase_price_avg: "purchase_price_avg",
};

function normalizeKey(k: string): string {
	return k.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeCategory(raw: string): "consumable" | "equipment" | null {
	const v = raw.trim().toLowerCase();
	if (v === "consumable" || v === "consumables") return "consumable";
	if (v === "equipment" || v === "alat" || v === "equipment_owned") {
		return "equipment";
	}
	if (v === "packaging" || v === "uniform") return "consumable"; // collapse
	return null;
}

function normalizeBool(raw: string | undefined): boolean {
	if (!raw) return true;
	const v = raw.trim().toLowerCase();
	return v === "true" || v === "1" || v === "y" || v === "yes" || v === "ya";
}

/**
 * Lightweight CSV parser — handles quoted fields with embedded commas.
 * No streaming, fine for small admin imports (< 500 rows).
 */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cur = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cur += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ",") {
				row.push(cur);
				cur = "";
			} else if (ch === "\n") {
				row.push(cur);
				rows.push(row);
				row = [];
				cur = "";
			} else if (ch === "\r") {
				// skip
			} else {
				cur += ch;
			}
		}
	}
	if (cur.length > 0 || row.length > 0) {
		row.push(cur);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export async function importItemsFromCsv(
	_prev: ImportFormState,
	formData: FormData,
): Promise<ImportFormState> {
	await requireOwnerLevel();

	const csv = String(formData.get("csv") ?? "").trim();
	if (!csv) {
		return { error: "Tempel CSV dulu", values: { csv: "" } };
	}

	let parsed: string[][];
	try {
		parsed = parseCsv(csv);
	} catch (e) {
		return {
			error: `CSV parse error: ${e instanceof Error ? e.message : "unknown"}`,
			values: { csv },
		};
	}

	if (parsed.length < 2) {
		return {
			error: "Minimal 2 baris (header + 1 data row)",
			values: { csv },
		};
	}

	const headers = parsed[0].map((h) => HEADER_ALIASES[normalizeKey(h)] ?? "");
	const dataRows = parsed.slice(1);

	const result: ImportResult = {
		totalRows: dataRows.length,
		inserted: 0,
		updated: 0,
		skipped: 0,
		errors: 0,
		rows: [],
	};

	const supabase = await createClient();

	for (let i = 0; i < dataRows.length; i++) {
		const rowNum = i + 2; // +1 for header, +1 for human numbering
		const cells = dataRows[i];
		const obj: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			const key = headers[j];
			if (!key) continue;
			obj[key] = (cells[j] ?? "").toString().trim();
		}

		const sku = obj.sku;
		const name = obj.name;
		if (!sku || !name) {
			result.skipped++;
			result.rows.push({
				row: rowNum,
				sku: sku ?? null,
				name: name ?? null,
				status: "skipped",
				message: "SKU / Name kosong",
			});
			continue;
		}

		const cat = normalizeCategory(obj.category ?? "consumable");
		if (!cat) {
			result.errors++;
			result.rows.push({
				row: rowNum,
				sku,
				name,
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
			result.errors++;
			result.rows.push({
				row: rowNum,
				sku,
				name,
				status: "error",
				message: validation.error.issues
					.map((iss) => `${iss.path.join(".")}: ${iss.message}`)
					.join("; "),
			});
			continue;
		}

		// Upsert by SKU (UNIQUE in schema)
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
				result.errors++;
				result.rows.push({
					row: rowNum,
					sku,
					name,
					status: "error",
					message: error.message,
				});
			} else {
				result.updated++;
				result.rows.push({ row: rowNum, sku, name, status: "updated" });
			}
		} else {
			const { error } = await supabase
				.from("inventory_items")
				.insert(validation.data);
			if (error) {
				result.errors++;
				result.rows.push({
					row: rowNum,
					sku,
					name,
					status: "error",
					message: error.message,
				});
			} else {
				result.inserted++;
				result.rows.push({ row: rowNum, sku, name, status: "inserted" });
			}
		}
	}

	revalidatePath("/settings/items");
	revalidatePath("/warehouse");
	return { result, values: { csv } };
}
