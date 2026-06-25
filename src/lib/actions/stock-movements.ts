"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAdjustmentJournal } from "@/lib/actions/wastage";
import { getCurrentUser } from "@/lib/auth/get-user";
import { normalizeConversion, toBase } from "@/lib/inventory/unit-conversion";
import { createClient } from "@/lib/supabase/server";

/** Source koreksi yang wajib ikut posting jurnal Persediaan↔Wastage. */
const ADJUST_JOURNAL_SOURCES = new Set(["stock_take", "damage", "loss"]);

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
	// nullish (bukan optional): formData.get() mengembalikan null saat field
	// absen — Adjust Stok tak pernah kirim quantity_unit. optional() hanya
	// izinkan undefined → null bikin Zod throw "expected string, received null".
	quantity_unit: z
		.string()
		.trim()
		.nullish()
		.transform((v) => (v ? v : null)),
	unit_cost: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.coerce.number().nonnegative().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	source: z.enum(SOURCES, "Pilih sumber"),
	supplier_id: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : String(v)),
			z.string().uuid("Supplier tidak valid").nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	notes: z
		.string()
		.trim()
		.max(500)
		.nullish()
		.transform((v) => (v ? v : null)),
});

export type StockMovementInput = z.infer<typeof StockMovementInputSchema>;
type SmErrors = Partial<Record<keyof StockMovementInput | "_form", string[]>>;
export type StockMovementFormState =
	| { errors?: SmErrors; values?: Record<string, string>; ok?: boolean }
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
	try {
		const me = await requireOwnerLevel();

		const parsed = StockMovementInputSchema.safeParse({
			item_id: itemId,
			direction: formData.get("direction"),
			quantity: formData.get("quantity"),
			quantity_unit: formData.get("quantity_unit"),
			unit_cost: formData.get("unit_cost"),
			source: formData.get("source"),
			supplier_id: formData.get("supplier_id"),
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
		const conversionMap = baseUnit
			? normalizeConversion(itemRow?.unit_conversion, baseUnit)
			: null;
		const inputUnit = parsed.data.quantity_unit ?? baseUnit ?? null;

		let baseUnitQuantity: number;
		let perUnitToBaseRatio = 1;
		if (inputUnit && conversionMap) {
			try {
				baseUnitQuantity = toBase(
					parsed.data.quantity,
					inputUnit,
					conversionMap,
				);
				perUnitToBaseRatio = toBase(1, inputUnit, conversionMap);
			} catch {
				return {
					errors: {
						quantity_unit: [
							`Unit "${inputUnit}" tidak terdaftar di item ini. Pakai unit base "${baseUnit ?? ""}" atau update unit_conversion master.`,
						],
					},
					values: snapshotValues(formData),
				};
			}
		} else {
			baseUnitQuantity = parsed.data.quantity;
		}

		// Convert per-unit cost too — user types Rp per chosen unit; store per
		// base unit so weighted-avg stays in consistent units.
		const baseUnitCost =
			parsed.data.unit_cost !== null && perUnitToBaseRatio !== 0
				? parsed.data.unit_cost / perUnitToBaseRatio
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

		// For purchase-direction-in with unit_cost, recompute weighted-average cost
		// via the atomic row-locking RPC AFTER inserting the movement (the RPC reads
		// post-insert on-hand). Centralizes the formula with purchases/PR-receive.
		const isPurchaseIn =
			parsed.data.direction === "in" &&
			parsed.data.source === "purchase" &&
			baseUnitCost !== null;

		// Memo the original input unit when conversion happened (audit trail)
		const noteWithUnit =
			inputUnit && inputUnit !== baseUnit
				? `${parsed.data.notes ? parsed.data.notes + " · " : ""}[Input: ${parsed.data.quantity} ${inputUnit} → ${baseUnitQuantity} ${baseUnit}]`
				: parsed.data.notes;

		const { data: inserted, error } = await supabase
			.from("stock_movements")
			.insert({
				ref_id: refId,
				item_id: parsed.data.item_id,
				direction: parsed.data.direction,
				quantity: baseUnitQuantity,
				quantity_unit: inputUnit && inputUnit !== baseUnit ? inputUnit : null,
				quantity_in_unit:
					inputUnit && inputUnit !== baseUnit ? parsed.data.quantity : null,
				unit_cost: baseUnitCost,
				source: parsed.data.source,
				source_description: null,
				supplier_id: parsed.data.supplier_id,
				notes: noteWithUnit,
				performed_by: me.authId,
			})
			.select("id")
			.single();

		if (error) {
			return {
				errors: { _form: [error.message] },
				values: snapshotValues(formData),
			};
		}

		// Auto-jurnal koreksi non-pembelian (opname/damage/loss) supaya GL
		// Persediaan ikut bergerak — tanpa ini nilai stok berubah tapi GL diam
		// → drift (ke-flag reconciliation-check, tak auto-heal). Purchase punya
		// jalur jurnalnya sendiri; transfer/manual_adjust sengaja dilewati.
		// Best-effort: stock_movements tetap canonical, gagal jurnal cukup di-log.
		if (
			ADJUST_JOURNAL_SOURCES.has(parsed.data.source) &&
			(parsed.data.direction === "in" || parsed.data.direction === "out")
		) {
			const jr = await recordAdjustmentJournal(supabase, {
				item_id: parsed.data.item_id,
				qty_base: baseUnitQuantity,
				direction: parsed.data.direction,
				stock_movement_id: inserted?.id ?? null,
				reported_by: me.authId,
				label:
					parsed.data.source === "stock_take" ? "opname" : parsed.data.source,
			});
			if (!jr.ok) {
				console.error(
					`[stock-movements] adjust journal failed for ${itemId}:`,
					jr.error,
				);
			}
		}

		if (isPurchaseIn && baseUnitCost !== null) {
			const { error: avgErr } = await supabase.rpc(
				"recompute_weighted_avg_cost",
				{
					p_item_id: itemId,
					p_incoming_qty: baseUnitQuantity,
					p_incoming_cost: baseUnitCost,
				},
			);
			if (avgErr) {
				console.error(
					`[stock-movements] recompute_weighted_avg_cost failed for ${itemId}:`,
					avgErr.message,
				);
			}
		}

		revalidatePath("/warehouse");
		return { ok: true };
	} catch (e) {
		// Tanpa ini, throw (mis. requireOwnerLevel "Forbidden"/"Unauthorized")
		// ditelan useActionState secara senyap → tombol "Catat Adjust" seolah
		// tidak melakukan apa-apa. Ubah jadi _form error yang tampil di UI.
		const msg = e instanceof Error ? e.message : "Gagal mencatat adjust stok.";
		console.error("[stock-movements] addStockMovement threw:", msg);
		return { errors: { _form: [msg] }, values: snapshotValues(formData) };
	}
}
