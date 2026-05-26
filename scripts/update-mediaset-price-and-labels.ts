/**
 * update-mediaset-price-and-labels.ts
 *
 * 2 ops:
 *   1. Update Mediaset Basic primary supplier_price ke harga real:
 *      pack_price = 2.850.000, pack_size = 2, pack_unit = 'roll'.
 *      Trigger sync_primary_to_master_cost auto-update inventory_items.
 *      purchase_price_avg ke 1.425.000/roll. Backend rekap calc:
 *        - 1 cetak 4R = 1/700 roll × 1.425.000 = Rp 2.035,71
 *        - 1 cetak 2R = 1/1400 roll × 1.425.000 = Rp 1.017,86
 *
 *   2. Clean unit_conversion JSONB labels untuk MEDIA-BASIC + MEDIA-PERF.
 *      Drop "Box (2 Roll)" merged string → plain "Box".
 *      Dropdown render jadi cleaner di Market List edit modal.
 *
 * Idempotent — re-runnable.
 *
 * Usage: node --experimental-strip-types --env-file=.env.local --no-warnings \
 *          scripts/update-mediaset-price-and-labels.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

async function updateMediasetPrice() {
	console.log("\n## Step 1 — Mediaset Basic price update\n");
	// Lookup MEDIA-BASIC item
	const { data: item } = await sb
		.from("inventory_items")
		.select("id, sku, name, purchase_price_avg")
		.eq("sku", "MEDIA-BASIC")
		.maybeSingle();
	if (!item) {
		console.error("MEDIA-BASIC item not found");
		return;
	}
	console.log(
		`Current: ${item.name} — avg ${Number(item.purchase_price_avg).toLocaleString("id-ID")}/roll`,
	);

	// Find primary supplier_price for this item
	const { data: primary } = await sb
		.from("supplier_prices")
		.select("id, pack_price, pack_size, pack_unit, supplier:suppliers(name)")
		.eq("item_id", item.id)
		.eq("is_primary", true)
		.maybeSingle();
	if (!primary) {
		console.error("No primary supplier_price for MEDIA-BASIC");
		return;
	}
	const supName = Array.isArray(primary.supplier)
		? primary.supplier[0]?.name
		: (primary.supplier as { name: string } | null)?.name;
	console.log(
		`Primary supplier: ${supName} · current pack ${Number(primary.pack_price).toLocaleString("id-ID")} / ${primary.pack_size} ${primary.pack_unit}`,
	);

	const NEW_PACK_PRICE = 2_850_000;
	const NEW_PACK_SIZE = 2;
	console.log(
		`Target: ${NEW_PACK_PRICE.toLocaleString("id-ID")} / ${NEW_PACK_SIZE} roll → effective ${(NEW_PACK_PRICE / NEW_PACK_SIZE).toLocaleString("id-ID")}/roll`,
	);

	if (!APPLY) {
		console.log("(dry-run — skipping update)");
		return;
	}

	const { error } = await sb
		.from("supplier_prices")
		.update({
			pack_price: NEW_PACK_PRICE,
			pack_size: NEW_PACK_SIZE,
			pack_unit: "roll",
			updated_at: new Date().toISOString(),
			notes: `Updated 2026-06-03: Rp 2.850.000/box (2 roll). 1 roll = 700 lembar 4R atau 1400 lembar 2R. Per-lembar 4R = Rp 2.035,71. Per-lembar 2R = Rp 1.017,86.`,
		})
		.eq("id", primary.id);
	if (error) {
		console.error(`FAIL: ${error.message}`);
		return;
	}
	console.log(
		`✓ supplier_prices updated. Trigger akan auto-sync inventory_items.purchase_price_avg → ${(NEW_PACK_PRICE / NEW_PACK_SIZE).toLocaleString("id-ID")}/roll`,
	);

	// Verify
	const { data: after } = await sb
		.from("inventory_items")
		.select("purchase_price_avg")
		.eq("id", item.id)
		.maybeSingle();
	console.log(
		`✓ Verified: inventory_items.purchase_price_avg = ${Number(after?.purchase_price_avg ?? 0).toLocaleString("id-ID")}/roll`,
	);
}

async function cleanUnitConversionLabels() {
	console.log("\n## Step 2 — Clean unit_conversion labels\n");
	const SKUS = ["MEDIA-BASIC", "MEDIA-PERF"];
	const { data: items } = await sb
		.from("inventory_items")
		.select("id, sku, unit_conversion")
		.in("sku", SKUS);
	if (!items) {
		console.error("No items fetched");
		return;
	}

	for (const it of items) {
		const conv = it.unit_conversion as
			| { units?: Record<string, { label?: string }> }
			| null;
		if (!conv?.units) {
			console.log(`${it.sku}: no v2 units, skip`);
			continue;
		}
		let changed = false;
		const updatedUnits = { ...conv.units };
		for (const [code, def] of Object.entries(updatedUnits)) {
			const oldLabel = def.label ?? code;
			// Strip parenthetical "(X Roll)" or "(X.XXX pcs)" etc — keep clean unit name
			const newLabel = oldLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
			if (newLabel !== oldLabel && newLabel.length > 0) {
				console.log(`  ${it.sku}.${code}: "${oldLabel}" → "${newLabel}"`);
				updatedUnits[code] = { ...def, label: newLabel };
				changed = true;
			}
		}
		if (!changed) {
			console.log(`${it.sku}: labels already clean`);
			continue;
		}
		if (!APPLY) continue;
		const newConv = { ...conv, units: updatedUnits };
		const { error } = await sb
			.from("inventory_items")
			.update({ unit_conversion: newConv })
			.eq("id", it.id);
		if (error) {
			console.error(`  ${it.sku} FAIL: ${error.message}`);
		} else {
			console.log(`  ✓ ${it.sku} unit_conversion updated`);
		}
	}
}

async function main() {
	await updateMediasetPrice();
	await cleanUnitConversionLabels();
	if (!APPLY) {
		console.log("\n\nDry-run mode. Re-run with --apply to execute.");
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
