"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const DIRECTIONS = ["in", "out", "adjustment"] as const;
const SOURCES = [
	"manual_adjust",
	"purchase",
	"damage",
	"loss",
	"stock_take",
	"transfer",
] as const;

const StockMovementInputSchema = z.object({
	item_id: z.uuid("Item tidak valid"),
	direction: z.enum(DIRECTIONS, "Pilih arah"),
	/**
	 * Quantity in user-chosen unit. Backend converts to base unit via
	 * inventory_items.unit_conversion before persisting. Fractional OK
	 * (NUMERIC after Inventory v2 migration 2026-05-21).
	 */
	quantity: z.coerce.number().positive("Quantity harus > 0"),
	/**
	 * Unit the user typed in. Optional — defaults to item's base unit. If
	 * specified, must match a key in inventory_items.unit_conversion JSONB.
	 * E.g. "box" for MEDIA-BASIC (1 box = 700 lembar_4r in our model, but
	 * Tetra tracks rolls; future-proofing).
	 */
	quantity_unit: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	unit_cost: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.coerce.number().nonnegative().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	source: z.enum(SOURCES, "Pilih sumber"),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
});

export type StockMovementInput = z.infer<typeof StockMovementInputSchema>;
type SmErrors = Partial<Record<keyof StockMovementInput | "_form", string[]>>;
export type StockMovementFormState =
	| { errors?: SmErrors; values?: Record<string, string> }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function buildRefId(direction: (typeof DIRECTIONS)[number]) {
	const code = direction === "in" ? "I" : direction === "out" ? "O" : "A";
	return `MOV-${code}-${randomInt(10_000_000, 100_000_000)}`;
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = ["direction", "quantity", "unit_cost", "source", "notes"];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

export async function addStockMovement(
	itemId: string,
	_prev: StockMovementFormState,
	formData: FormData,
): Promise<StockMovementFormState> {
	const me = await requireOwnerLevel();

	const parsed = StockMovementInputSchema.safeParse({
		item_id: itemId,
		direction: formData.get("direction"),
		quantity: formData.get("quantity"),
		quantity_unit: formData.get("quantity_unit"),
		unit_cost: formData.get("unit_cost"),
		source: formData.get("source"),
		notes: formData.get("notes"),
	});

	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as SmErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const refId = buildRefId(parsed.data.direction);

	// Inventory v2: resolve quantity_unit against item.unit_conversion JSONB
	// to compute base-unit quantity. E.g. user inputs "5 box" for a MEDIA-BASIC
	// item whose conversion is {roll: 1, lembar_4r: 700, lembar_2r: 1400} —
	// if quantity_unit='roll' use as-is; if quantity_unit='box' we'd need
	// a box entry in conversion (none today; Tetra tracks rolls directly).
	// Item lookup is shared with the weighted-avg + negative-guard paths.
	const { data: itemRow } = await supabase
		.from("inventory_items")
		.select("unit, unit_conversion, purchase_price_avg")
		.eq("id", itemId)
		.maybeSingle();
	const baseUnit = itemRow?.unit ?? null;
	const conversion = (itemRow?.unit_conversion ?? {}) as Record<string, number>;
	const inputUnit = parsed.data.quantity_unit ?? baseUnit ?? null;

	let conversionFactor = 1;
	if (inputUnit && inputUnit !== baseUnit) {
		// quantity_unit MUST exist in unit_conversion for non-base inputs
		if (!(inputUnit in conversion)) {
			return {
				errors: {
					quantity_unit: [
						`Unit "${inputUnit}" tidak terdaftar di item ini. Pakai unit base "${baseUnit ?? ""}" atau update unit_conversion master.`,
					],
				},
				values: snapshotValues(formData),
			};
		}
		conversionFactor = Number(conversion[inputUnit]) || 1;
	}

	const baseUnitQuantity = parsed.data.quantity * conversionFactor;

	// Convert per-unit cost too — user types Rp per chosen unit; store per
	// base unit so weighted-avg stays in consistent units.
	const baseUnitCost =
		parsed.data.unit_cost !== null && conversionFactor !== 0
			? parsed.data.unit_cost / conversionFactor
			: parsed.data.unit_cost;

	// Negative-stock guard for direction='out': verify pre-insert stock can
	// cover the requested withdrawal. Prevents silent negative-balance drift
	// (old AUDIT_UI_UX §3.5 P0). Movements from server-side processes that
	// genuinely allow negatives (rekap_consumption, etc.) go through other
	// code paths (RPC commit_stock_take, settle_event); this server action
	// only covers manual UI-driven adjustments.
	if (parsed.data.direction === "out") {
		const { data: currentStock } = await supabase.rpc("get_current_stock", {
			p_item_id: itemId,
		});
		const stock = Math.max(0, Number(currentStock ?? 0));
		if (stock < baseUnitQuantity) {
			return {
				errors: {
					quantity: [
						`Stok saat ini cuma ${stock.toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${baseUnit ?? ""} — tidak bisa keluar ${baseUnitQuantity.toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${baseUnit ?? ""}.`,
					],
				},
				values: snapshotValues(formData),
			};
		}
	}

	// Force unit_cost on purchase-in to prevent weighted-avg drift
	// (old AUDIT_UI_UX §3.5 P0: "Weighted-avg cost can drift").
	if (
		parsed.data.direction === "in" &&
		parsed.data.source === "purchase" &&
		parsed.data.unit_cost === null
	) {
		return {
			errors: {
				unit_cost: [
					"Wajib isi harga beli untuk purchase — biar weighted-avg cost tetap akurat.",
				],
			},
			values: snapshotValues(formData),
		};
	}

	// For purchase-direction-in with unit_cost, compute weighted-average cost
	// BEFORE inserting the movement (need pre-insert stock count).
	const isPurchaseIn =
		parsed.data.direction === "in" &&
		parsed.data.source === "purchase" &&
		baseUnitCost !== null;

	let weightedAvg: number | null = null;
	if (isPurchaseIn) {
		const { data: stockRes } = await supabase.rpc("get_current_stock", {
			p_item_id: itemId,
		});
		const oldStock = Math.max(0, Number(stockRes ?? 0));
		const oldAvg = Number(itemRow?.purchase_price_avg ?? 0);
		const newQty = baseUnitQuantity;
		const newCost = baseUnitCost ?? 0;
		const totalStock = oldStock + newQty;
		weightedAvg =
			totalStock > 0
				? Math.round((oldStock * oldAvg + newQty * newCost) / totalStock)
				: Math.round(newCost);
	}

	// Memo the original input unit when conversion happened (audit trail)
	const noteWithUnit =
		inputUnit && inputUnit !== baseUnit
			? `${parsed.data.notes ? parsed.data.notes + " · " : ""}[Input: ${parsed.data.quantity} ${inputUnit} → ${baseUnitQuantity} ${baseUnit}]`
			: parsed.data.notes;

	const { error } = await supabase.from("stock_movements").insert({
		ref_id: refId,
		item_id: parsed.data.item_id,
		direction: parsed.data.direction,
		quantity: baseUnitQuantity,
		unit_cost: baseUnitCost,
		source: parsed.data.source,
		source_description: null,
		notes: noteWithUnit,
		performed_by: me.authId,
	});

	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	if (isPurchaseIn && weightedAvg !== null) {
		await supabase
			.from("inventory_items")
			.update({
				purchase_price_avg: weightedAvg,
				updated_at: new Date().toISOString(),
			})
			.eq("id", itemId);
	}

	revalidatePath("/warehouse");
	return undefined;
}
