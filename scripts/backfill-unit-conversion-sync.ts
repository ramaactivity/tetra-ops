/**
 * backfill-unit-conversion-sync.ts
 *
 * One-time backfill untuk sinkronisasi unit_conversion antara:
 *   1. inventory_items.unit_conversion (base table, dibaca warehouse list)
 *   2. items_inventory_config.unit_conversion (satellite, dibaca item edit form)
 *   3. supplier_prices.pack_unit + pack_size (Market List entries)
 *
 * Setelah refactor item ingestion, ada window dimana updateInventoryItem
 * cuma update satellite (#2) → base (#1) stale → warehouse list tampil unit
 * lama. Plus supplier_prices (#3) tidak ke-cascade → modal Market List edit
 * tampil unit lama walaupun item config sudah di-update.
 *
 * Logika canonical: satellite (#2) adalah source of truth post-refactor.
 *   - Copy satellite.unit_conversion → base.unit_conversion (kalau beda)
 *   - Untuk tiap supplier_prices row, kalau item punya bulk config
 *     (purchase entry dengan multiplier>1), force pack_unit + pack_size
 *     match item config. pack_price NOT touched (user-entered, sacred).
 *
 * Dry-run by default. --apply untuk eksekusi.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *        scripts/backfill-unit-conversion-sync.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

type UnitDef = { kind?: string; label?: string; multiplier?: number | null };
type Conv = { base_unit?: string; units?: Record<string, UnitDef> } | null;

function getBulkInfo(
	conv: Conv,
): { code: string; multiplier: number } | null {
	if (!conv?.units) return null;
	for (const [code, def] of Object.entries(conv.units)) {
		if (def.kind === "purchase" && Number(def.multiplier ?? 0) > 1) {
			return { code, multiplier: Number(def.multiplier) };
		}
	}
	return null;
}

async function main() {
	// 1. Load all inventory items + their satellite configs
	const { data: items } = await sb
		.from("inventory_items")
		.select(
			"id, sku, name, unit_conversion, config:items_inventory_config!inner(unit_conversion)",
		)
		.eq("category", "inventory")
		.is("deleted_at", null);

	if (!items) {
		console.error("No items fetched");
		process.exit(1);
	}

	// Reconciliation policy:
	//   - Both sides have bulk + differ → satellite wins (user form save terbaru)
	//   - Only one side has bulk → copy to the other side (preserve data)
	//   - Both empty / identical → skip
	// Canonical = winning conv, written to BOTH base & satellite.
	type BaseFix = {
		id: string;
		sku: string;
		baseHas: boolean;
		satHas: boolean;
		winner: "satellite" | "base";
		canonical: Conv;
		baseSummary: string;
		satSummary: string;
	};
	const baseFixes: BaseFix[] = [];

	for (const it of items as Array<{
		id: string;
		sku: string;
		unit_conversion: Conv;
		config: Array<{ unit_conversion: Conv }> | { unit_conversion: Conv };
	}>) {
		const cfg = Array.isArray(it.config) ? it.config[0] : it.config;
		if (!cfg) continue;
		const baseConv = it.unit_conversion ?? null;
		const satConv = cfg.unit_conversion ?? null;
		const baseJson = JSON.stringify(baseConv);
		const satJson = JSON.stringify(satConv);
		if (baseJson === satJson) continue;

		const baseBulk = getBulkInfo(baseConv);
		const satBulk = getBulkInfo(satConv);

		let canonical: Conv;
		let winner: "satellite" | "base";
		if (satBulk) {
			canonical = satConv;
			winner = "satellite";
		} else if (baseBulk) {
			canonical = baseConv;
			winner = "base";
		} else {
			canonical = satConv;
			winner = "satellite";
		}

		baseFixes.push({
			id: it.id,
			sku: it.sku,
			baseHas: Boolean(baseBulk),
			satHas: Boolean(satBulk),
			winner,
			canonical,
			baseSummary: baseBulk
				? `bulk ${baseBulk.code}×${baseBulk.multiplier}`
				: "no-bulk",
			satSummary: satBulk
				? `bulk ${satBulk.code}×${satBulk.multiplier}`
				: "no-bulk",
		});
	}

	console.log("\n## STEP 1 — Reconcile base ↔ satellite\n");
	console.log(`Total items: ${items.length}`);
	console.log(`Needs reconciliation: ${baseFixes.length}\n`);
	for (const f of baseFixes) {
		console.log(
			`  ${f.sku}: base=${f.baseSummary} sat=${f.satSummary} → ${f.winner} wins`,
		);
	}

	// 2. Load supplier_prices + check against item satellite config
	const { data: prices } = await sb
		.from("supplier_prices")
		.select("id, item_id, pack_unit, pack_size, pack_price");

	type PriceFix = {
		id: string;
		sku: string;
		oldUnit: string;
		oldSize: number;
		newUnit: string;
		newSize: number;
	};
	const priceFixes: PriceFix[] = [];

	// Build canonical map per item — combines existing data with Step 1 fixes
	// supaya supplier_prices ngikut hasil reconciliation, bukan stale satellite.
	const canonicalByItem = new Map<string, Conv>();
	for (const it of items as Array<{
		id: string;
		unit_conversion: Conv;
		config: Array<{ unit_conversion: Conv }> | { unit_conversion: Conv };
	}>) {
		const cfg = Array.isArray(it.config) ? it.config[0] : it.config;
		canonicalByItem.set(it.id, cfg?.unit_conversion ?? it.unit_conversion);
	}
	for (const f of baseFixes) {
		canonicalByItem.set(f.id, f.canonical);
	}
	const skuByItem = new Map<string, string>(
		(
			items as Array<{ id: string; sku: string }>
		).map((it) => [it.id, it.sku]),
	);

	for (const p of prices ?? []) {
		const conv = canonicalByItem.get(p.item_id);
		const sku = skuByItem.get(p.item_id) ?? "?";
		if (!conv) continue;
		const bulk = getBulkInfo(conv);
		if (!bulk) continue;
		const sizeMatches = Number(p.pack_size) === bulk.multiplier;
		const unitMatches = p.pack_unit === bulk.code;
		if (sizeMatches && unitMatches) continue;
		priceFixes.push({
			id: p.id,
			sku,
			oldUnit: p.pack_unit,
			oldSize: Number(p.pack_size),
			newUnit: bulk.code,
			newSize: bulk.multiplier,
		});
	}

	console.log(
		"\n## STEP 2 — supplier_prices.pack_unit/size ← item bulk config\n",
	);
	console.log(`Total supplier_prices: ${prices?.length ?? 0}`);
	console.log(`Mismatch (entry ≠ item config): ${priceFixes.length}\n`);
	for (const f of priceFixes) {
		console.log(
			`  ${f.sku}: ${f.oldUnit}×${f.oldSize} → ${f.newUnit}×${f.newSize}`,
		);
	}

	if (!APPLY) {
		console.log("\nDry-run. Re-run with --apply to execute.");
		return;
	}

	console.log("\n## Applying STEP 1 (write canonical ke BOTH base + satellite)...");
	let okBase = 0;
	let failBase = 0;
	for (const f of baseFixes) {
		const canonical = f.canonical as object;
		const { error: e1 } = await sb
			.from("inventory_items")
			.update({
				unit_conversion: canonical,
				updated_at: new Date().toISOString(),
			})
			.eq("id", f.id);
		const { error: e2 } = await sb
			.from("items_inventory_config")
			.update({
				unit_conversion: canonical,
				updated_at: new Date().toISOString(),
			})
			.eq("item_id", f.id);
		const err = e1 ?? e2;
		if (err) {
			console.error(`  ${f.sku} FAIL: ${err.message}`);
			failBase++;
		} else {
			okBase++;
		}
	}
	console.log(`Reconciled: ok=${okBase} fail=${failBase}`);

	console.log("\n## Applying STEP 2...");
	let okPrice = 0;
	let failPrice = 0;
	for (const f of priceFixes) {
		const { error } = await sb
			.from("supplier_prices")
			.update({
				pack_unit: f.newUnit,
				pack_size: f.newSize,
				updated_at: new Date().toISOString(),
			})
			.eq("id", f.id);
		if (error) {
			console.error(`  ${f.sku} FAIL: ${error.message}`);
			failPrice++;
		} else {
			okPrice++;
		}
	}
	console.log(`Supplier price updates: ok=${okPrice} fail=${failPrice}`);
	console.log(
		"\nTrigger sync_primary_to_master_cost akan auto-recompute avg cost.",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
