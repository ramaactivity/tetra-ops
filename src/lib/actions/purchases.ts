"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const PurchaseLineSchema = z.object({
	item_id: z.uuid(),
	quantity: z.coerce.number().positive(),
	quantity_unit: z.string().trim().min(1).max(20),
	unit_cost: z.coerce.number().int().nonnegative(),
	notes: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => (v ? v : null)),
});

const PurchaseBatchSchema = z.object({
	supplier_id: z.uuid().optional().nullable(),
	purchase_date: z.string().trim(),
	payment_method: z.enum(["cash", "top_7", "top_14", "top_30", "top_60", "top_custom"]),
	top_days: z.coerce.number().int().nonnegative().max(365).default(0),
	invoice_no: z
		.string()
		.trim()
		.max(60)
		.optional()
		.transform((v) => (v ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	pr_id: z.uuid().optional().nullable(),
	lines: z
		.string()
		.transform((v) => {
			try {
				return JSON.parse(v);
			} catch {
				return [];
			}
		})
		.pipe(z.array(PurchaseLineSchema).min(1, "Minimal 1 baris belanja")),
});

type PurchaseErrors = {
	supplier_id?: string[];
	purchase_date?: string[];
	payment_method?: string[];
	lines?: string[];
	_form?: string[];
};

export type PurchaseFormState =
	| {
			errors?: PurchaseErrors;
			values?: Record<string, string>;
			success?: true;
			movementsCreated?: number;
	  }
	| undefined;

/**
 * Multi-line purchase recording.
 * - Resolves quantity_unit via inventory_items.unit_conversion JSONB → base qty.
 * - Per-line: insert one stock_movement (direction=in, source=purchase) with
 *   supplier_id attribution and unit_cost (converted to per-base-unit).
 * - Updates inventory_items.purchase_price_avg using weighted-avg with the
 *   pre-purchase stock from get_current_stock RPC.
 * - All-or-nothing: if any line fails validation we abort before inserting.
 *
 * Idempotency note: this does NOT prevent double-submits via a unique ref.
 * Owner relies on the multi-line preview + confirm dialog to avoid dupes.
 */
export async function recordPurchaseBatch(
	_prev: PurchaseFormState,
	formData: FormData,
): Promise<PurchaseFormState> {
	const me = await requireOwnerLevel();

	const parsed = PurchaseBatchSchema.safeParse({
		supplier_id: formData.get("supplier_id") || null,
		purchase_date: formData.get("purchase_date") || new Date().toISOString(),
		payment_method: formData.get("payment_method") || "cash",
		top_days: formData.get("top_days") || 0,
		invoice_no: formData.get("invoice_no"),
		notes: formData.get("notes"),
		pr_id: formData.get("pr_id") || null,
		lines: formData.get("lines") ?? "[]",
	});

	if (!parsed.success) {
		const flat = parsed.error.flatten();
		return {
			errors: flat.fieldErrors as PurchaseErrors,
		};
	}

	const supabase = await createClient();

	// Resolve all referenced items in one query for unit_conversion lookup
	const itemIds = Array.from(new Set(parsed.data.lines.map((l) => l.item_id)));
	const { data: items, error: itemsErr } = await supabase
		.from("inventory_items")
		.select("id, unit, unit_conversion, purchase_price_avg")
		.in("id", itemIds);
	if (itemsErr) {
		return { errors: { _form: [itemsErr.message] } };
	}
	const byItem = new Map((items ?? []).map((i) => [i.id as string, i]));

	const purchaseDateIso = new Date(parsed.data.purchase_date).toISOString();
	const movements: Array<{
		ref_id: string;
		item_id: string;
		direction: "in";
		quantity: number;
		unit_cost: number;
		source: string;
		source_id: string | null;
		source_description: string;
		notes: string | null;
		performed_by: string;
		supplier_id: string | null;
		created_at: string;
	}> = [];

	// Validate units + compute base qty for each line
	for (const line of parsed.data.lines) {
		const it = byItem.get(line.item_id);
		if (!it) {
			return {
				errors: { _form: [`Item ${line.item_id} tidak ditemukan`] },
			};
		}
		const baseUnit = it.unit as string;
		const conv =
			(it.unit_conversion as Record<string, number> | null) ?? null;
		let multiplier = 1;
		if (line.quantity_unit !== baseUnit) {
			if (conv && conv[line.quantity_unit] !== undefined) {
				multiplier = conv[line.quantity_unit];
			} else {
				return {
					errors: {
						lines: [
							`Unit "${line.quantity_unit}" tidak dikenal untuk item ${line.item_id}`,
						],
					},
				};
			}
		}
		const baseQty = line.quantity * multiplier;
		const baseUnitCost =
			multiplier > 0 ? Math.round(line.unit_cost / multiplier) : line.unit_cost;

		const refId = `MOV-I-${Math.floor(Math.random() * 99_999_999)
			.toString()
			.padStart(8, "0")}`;

		const lineNotes = [
			line.quantity_unit !== baseUnit
				? `[${line.quantity} ${line.quantity_unit} → ${baseQty} ${baseUnit}]`
				: null,
			line.notes,
		]
			.filter(Boolean)
			.join(" ");

		movements.push({
			ref_id: refId,
			item_id: line.item_id,
			direction: "in",
			quantity: baseQty,
			unit_cost: baseUnitCost,
			source: "purchase",
			source_id: parsed.data.pr_id ?? null,
			source_description: parsed.data.invoice_no
				? `Pembelian inv ${parsed.data.invoice_no}`
				: "Pembelian",
			notes: lineNotes || null,
			performed_by: me.profile.id,
			supplier_id: parsed.data.supplier_id ?? null,
			created_at: purchaseDateIso,
		});
	}

	const { error: insErr } = await supabase
		.from("stock_movements")
		.insert(movements);
	if (insErr) {
		return { errors: { _form: [insErr.message] } };
	}

	// Update weighted-avg cost per item
	for (const itemId of itemIds) {
		const lineForItem = movements.find((m) => m.item_id === itemId);
		if (!lineForItem) continue;
		const it = byItem.get(itemId);
		if (!it) continue;

		const { data: stockData } = await supabase.rpc("get_current_stock", {
			p_item_id: itemId,
		});
		const newStock = Number(stockData ?? 0);
		const oldAvg = Number(it.purchase_price_avg ?? 0);
		const oldStock = newStock - lineForItem.quantity;
		if (newStock > 0 && oldStock >= 0) {
			const newAvg =
				(oldStock * oldAvg + lineForItem.quantity * lineForItem.unit_cost) /
				newStock;
			await supabase
				.from("inventory_items")
				.update({
					purchase_price_avg: Math.round(newAvg),
					updated_at: new Date().toISOString(),
				})
				.eq("id", itemId);
		}
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/purchases");
	revalidatePath("/warehouse/purchase-requests");
	return { success: true, movementsCreated: movements.length };
}
