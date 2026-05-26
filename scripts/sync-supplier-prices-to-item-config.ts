/**
 * sync-supplier-prices-to-item-config.ts
 *
 * Detect & fix supplier_prices entries dimana pack_unit + pack_size tidak
 * match dengan item's unit_conversion config.
 *
 * Bug pattern: user setup item dengan bulk unit (mis. Box=100 sheet) tapi
 * Market List entry tersimpan pack_unit='pcs' pack_size=1. Mathematically
 * mungkin OK (effective = pack_price/1) tapi semantically rancu — user
 * thinks Rp 15.000 itu per BOX (100 sheet → 150/sheet) sistem hitung sebagai
 * per SHEET (15.000/sheet). Kacau di rekap.
 *
 * Fix logic:
 *   - Untuk tiap supplier_price, cek apakah item punya purchase unit di
 *     unit_conversion (mis. units.box.multiplier=100)
 *   - Kalau ya AND pack_size=1 (tanda user belum aware bulk concept):
 *     → suggest UPDATE pack_unit=bulk_code, pack_size=multiplier
 *
 * Dry-run mode by default. --apply untuk eksekusi.
 *
 * Usage: node --experimental-strip-types --env-file=.env.local --no-warnings \
 *          scripts/sync-supplier-prices-to-item-config.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

type UnitDef = {
	kind?: string;
	label?: string;
	multiplier?: number | null;
};

async function main() {
	const { data: items } = await sb
		.from("inventory_items")
		.select("id, sku, name, unit, unit_conversion, purchase_price_avg")
		.eq("category", "inventory")
		.is("deleted_at", null);

	const { data: prices } = await sb
		.from("supplier_prices")
		.select("id, item_id, pack_price, pack_size, pack_unit, is_primary");

	const itemMap = new Map((items ?? []).map((i: any) => [i.id, i]));

	type Fix = {
		id: string;
		sku: string;
		oldUnit: string;
		oldSize: number;
		newUnit: string;
		newSize: number;
		pack_price: number;
		new_effective: number;
		old_effective: number;
	};

	const fixes: Fix[] = [];
	for (const p of prices ?? []) {
		const it: any = itemMap.get(p.item_id);
		if (!it) continue;
		const conv = it.unit_conversion as
			| { units?: Record<string, UnitDef> }
			| null;
		if (!conv?.units) continue;

		// Find purchase unit (bulk)
		const purchase = Object.entries(conv.units).find(
			([, def]) => def.kind === "purchase",
		);
		if (!purchase) continue; // no bulk → no auto-fix
		const [bulkCode, bulkDef] = purchase;
		const multiplier = Number(bulkDef.multiplier ?? 0);
		if (multiplier <= 1) continue;

		// Pattern: pack_unit = base_unit AND pack_size = 1 → user didn't use bulk
		const isAtomic =
			p.pack_unit === it.unit && Number(p.pack_size) === 1;
		if (!isAtomic) continue;

		// Suggest: pack_unit → bulkCode, pack_size → multiplier
		// pack_price stays the same (user already typed Rp X — system was
		// computing per-base, sekarang per-bulk dengan effective = X/multiplier)
		const oldEff = Number(p.pack_price) / Number(p.pack_size);
		const newEff = Number(p.pack_price) / multiplier;

		fixes.push({
			id: p.id,
			sku: it.sku,
			oldUnit: p.pack_unit,
			oldSize: Number(p.pack_size),
			newUnit: bulkCode,
			newSize: multiplier,
			pack_price: Number(p.pack_price),
			new_effective: newEff,
			old_effective: oldEff,
		});
	}

	console.log("\n## Pack Unit Sync Report\n");
	console.log(`Total supplier_prices: ${prices?.length ?? 0}`);
	console.log(`Detected atomic-but-should-be-bulk: ${fixes.length}\n`);

	for (const f of fixes) {
		console.log(`${f.sku}:`);
		console.log(
			`  ${f.oldUnit} × ${f.oldSize} × Rp ${f.pack_price.toLocaleString("id-ID")} → effective Rp ${f.old_effective.toLocaleString("id-ID")}/unit (OLD)`,
		);
		console.log(
			`  ${f.newUnit} × ${f.newSize} × Rp ${f.pack_price.toLocaleString("id-ID")} → effective Rp ${f.new_effective.toLocaleString("id-ID")}/unit (NEW, auto-sync via trigger)`,
		);
	}

	if (!APPLY) {
		console.log("\nDry-run. Re-run with --apply to execute.");
		return;
	}

	console.log("\n## Applying...\n");
	let ok = 0,
		fail = 0;
	for (const f of fixes) {
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
			fail++;
		} else {
			ok++;
		}
	}
	console.log(`Applied: ${ok} · Failed: ${fail}`);
	console.log("Trigger sync_primary_to_master_cost auto-recompute avg cost.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
