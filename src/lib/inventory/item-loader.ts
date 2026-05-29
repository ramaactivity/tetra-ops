import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Discriminated union loader for items + per-category satellite config.
 *
 * Schema (post `20260526_item_ingestion_refactor.sql`):
 *   - inventory_items: shared identity (id, sku, name, category, ...)
 *   - items_inventory_config: per-inventory fields (base_unit, unit_conversion, ...)
 *   - items_fixed_asset_config: per-fixed-asset fields (asset_number, purchase_price, ...)
 *
 * Always use this loader instead of direct inventory_items SELECT when you
 * need category-specific fields. Returns narrowed shape via discriminant.
 */

export type ItemCategory = "inventory" | "fixed_asset";

export type ItemBase = {
	id: string;
	sku: string;
	name: string;
	category: ItemCategory;
	unit: string;
	coa_account: string | null;
	is_active: boolean;
	image_url: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	// Canonical avg cost — purchases & stock-movements update THIS (base) col.
	// Satellite items_inventory_config.purchase_price_avg can lag, jadi loader
	// override config value dengan yang ini. (Phase 5 fix.)
	purchase_price_avg: number | null;
};

export type InventoryConfig = {
	item_id: string;
	base_unit: string;
	unit_conversion: unknown; // v2 JSONB shape — see lib/inventory/unit-conversion
	min_stock_alert: number;
	purchase_price_avg: number;
	selling_price: number | null;
	preferred_supplier_id: string | null;
	is_bom_component: boolean;
	coa_account_inventory: string | null;
	coa_account_cogs: string | null;
	coa_account_wastage: string | null;
};

export type FixedAssetConfig = {
	item_id: string;
	asset_number: string | null;
	serial_number: string | null;
	purchase_price: number;
	purchase_date: string | null;
	salvage_value: number;
	useful_life_months: number | null;
	depreciation_method: "straight_line" | "none";
	depreciation_start_date: string | null;
	condition: string | null;
	current_location: string | null;
	current_event_id: string | null;
	current_crew_id: string | null;
	coa_account_asset: string | null;
	coa_account_accum_depr: string | null;
	coa_account_depr_expense: string | null;
};

export type LoadedItem =
	| { kind: "inventory"; base: ItemBase; config: InventoryConfig }
	| { kind: "fixed_asset"; base: ItemBase; config: FixedAssetConfig };

const BASE_FIELDS =
	"id, sku, name, category, unit, coa_account, is_active, image_url, notes, created_at, updated_at, deleted_at, purchase_price_avg";
const INV_FIELDS =
	"item_id, base_unit, unit_conversion, min_stock_alert, purchase_price_avg, selling_price, preferred_supplier_id, is_bom_component, coa_account_inventory, coa_account_cogs, coa_account_wastage";
const FA_FIELDS =
	"item_id, asset_number, serial_number, purchase_price, purchase_date, salvage_value, useful_life_months, depreciation_method, depreciation_start_date, condition, current_location, current_event_id, current_crew_id, coa_account_asset, coa_account_accum_depr, coa_account_depr_expense";

/**
 * Load a single item with its category-specific config.
 * Throws if the item is missing its satellite (data integrity bug).
 */
export async function getItemWithConfig(
	supabase: SupabaseClient,
	itemId: string,
): Promise<LoadedItem | null> {
	const { data: base } = await supabase
		.from("inventory_items")
		.select(BASE_FIELDS)
		.eq("id", itemId)
		.maybeSingle();
	if (!base) return null;

	const itemBase = base as ItemBase;

	if (itemBase.category === "inventory") {
		const { data: cfg, error } = await supabase
			.from("items_inventory_config")
			.select(INV_FIELDS)
			.eq("item_id", itemId)
			.maybeSingle();
		if (error || !cfg) {
			throw new Error(
				`Item ${itemBase.sku} (${itemId}) category=inventory tapi tidak punya items_inventory_config row`,
			);
		}
		const invCfg = cfg as InventoryConfig;
		// Canonical avg cost dari base (selalu fresh dari purchases/movements);
		// satellite copy bisa basi. Phase 5 fix.
		invCfg.purchase_price_avg = Number(
			itemBase.purchase_price_avg ?? invCfg.purchase_price_avg ?? 0,
		);
		return { kind: "inventory", base: itemBase, config: invCfg };
	}

	const { data: cfg, error } = await supabase
		.from("items_fixed_asset_config")
		.select(FA_FIELDS)
		.eq("item_id", itemId)
		.maybeSingle();
	if (error || !cfg) {
		throw new Error(
			`Item ${itemBase.sku} (${itemId}) category=fixed_asset tapi tidak punya items_fixed_asset_config row`,
		);
	}
	return { kind: "fixed_asset", base: itemBase, config: cfg as FixedAssetConfig };
}

/**
 * Bulk-load items (mixed categories) with their configs. Returns a Map keyed
 * by item.id. Skips orphan items (logs warning but doesn't throw).
 */
export async function getItemsWithConfig(
	supabase: SupabaseClient,
	itemIds: string[],
): Promise<Map<string, LoadedItem>> {
	const out = new Map<string, LoadedItem>();
	if (itemIds.length === 0) return out;

	const [{ data: bases }, { data: invCfgs }, { data: faCfgs }] =
		await Promise.all([
			supabase.from("inventory_items").select(BASE_FIELDS).in("id", itemIds),
			supabase.from("items_inventory_config").select(INV_FIELDS).in("item_id", itemIds),
			supabase.from("items_fixed_asset_config").select(FA_FIELDS).in("item_id", itemIds),
		]);

	const invMap = new Map(
		((invCfgs ?? []) as InventoryConfig[]).map((c) => [c.item_id, c]),
	);
	const faMap = new Map(
		((faCfgs ?? []) as FixedAssetConfig[]).map((c) => [c.item_id, c]),
	);

	for (const b of (bases ?? []) as ItemBase[]) {
		if (b.category === "inventory") {
			const cfg = invMap.get(b.id);
			if (cfg) {
				// Canonical avg cost dari base (satellite bisa basi). Phase 5 fix.
				cfg.purchase_price_avg = Number(
					b.purchase_price_avg ?? cfg.purchase_price_avg ?? 0,
				);
				out.set(b.id, { kind: "inventory", base: b, config: cfg });
			}
		} else if (b.category === "fixed_asset") {
			const cfg = faMap.get(b.id);
			if (cfg) out.set(b.id, { kind: "fixed_asset", base: b, config: cfg });
		}
	}
	return out;
}

/** Narrowing helpers */
export function isInventory(
	item: LoadedItem,
): item is Extract<LoadedItem, { kind: "inventory" }> {
	return item.kind === "inventory";
}

export function isFixedAsset(
	item: LoadedItem,
): item is Extract<LoadedItem, { kind: "fixed_asset" }> {
	return item.kind === "fixed_asset";
}
