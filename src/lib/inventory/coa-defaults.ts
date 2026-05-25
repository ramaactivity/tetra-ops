/**
 * Default Chart of Accounts mapping per item kategori + sub-kelas (by SKU
 * prefix). Dipakai saat create item baru: server action auto-set kolom
 * coa_account_* di satellite config kalau user tidak override eksplisit.
 *
 * Sumber kebenaran: chart_of_accounts table di Supabase (lihat seed di
 * `20260520_chart_of_accounts_extra_seed.sql` + migration ini).
 *
 * Owner bisa override per-item via UI edit. Defaults ini hanya seed awal.
 */

export type InventoryCoaDefaults = {
	inventory: string; // 1-2xx (asset)
	cogs: string; // 5-1xx (expense)
	wastage: string; // 5-510 (expense, separate from regular COGS)
};

export type FixedAssetCoaDefaults = {
	asset: string; // 1-400 (asset)
	accum_depr: string; // 1-401 (contra-asset)
	depr_expense: string; // 5-500 (expense)
};

/** Standard wastage account — shared by all inventory items. */
const WASTAGE_ACCOUNT = "5-510";

/**
 * SKU-prefix-based defaults untuk inventory items.
 * Order matters — first match wins. Fallback ke 1-209 / 5-109.
 */
const INVENTORY_PREFIX_DEFAULTS: Array<{
	pattern: RegExp;
	defaults: InventoryCoaDefaults;
}> = [
	{
		pattern: /^MEDIA-BASIC/i,
		defaults: { inventory: "1-206", cogs: "5-100", wastage: WASTAGE_ACCOUNT },
	},
	{
		pattern: /^MEDIA-PERF/i,
		defaults: { inventory: "1-207", cogs: "5-100", wastage: WASTAGE_ACCOUNT },
	},
	{
		pattern: /^MEDIA-/i,
		defaults: { inventory: "1-200", cogs: "5-100", wastage: WASTAGE_ACCOUNT },
	},
	{
		pattern: /^SLEEVE-/i,
		defaults: { inventory: "1-201", cogs: "5-101", wastage: WASTAGE_ACCOUNT },
	},
	{
		pattern: /^FLASHDISK|^FD-/i,
		defaults: { inventory: "1-202", cogs: "5-102", wastage: WASTAGE_ACCOUNT },
	},
	{
		pattern: /^POUCH/i,
		defaults: { inventory: "1-203", cogs: "5-103", wastage: WASTAGE_ACCOUNT },
	},
	{
		pattern: /^PHOTOMAGNET/i,
		defaults: { inventory: "1-204", cogs: "5-104", wastage: WASTAGE_ACCOUNT },
	},
	{
		pattern: /^KEY-|^KEYCHAIN/i,
		defaults: { inventory: "1-205", cogs: "5-105", wastage: WASTAGE_ACCOUNT },
	},
];

const INVENTORY_FALLBACK: InventoryCoaDefaults = {
	inventory: "1-209",
	cogs: "5-109",
	wastage: WASTAGE_ACCOUNT,
};

const FIXED_ASSET_DEFAULTS: FixedAssetCoaDefaults = {
	asset: "1-400",
	accum_depr: "1-401",
	depr_expense: "5-500",
};

export function defaultsForInventorySku(sku: string): InventoryCoaDefaults {
	for (const { pattern, defaults } of INVENTORY_PREFIX_DEFAULTS) {
		if (pattern.test(sku)) return defaults;
	}
	return INVENTORY_FALLBACK;
}

export function defaultsForFixedAsset(): FixedAssetCoaDefaults {
	return FIXED_ASSET_DEFAULTS;
}
