/**
 * Capitalization policy — when does equipment count as a depreciated fixed
 * asset vs. an immediate expense?
 *
 * Owner rule: capitalize + depreciate ONLY IF
 *   purchase_price > Rp 1,500,000  AND  useful_life_months >= 24 (2 years).
 * Otherwise the item is expensed (langsung habis, tanpa penyusutan) — it can
 * still be tracked physically, but it never hits the asset register or the
 * depreciation engine.
 *
 * Mirrored server-side in 20260624_asset_capitalization_policy.sql (the
 * depreciation RPC + the items_fixed_asset_config.is_capitalized flag).
 */

export const ASSET_MIN_PRICE = 1_500_000;
export const ASSET_MIN_LIFE_MONTHS = 24;

/** True when an item qualifies as a capitalized, depreciated fixed asset. */
export function qualifiesAsFixedAsset(
	purchasePrice: number,
	usefulLifeMonths: number | null | undefined,
): boolean {
	const price = Number(purchasePrice) || 0;
	const life = Number(usefulLifeMonths) || 0;
	return price > ASSET_MIN_PRICE && life >= ASSET_MIN_LIFE_MONTHS;
}

/** Human-readable policy line for UI hints. */
export const CAPITALIZATION_POLICY_LABEL =
	"Aset tetap (disusutkan) = harga di atas Rp1.500.000 DAN umur pakai minimal 2 tahun. Di bawah itu dicatat sebagai beban, langsung habis.";
