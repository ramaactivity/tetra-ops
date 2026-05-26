/**
 * fix-market-list-overrides.ts — Restore avg cost yang ke-overwrite oleh hydration.
 *
 * Problem: seed-market-list.ts insert dengan is_primary=true, trigger
 * sync_primary_to_master_cost auto-update inventory_items.purchase_price_avg
 * = pack_price / pack_size. Untuk item yang sebelumnya sudah punya harga
 * audited di DB, ini OVERWRITE harga benar dengan harga CSV lama yang stale.
 *
 * Fix: untuk tiap item yang punya CORRECT_AVG di DB (snapshot pre-hydration),
 * update supplier_prices.pack_price = CORRECT_AVG × pack_size supaya trigger
 * re-fire dan restore avg ke nilai original.
 *
 * Untuk item yang sebelumnya 0 (tidak pernah di-set), keep CSV-derived guess.
 *
 * Usage: node --experimental-strip-types --env-file=.env.local --no-warnings \
 *          scripts/fix-market-list-overrides.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Snapshot pre-hydration values (dari scan-market-list-mapping output sebelum
 * seed-market-list --apply dijalankan). Hanya yang berbeda dari CSV-derived
 * seed yang tercantum di sini.
 *
 * Format: SKU → desired effective price per base unit (Rp).
 */
const CORRECT_AVG: Record<string, number> = {
	// Inventory — restore ke nilai DB sebelumnya
	"MEDIA-BASIC": 725_000, // was overwritten to 650.000 by CSV pack 1.3jt/2roll
	"MEDIA-PERF": 850_000, // was overwritten to 750.000
	"ITM-BUSINESS-CARD": 15_000, // was overwritten to 15.909
	"KEY-FRAME": 2_000, // was overwritten to 1.000
	"SLEEVE-2R": 550, // was overwritten to 500
	"SLEEVE-4R": 550, // was overwritten to 500
	"SLEEVE-PR": 550, // was overwritten to 500
	"ITM-CONSUMABLE-OTHER": 0, // was overwritten to 5.000 (was placeholder 0)

	// Fixed asset — restore ke items_fixed_asset_config.purchase_price
	"EQ-683936": 96_000, // Kain BG gold — was overwritten to 108.000
};

async function main() {
	// Get current state: supplier_prices + items
	const { data: rows } = await sb
		.from("supplier_prices")
		.select(
			"id, pack_price, pack_size, item_id, item:inventory_items(sku, name, unit, purchase_price_avg)",
		);
	if (!rows) {
		console.error("No rows fetched");
		process.exit(1);
	}

	const corrections: Array<{
		id: string;
		sku: string;
		name: string;
		current_pack: number;
		new_pack: number;
		desired_avg: number;
		current_avg: number;
	}> = [];

	for (const r of rows as any[]) {
		const sku = r.item?.sku;
		if (!sku || !(sku in CORRECT_AVG)) continue;
		const desired = CORRECT_AVG[sku];
		const newPack = desired === 0 ? 0 : Math.round(desired * Number(r.pack_size));
		if (newPack === r.pack_price) continue; // already correct
		corrections.push({
			id: r.id,
			sku,
			name: r.item.name,
			current_pack: r.pack_price,
			new_pack: newPack,
			desired_avg: desired,
			current_avg: r.item.purchase_price_avg ?? 0,
		});
	}

	console.log("\n## Correction Preview\n");
	console.log(`Total rows scanned: ${rows.length}`);
	console.log(`Rows needing correction: ${corrections.length}`);
	console.log("\n| SKU | Item | Current pack_price | New pack_price | Current avg | Target avg |");
	console.log("|---|---|---:|---:|---:|---:|");
	for (const c of corrections) {
		console.log(
			`| \`${c.sku}\` | ${c.name} | ${c.current_pack.toLocaleString("id-ID")} | ${c.new_pack.toLocaleString("id-ID")} | ${c.current_avg.toLocaleString("id-ID")} | ${c.desired_avg.toLocaleString("id-ID")} |`,
		);
	}

	if (!APPLY) {
		console.log("\nDry-run. Re-run with --apply to execute.");
		return;
	}

	console.log("\n## Applying corrections...");
	for (const c of corrections) {
		const { error } = await sb
			.from("supplier_prices")
			.update({ pack_price: c.new_pack, updated_at: new Date().toISOString() })
			.eq("id", c.id);
		if (error) {
			console.error(`  ${c.sku} → FAIL: ${error.message}`);
		} else {
			console.log(
				`  ${c.sku}: pack ${c.current_pack.toLocaleString("id-ID")} → ${c.new_pack.toLocaleString("id-ID")} (avg target ${c.desired_avg.toLocaleString("id-ID")})`,
			);
		}
	}
	console.log("\nDone. Trigger sync_primary_to_master_cost will auto-restore avg.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
