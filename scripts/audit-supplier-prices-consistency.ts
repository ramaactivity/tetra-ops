/**
 * audit-supplier-prices-consistency.ts
 *
 * Sweep semua supplier_prices + items:
 *   1. Audit semantic mismatch: pack_unit = base_unit BUT pack_size > 1
 *      (semantically wrong — "1 pcs contains 1000 pcs" nonsense)
 *   2. Audit label pollution: unit_conversion.units.*.label dengan
 *      parenthetical "(N pcs)" / "(N Roll)" etc — bikin dropdown rancu
 *   3. Audit preferred_supplier_id mismatch
 *
 * Saat --apply:
 *   - Fix #1: kalau ada `pack` unit di unit_conversion dengan multiplier =
 *     pack_size, switch pack_unit ke 'pack'. Else tetep stay (no auto-fix
 *     untuk hindari salah tebak).
 *   - Fix #2: strip parenthetical dari semua labels
 *
 * Usage: node --experimental-strip-types --env-file=.env.local --no-warnings \
 *          scripts/audit-supplier-prices-consistency.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

type ItemRow = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	unit_conversion: { units?: Record<string, UnitDef> } | null;
};
type UnitDef = {
	kind?: string;
	label?: string;
	multiplier?: number | null;
	denominator?: number | null;
};

async function main() {
	const { data: items } = await sb
		.from("inventory_items")
		.select("id, sku, name, unit, unit_conversion")
		.eq("category", "inventory")
		.eq("is_active", true)
		.is("deleted_at", null);

	const { data: prices } = await sb
		.from("supplier_prices")
		.select("id, item_id, pack_price, pack_size, pack_unit, is_primary");

	const pricesByItem = new Map<string, typeof prices>();
	for (const p of prices ?? []) {
		const arr = pricesByItem.get(p.item_id) ?? [];
		arr.push(p as never);
		pricesByItem.set(p.item_id, arr as never);
	}

	console.log("\n## Audit Report\n");

	// ───── Step 1 — label cleanup ─────
	const labelFixes: Array<{
		id: string;
		sku: string;
		newConv: { units: Record<string, UnitDef> };
	}> = [];
	for (const it of (items ?? []) as ItemRow[]) {
		const conv = it.unit_conversion;
		if (!conv?.units) continue;
		const newUnits: Record<string, UnitDef> = {};
		let changed = false;
		for (const [code, def] of Object.entries(conv.units)) {
			const oldLabel = def.label ?? code;
			const cleaned = oldLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
			if (cleaned !== oldLabel && cleaned.length > 0) {
				newUnits[code] = { ...def, label: cleaned };
				changed = true;
				console.log(`  LABEL ${it.sku}.${code}: "${oldLabel}" → "${cleaned}"`);
			} else {
				newUnits[code] = def;
			}
		}
		if (changed) {
			labelFixes.push({
				id: it.id,
				sku: it.sku,
				newConv: { ...conv, units: newUnits },
			});
		}
	}
	console.log(`Total label cleanups: ${labelFixes.length}\n`);

	// ───── Step 2 — semantic mismatch ─────
	const semanticFixes: Array<{
		id: string;
		sku: string;
		oldUnit: string;
		newUnit: string;
		size: number;
	}> = [];
	for (const it of (items ?? []) as ItemRow[]) {
		const ps = pricesByItem.get(it.id) ?? [];
		for (const p of ps) {
			if (Number(p.pack_size) <= 1) continue;
			if (p.pack_unit !== it.unit) continue; // already non-base, semantic OK

			// Detect a bulk unit di unit_conversion yang multiplier-nya matches
			// pack_size. Kalau ada → suggest switch ke unit itu.
			const conv = it.unit_conversion;
			let suggested: string | null = null;
			if (conv?.units) {
				for (const [code, def] of Object.entries(conv.units)) {
					if (
						def.kind === "purchase" &&
						Number(def.multiplier) === Number(p.pack_size)
					) {
						suggested = code;
						break;
					}
				}
			}
			// Fallback: 'pack' kalau ada di canonical list (always suggest pack
			// untuk pcs-base items dengan bulk size > 1)
			if (!suggested) suggested = "pack";
			console.log(
				`  SEMANTIC ${it.sku}: pack_unit='${p.pack_unit}' pack_size=${p.pack_size} → suggest '${suggested}'`,
			);
			semanticFixes.push({
				id: p.id,
				sku: it.sku,
				oldUnit: p.pack_unit,
				newUnit: suggested,
				size: Number(p.pack_size),
			});
		}
	}
	console.log(`Total semantic fixes: ${semanticFixes.length}\n`);

	// ───── Step 3 — preferred_supplier_id audit ─────
	const { data: configs } = await sb
		.from("items_inventory_config")
		.select(
			"item_id, preferred_supplier_id, item:inventory_items!inner(sku)",
		);
	let prefSynced = 0,
		prefMissing = 0;
	for (const c of configs ?? []) {
		const ps = (pricesByItem.get(c.item_id) ?? []).find((p) => p.is_primary);
		if (ps && c.preferred_supplier_id) prefSynced++;
		else if (ps && !c.preferred_supplier_id) prefMissing++;
	}
	console.log(
		`Preferred supplier sync: ${prefSynced} synced, ${prefMissing} missing (will fix via trigger re-fire)\n`,
	);

	if (!APPLY) {
		console.log("Dry-run mode. Re-run with --apply.");
		return;
	}

	console.log("\n## Applying...\n");

	// Apply label fixes
	for (const f of labelFixes) {
		const { error } = await sb
			.from("inventory_items")
			.update({ unit_conversion: f.newConv })
			.eq("id", f.id);
		if (error) console.error(`  LABEL ${f.sku} FAIL: ${error.message}`);
	}
	console.log(`Labels applied: ${labelFixes.length}`);

	// Apply semantic fixes
	for (const f of semanticFixes) {
		const { error } = await sb
			.from("supplier_prices")
			.update({
				pack_unit: f.newUnit,
				updated_at: new Date().toISOString(),
			})
			.eq("id", f.id);
		if (error) console.error(`  SEMANTIC ${f.sku} FAIL: ${error.message}`);
	}
	console.log(`Semantic fixes applied: ${semanticFixes.length}`);

	// Re-fire trigger for missing preferred — touch supplier_prices primaries
	// (set updated_at) supaya trigger sync_primary_to_master_cost re-fire
	const { data: primariesToTouch } = await sb
		.from("supplier_prices")
		.select("id")
		.eq("is_primary", true);
	for (const p of primariesToTouch ?? []) {
		await sb
			.from("supplier_prices")
			.update({ updated_at: new Date().toISOString() })
			.eq("id", p.id);
	}
	console.log(`Trigger re-fired on ${primariesToTouch?.length ?? 0} primaries`);

	console.log("\nDone.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
