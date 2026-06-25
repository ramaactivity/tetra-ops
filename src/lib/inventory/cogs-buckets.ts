// SKU → jenis (bucket) mapping for the Persediaan & COGS report grouping.
// Tetra has no category field on items, so we group consumables by the same
// HPP buckets the consumption engine uses (src/lib/rekap/recipe.ts), via a
// prefix-tolerant SKU map. Any unmapped SKU falls to "other" — never dropped.

export type CogsBucket =
	| "mediaset"
	| "sleeve"
	| "flashdisk"
	| "pouch"
	| "photomagnet"
	| "keychain"
	| "other";

/** Display order + Indonesian labels. */
export const COGS_BUCKETS: ReadonlyArray<{ key: CogsBucket; label: string }> = [
	{ key: "mediaset", label: "Mediaset" },
	{ key: "sleeve", label: "Sleeve" },
	{ key: "flashdisk", label: "Flashdisk" },
	{ key: "pouch", label: "Pouch" },
	{ key: "photomagnet", label: "Photomagnet" },
	{ key: "keychain", label: "Keychain" },
	{ key: "other", label: "Lainnya" },
];

const COGS_BUCKET_LABEL: Record<CogsBucket, string> = Object.fromEntries(
	COGS_BUCKETS.map((b) => [b.key, b.label]),
) as Record<CogsBucket, string>;

export function bucketLabel(b: CogsBucket): string {
	return COGS_BUCKET_LABEL[b];
}

/**
 * Canonical inventory ASSET account (1-2xx) per bucket. This is the SINGLE
 * source of truth so a bucket's purchases (Dr), COGS at settlement (Cr), opname
 * adjustments, and wastage all hit the SAME account — otherwise the GL inventory
 * asset drifts per-account from physical stock. Matches the bucket→COA wiring
 * hardcoded in _create_settlement_journal (1-200..1-205, 1-209).
 */
const BUCKET_INVENTORY_COA: Record<CogsBucket, string> = {
	mediaset: "1-200",
	sleeve: "1-201",
	flashdisk: "1-202",
	pouch: "1-203",
	photomagnet: "1-204",
	keychain: "1-205",
	other: "1-209",
};

/** Inventory asset COA for a SKU (via its bucket). Use everywhere inventory is
 *  debited/credited so purchases, COGS, opname, and wastage stay reconciled. */
export function inventoryCoaForSku(sku: string): string {
	return BUCKET_INVENTORY_COA[bucketForSku(sku)];
}

/** Map a SKU to its jenis bucket. Prefix-tolerant so future SKU variants land
 *  sensibly; explicit overrides win first. */
export function bucketForSku(sku: string): CogsBucket {
	const s = sku.toUpperCase().trim();
	if (s.startsWith("MEDIA")) return "mediaset";
	if (s.startsWith("SLEEVE")) return "sleeve";
	if (s.startsWith("FLASHDISK") || s.startsWith("FD")) return "flashdisk";
	if (s.startsWith("POUCH")) return "pouch";
	if (s.startsWith("PHOTOMAGNET") || s.startsWith("MAGNET"))
		return "photomagnet";
	if (s.startsWith("KEY")) return "keychain";
	return "other";
}
