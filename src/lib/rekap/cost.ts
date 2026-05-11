/**
 * Pure cost calculation for rekap consumption.
 *
 * Used both server-side (settlement-prefill.ts, planRekapDeduction) and
 * client-side (rekap-form live HPP preview). Pure function — no I/O, just
 * arithmetic over snapshots. Keeps server + client estimations consistent.
 */

import type { RekapField } from "@/lib/rekap-mapping/types";

export type MappedItem = {
	rekap_field: RekapField;
	item_id: string;
	qty_per_unit: number;
	purchase_price_avg: number;
};

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
 * Numbers are integer Rupiah (no decimal).
 */
export function computeRekapCost(
	quantities: RekapQuantities,
	mappings: MappedItem[],
	bonuses: BonusLine[],
	customs: CustomLine[],
): CostBuckets {
	const buckets: CostBuckets = { ...ZERO_BUCKETS };

	for (const m of mappings) {
		const qty = quantities[m.rekap_field] ?? 0;
		if (qty <= 0) continue;
		const cost = qty * m.qty_per_unit * m.purchase_price_avg;
		const key = FIELD_TO_BUCKET[m.rekap_field];
		buckets[key] = (buckets[key] ?? 0) + Math.round(cost);
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
