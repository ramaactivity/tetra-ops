/**
 * hydrate-all-empty-fields.ts — Force-fill semua field kosong di Persediaan +
 * Aset Tetap supaya bisa verifikasi visual bahwa data pipeline ke Market List
 * benar-benar nyambung.
 *
 * Strategy:
 *   1. Trigger re-sync fixed_asset purchase_price dari supplier_prices primary
 *      → "touch" supplier_prices rows (UPDATE no-op) supaya trigger fire
 *   2. Backfill semua field nullable yang masih kosong dengan synthetic:
 *      - serial_number: "SN-{SKU}"
 *      - purchase_date: 2026-01-01
 *      - depreciation_start_date: copy purchase_date
 *      - salvage_value: 10% of purchase_price (rounded)
 *      - useful_life_months: 36 jika null
 *      - condition: "normal"
 *      - current_location: "gudang_pusat"
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/hydrate-all-empty-fields.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

const DEFAULT_PURCHASE_DATE = "2026-01-01";

async function main() {
	console.log("\n## Step 1 — Re-trigger sync fixed_asset purchase_price\n");

	// Find all primary supplier_prices for fixed_asset items
	const { data: primaryFA, error: e1 } = await sb
		.from("supplier_prices")
		.select(
			"id, pack_price, item:inventory_items!inner(id, sku, name, category)",
		)
		.eq("is_primary", true);
	if (e1) {
		console.error("Fetch supplier_prices failed:", e1);
		process.exit(1);
	}

	const faPrimaries =
		(primaryFA ?? []).filter(
			(p: any) => p.item?.category === "fixed_asset",
		) ?? [];
	console.log(`Found ${faPrimaries.length} primary entries for fixed_assets`);

	if (APPLY) {
		// Touch each row → trigger fires → satellite purchase_price updates
		for (const p of faPrimaries as any[]) {
			const { error: tErr } = await sb
				.from("supplier_prices")
				.update({ updated_at: new Date().toISOString() })
				.eq("id", p.id);
			if (tErr) console.error(`  ${p.item.sku} touch FAIL: ${tErr.message}`);
		}
		console.log(`Touched ${faPrimaries.length} rows — trigger fired`);
	} else {
		console.log("(dry-run — would touch these rows)");
	}

	console.log("\n## Step 2 — Hydrate empty fields in items_fixed_asset_config\n");

	const { data: configs, error: e2 } = await sb
		.from("items_fixed_asset_config")
		.select(
			`item_id, serial_number, purchase_price, purchase_date, salvage_value,
			 useful_life_months, depreciation_start_date, condition, current_location,
			 item:inventory_items!inner(sku, name)`,
		);
	if (e2 || !configs) {
		console.error("Fetch configs failed:", e2);
		process.exit(1);
	}

	type Update = {
		item_id: string;
		sku: string;
		patch: Record<string, unknown>;
		notes: string[];
	};
	const updates: Update[] = [];
	for (const c of configs as any[]) {
		const patch: Record<string, unknown> = {};
		const notes: string[] = [];

		// Serial number — synthetic
		if (!c.serial_number) {
			patch.serial_number = `SN-${c.item.sku}`;
			notes.push("serial→synth");
		}
		// Purchase date — default
		if (!c.purchase_date) {
			patch.purchase_date = DEFAULT_PURCHASE_DATE;
			notes.push("purchase_date→2026-01-01");
		}
		// Depreciation start — copy purchase date
		const purchaseDate = patch.purchase_date ?? c.purchase_date;
		if (!c.depreciation_start_date && purchaseDate) {
			patch.depreciation_start_date = purchaseDate;
			notes.push("depr_start→purchase_date");
		}
		// Salvage value — 10% of purchase_price (after re-sync trigger has fired)
		// We re-fetch purchase_price AFTER touch, so do this in a 2nd pass below.
		// For now, queue it
		if (!c.salvage_value || c.salvage_value === 0) {
			notes.push("salvage→10%");
		}
		// Useful life — default 36
		if (!c.useful_life_months) {
			patch.useful_life_months = 36;
			notes.push("life→36");
		}
		// Condition
		if (!c.condition) {
			patch.condition = "normal";
			notes.push("cond→normal");
		}
		// Location
		if (!c.current_location) {
			patch.current_location = "gudang_pusat";
			notes.push("loc→gudang_pusat");
		}

		if (Object.keys(patch).length > 0 || notes.includes("salvage→10%")) {
			updates.push({
				item_id: c.item_id,
				sku: c.item.sku,
				patch,
				notes,
			});
		}
	}

	console.log(`Items needing hydration: ${updates.length} / ${configs.length}`);
	for (const u of updates.slice(0, 8)) {
		console.log(`  ${u.sku}: ${u.notes.join(", ")}`);
	}
	if (updates.length > 8) console.log(`  ... + ${updates.length - 8} more`);

	if (!APPLY) {
		console.log("\nDry-run. Re-run with --apply.");
		return;
	}

	console.log("\nApplying first-pass updates (everything except salvage)...");
	let ok = 0;
	let fail = 0;
	for (const u of updates) {
		if (Object.keys(u.patch).length === 0) continue;
		const { error } = await sb
			.from("items_fixed_asset_config")
			.update(u.patch)
			.eq("item_id", u.item_id);
		if (error) {
			console.error(`  ${u.sku} FAIL: ${error.message}`);
			fail++;
		} else {
			ok++;
		}
	}
	console.log(`First pass: ${ok} ok · ${fail} fail`);

	console.log(
		"\n## Step 3 — Re-fetch purchase_price and set salvage_value (10%)\n",
	);
	const { data: refetch } = await sb
		.from("items_fixed_asset_config")
		.select("item_id, purchase_price, salvage_value, item:inventory_items!inner(sku)");
	let salvageOk = 0;
	for (const c of (refetch ?? []) as any[]) {
		if (c.salvage_value && c.salvage_value > 0) continue;
		if (!c.purchase_price || c.purchase_price === 0) continue;
		const salvage = Math.round(c.purchase_price * 0.1);
		const { error } = await sb
			.from("items_fixed_asset_config")
			.update({ salvage_value: salvage })
			.eq("item_id", c.item_id);
		if (error) console.error(`  ${c.item.sku} salvage FAIL: ${error.message}`);
		else salvageOk++;
	}
	console.log(`Salvage updates: ${salvageOk}`);

	console.log("\n## Final verification — peek at sample row\n");
	const { data: sample } = await sb
		.from("items_fixed_asset_config")
		.select(
			"purchase_price, serial_number, purchase_date, salvage_value, useful_life_months, condition, current_location, item:inventory_items!inner(sku, name)",
		)
		.eq("item_id", configs[0].item_id);
	console.log(JSON.stringify(sample, null, 2));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
