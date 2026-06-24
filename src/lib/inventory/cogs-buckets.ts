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
