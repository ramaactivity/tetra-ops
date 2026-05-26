/**
 * Pure cost calculation for rekap consumption.
 *
 * Used both server-side (settlement-prefill.ts, planRekapDeduction) and
 * client-side (rekap-form live HPP preview). Pure function — no I/O, just
 * arithmetic over snapshots. Keeps server + client estimations consistent.
 *
 * v2 (2026-05-18): frame-size-aware. The caller passes ALL mappings (one
 * per frame_size variant), and computeRekapCost resolves the right one
 * per field via resolveMappedItem().
 */

import { normalizeConversion, toBase } from "@/lib/inventory/unit-conversion";
import { resolveMapping } from "@/lib/rekap/resolver";
import type { RekapField } from "@/lib/rekap-mapping/types";

export type MappedItem = {
	rekap_field: RekapField;
	frame_size: string; // '' = default fallback
	item_id: string;
	qty_per_unit: number;
	purchase_price_avg: number;
	/** Item's base unit (e.g., 'roll', 'pcs') — used untuk konversi media/sleeve. */
	base_unit?: string;
	/** Item's unit_conversion JSONB — used untuk derive ratio media/sleeve. */
	unit_conversion?: unknown;
};

/**
 * Derive qty_per_unit untuk media_set_used + sleeve_used dari
 * unit_conversion (matches backend planRekapDeduction SIZE_RECIPE).
 * rekap_field_mapping.qty_per_unit DIABAIKAN untuk derived fields karena
 * backend ignore it juga. Fallback ke mapping value kalau lookup gagal.
 */
export function deriveRekapRatio(
	field: RekapField,
	frameSize: string,
	mapped: MappedItem,
): number {
	if (field === "sleeve_used") return 1; // backend: 1:1 with cetak
	if (field !== "media_set_used") return mapped.qty_per_unit;
	const lembarUnit =
		frameSize === "4R"
			? "lembar_4r"
			: frameSize === "2R"
				? "lembar_2r"
				: frameSize === "polaroid"
					? "lembar_polaroid"
					: null;
	if (!lembarUnit) return mapped.qty_per_unit;
	if (!mapped.base_unit || !mapped.unit_conversion) return mapped.qty_per_unit;
	try {
		const conv = normalizeConversion(mapped.unit_conversion, mapped.base_unit);
		return toBase(1, lembarUnit, conv);
	} catch {
		// Hardcoded fallback matching backend SIZE_RECIPE
		if (lembarUnit === "lembar_4r") return 1 / 700;
		return 1 / 1400;
	}
}

export type BonusLine = {
	addon_id: string;
	quantity: number;
	purchase_price_avg: number; // 0 if addon not linked to inventory
};

export type CustomLine = {
	sku: string;
	quantity: number;
	purchase_price_avg: number;
};

export type RekapQuantities = Record<RekapField, number>;

export type CostBuckets = {
	mediaset: number;
	sleeve: number;
	flashdisk: number;
	pouch: number;
	photomagnet: number;
	keychain: number;
	bonus: number;
	other: number; // cetak_total + custom materials
};

const FIELD_TO_BUCKET: Record<RekapField, keyof CostBuckets> = {
	cetak_total: "other",
	media_set_used: "mediaset",
	sleeve_used: "sleeve",
	flashdisk_used: "flashdisk",
	pouch_used: "pouch",
	photomagnet_used: "photomagnet",
	keychain_used: "keychain",
};

export const ZERO_BUCKETS: CostBuckets = {
	mediaset: 0,
	sleeve: 0,
	flashdisk: 0,
	pouch: 0,
	photomagnet: 0,
	keychain: 0,
	bonus: 0,
	other: 0,
};

/**
 * Compute HPP per-bucket from rekap quantities, mappings, bonus list,
 * and custom material entries. All snapshots are inputs — no DB calls.
 *
 * v2: pass frame_size; the function resolves which mapping row applies
 * for each rekap_field. mappings array may contain multiple rows per
 * field (one per frame_size + a '' default).
 *
 * Numbers are integer Rupiah (no decimal).
 */
export function computeRekapCost(
	quantities: RekapQuantities,
	mappings: MappedItem[],
	bonuses: BonusLine[],
	customs: CustomLine[],
	frameSize = "",
): CostBuckets {
	const buckets: CostBuckets = { ...ZERO_BUCKETS };

	// Resolve mapping per field for the event's frame_size
	const fields: RekapField[] = [
		"cetak_total",
		"media_set_used",
		"sleeve_used",
		"flashdisk_used",
		"pouch_used",
		"photomagnet_used",
		"keychain_used",
	];
	for (const field of fields) {
		const qty = quantities[field] ?? 0;
		if (qty <= 0) continue;
		// resolveMapping needs MappingRow shape; adapt
		const m = resolveMapping(
			field,
			frameSize,
			mappings.map((mp) => ({
				rekap_field: mp.rekap_field,
				frame_size: mp.frame_size,
				item_id: mp.item_id,
				qty_per_unit: mp.qty_per_unit,
				is_active: true,
			})),
		);
		if (!m || !m.item_id) continue;
		// Look up purchase_price_avg from original mapping array
		const orig = mappings.find(
			(mp) =>
				mp.rekap_field === m.rekap_field &&
				mp.frame_size === m.frame_size,
		);
		const price = orig?.purchase_price_avg ?? 0;
		// derived ratio for media/sleeve via unit_conversion (matches backend);
		// raw qty_per_unit for everything else.
		const ratio = orig
			? deriveRekapRatio(field, frameSize, orig)
			: m.qty_per_unit;
		const cost = qty * ratio * price;
		const bucket = FIELD_TO_BUCKET[field];
		buckets[bucket] = (buckets[bucket] ?? 0) + Math.round(cost);
	}

	for (const b of bonuses) {
		if (b.quantity <= 0) continue;
		buckets.bonus += Math.round(b.quantity * b.purchase_price_avg);
	}

	for (const c of customs) {
		if (c.quantity <= 0) continue;
		buckets.other += Math.round(c.quantity * c.purchase_price_avg);
	}

	return buckets;
}

export function sumBuckets(buckets: CostBuckets): number {
	return (
		buckets.mediaset +
		buckets.sleeve +
		buckets.flashdisk +
		buckets.pouch +
		buckets.photomagnet +
		buckets.keychain +
		buckets.bonus +
		buckets.other
	);
}
