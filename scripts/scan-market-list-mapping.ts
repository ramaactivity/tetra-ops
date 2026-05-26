/**
 * scan-market-list-mapping.ts — One-off audit script untuk Market List hydration.
 *
 * Output:
 *   • List active suppliers (id + name)
 *   • List active items dengan category, unit, satellite config
 *   • List existing supplier_prices rows (kalau ada)
 *   • Print pretty markdown
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/scan-market-list-mapping.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("Missing env");
	process.exit(1);
}
const sb = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
	const [suppliersRes, itemsRes, existingPricesRes] = await Promise.all([
		sb
			.from("suppliers")
			.select("id, name, default_payment_term, default_top_days, is_active")
			.is("deleted_at", null)
			.order("name"),
		sb
			.from("inventory_items")
			.select(
				`id, sku, name, category, unit, unit_conversion, is_active,
				 inv:items_inventory_config(purchase_price_avg, preferred_supplier_id),
				 ast:items_fixed_asset_config(purchase_price, acquisition_type)`,
			)
			.is("deleted_at", null)
			.eq("is_active", true)
			.order("category")
			.order("name"),
		sb
			.from("supplier_prices")
			.select("id, supplier_id, item_id, pack_price, pack_size, is_primary"),
	]);

	console.log("=== SUPPLIERS (active) ===");
	for (const s of suppliersRes.data ?? []) {
		console.log(`${s.id}\t${s.name}\t${s.is_active ? "active" : "inactive"}`);
	}

	console.log("\n=== ITEMS (active, by category) ===");
	for (const i of itemsRes.data ?? []) {
		const inv = Array.isArray(i.inv) ? i.inv[0] : i.inv;
		const ast = Array.isArray(i.ast) ? i.ast[0] : i.ast;
		const price = inv?.purchase_price_avg ?? ast?.purchase_price ?? 0;
		const pref = inv?.preferred_supplier_id ?? "-";
		console.log(
			`${i.category}\t${i.sku}\t${i.name}\tunit=${i.unit}\tprice=${price}\tpref_sup=${pref}`,
		);
	}

	console.log("\n=== EXISTING supplier_prices ===");
	console.log(`Total rows: ${existingPricesRes.data?.length ?? 0}`);
	for (const p of existingPricesRes.data ?? []) {
		console.log(
			`item=${p.item_id}\tsupplier=${p.supplier_id}\tprice=${p.pack_price}\tsize=${p.pack_size}\tprimary=${p.is_primary}`,
		);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
