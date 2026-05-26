/**
 * seed-market-list.ts — AI Data Hydration untuk supplier_prices (Market List).
 *
 * Strategy:
 *   • Read prices from legacy CSV (SYS_ITEMS + DB_FIXED_ASSETS) where possible.
 *   • For items without legacy data, use educated guesses berdasarkan jenis item.
 *   • Map each item to most-logical supplier via SUPPLIER_RULES.
 *   • Set is_primary=true → trigger auto-sync purchase_price_avg.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/seed-market-list.ts [--apply]
 *
 *   Without --apply: prints preview only.
 *   With --apply: executes INSERTs.
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("Missing env");
	process.exit(1);
}
const sb = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Manual mapping per SKU. Prices sourced from:
 *   • SYS_ITEMS.csv (Standard_Cost_Rp) — primary source for both inventory & assets
 *   • DB_FIXED_ASSETS.csv (AcquireCost_Rp) — fallback / sanity check
 *   • Educated guess (marked "guess") for items missing in CSV
 *
 * Pack semantics: pack_unit must equal item.unit (base unit) since the
 * sync trigger treats pack_size as base-qty when pack_unit isn't a literal
 * key in unit_conversion JSONB (our v2 shape doesn't expose flat keys).
 *
 * For SLEEVE-* and MEDIA-* we set pack_size > 1 to reflect bulk pricing.
 */
type Seed = {
	sku: string;
	supplier_name: string;
	pack_price: number; // total pack cost (Rp)
	pack_size: number; // qty in base unit
	notes: string;
};

const SEEDS: Seed[] = [
	// ─────────── PERSEDIAAN (inventory) ───────────
	// Mediaset — DNP printing media (1 box = 2 rolls)
	{
		sku: "MEDIA-BASIC",
		supplier_name: "MBA WULAN DNP",
		pack_price: 1_300_000,
		pack_size: 2,
		notes: "CSV: ITM-BOX-4R Box DNP Basic = 1.3jt / box (2 roll)",
	},
	{
		sku: "MEDIA-PERF",
		supplier_name: "MBA WULAN DNP",
		pack_price: 1_500_000,
		pack_size: 2,
		notes: "CSV: ITM-BOX-POL Box DNP Perforated = 1.5jt / box (2 roll)",
	},
	{
		sku: "PHOTOMAGNET",
		supplier_name: "MBA WULAN DNP",
		pack_price: 7_000,
		pack_size: 1,
		notes: "guess — match current DB price",
	},
	// Kartu nama
	{
		sku: "ITM-BUSINESS-CARD",
		supplier_name: "Gundaling",
		pack_price: 15_909,
		pack_size: 1,
		notes: "CSV: ITM-BUSINESS-CARD Kartu Nama Tetra = 15909 / pcs",
	},
	// Sleeves (1 pack = 1000 pcs @ 500/pcs)
	{
		sku: "SLEEVE-2R",
		supplier_name: "Gundaling",
		pack_price: 500_000,
		pack_size: 1000,
		notes: "CSV: ITM-SLEEVE-2R = 500/pcs · pack 1.000 pcs",
	},
	{
		sku: "SLEEVE-4R",
		supplier_name: "Gundaling",
		pack_price: 500_000,
		pack_size: 1000,
		notes: "CSV: ITM-SLEEVE-4R = 500/pcs · pack 1.000 pcs",
	},
	{
		sku: "SLEEVE-PR",
		supplier_name: "Gundaling",
		pack_price: 500_000,
		pack_size: 1000,
		notes: "CSV: ITM-SLEEVE-PR = 500/pcs · pack 1.000 pcs",
	},
	// Keychain components
	{
		sku: "KEY-FRAME",
		supplier_name: "SHOPEE",
		pack_price: 1_000,
		pack_size: 1,
		notes: "CSV: ITM-KEYCHAIN-FRAME = 1000/pcs",
	},
	{
		sku: "KEY-STRAP",
		supplier_name: "SHOPEE",
		pack_price: 2_000,
		pack_size: 1,
		notes: "CSV: ITM-KEYCHAIN-STRAP = 2000/pcs",
	},
	{
		sku: "POUCH",
		supplier_name: "SHOPEE",
		pack_price: 1_000,
		pack_size: 1,
		notes: "CSV: ITM-POUCH-TOTEBAG = 1000/pcs",
	},
	// Flashdisk set split: USB drive + custom box
	{
		sku: "FLASHDISK",
		supplier_name: "ARADEA STORE",
		pack_price: 65_000,
		pack_size: 1,
		notes: "guess — USB drive only (CSV ITM-FLASHDISK 75000 includes box)",
	},
	{
		sku: "FD-BOX",
		supplier_name: "SHOPEE",
		pack_price: 75_000,
		pack_size: 1,
		notes: "guess — custom box (current DB price)",
	},
	// Lakban
	{
		sku: "ITM-AUT-72822",
		supplier_name: "PHOTO COPY",
		pack_price: 6_000,
		pack_size: 1,
		notes: "CSV: ITM-AUT-72822 Lakban Kain = 6000/pcs",
	},
	// Catch-all
	{
		sku: "ITM-CONSUMABLE-OTHER",
		supplier_name: "PHOTO COPY",
		pack_price: 5_000,
		pack_size: 1,
		notes: "guess — placeholder generic consumable",
	},

	// ─────────── ASET TETAP (fixed_asset) ───────────
	// Camera body + lenses
	{
		sku: "EQ-CAM-700D",
		supplier_name: "BRO KAMERA",
		pack_price: 2_200_000,
		pack_size: 1,
		notes: "CSV: 2.2jt",
	},
	{
		sku: "EQ-LENS-KIT",
		supplier_name: "BRO KAMERA",
		pack_price: 600_000,
		pack_size: 1,
		notes: "CSV: 600k",
	},
	{
		sku: "EQ-LENS-TAMRON-1750",
		supplier_name: "BRO KAMERA",
		pack_price: 1_106_500,
		pack_size: 1,
		notes: "CSV: 1.106.500",
	},
	{
		sku: "EQ-FLASH-GODOX-SK400II",
		supplier_name: "BRO KAMERA",
		pack_price: 1_350_000,
		pack_size: 1,
		notes: "CSV: 1.35jt",
	},
	{
		sku: "EQ-TRIGGER-GODOX",
		supplier_name: "BRO KAMERA",
		pack_price: 195_000,
		pack_size: 1,
		notes: "CSV: 195k",
	},
	{
		sku: "EQ-DUMMY-BATT",
		supplier_name: "BRO KAMERA",
		pack_price: 185_000,
		pack_size: 1,
		notes: "CSV: 185k",
	},
	{
		sku: "EQ-CABLE-BATT-EXT",
		supplier_name: "BRO KAMERA",
		pack_price: 60_000,
		pack_size: 1,
		notes: "CSV (SYS): 60k",
	},
	{
		sku: "EQ-CABLE-CAM-LAPTOP",
		supplier_name: "BRO KAMERA",
		pack_price: 195_000,
		pack_size: 1,
		notes: "CSV: 195k",
	},
	{
		sku: "EQ-876088",
		supplier_name: "BRO KAMERA",
		pack_price: 245_000,
		pack_size: 1,
		notes: "CSV: Mic Wireless 245k",
	},
	{
		sku: "EQ-953916",
		supplier_name: "BRO KAMERA",
		pack_price: 38_000,
		pack_size: 1,
		notes: "CSV: Album Foto 38k",
	},
	// Monitor + mounts
	{
		sku: "EQ-MONITOR",
		supplier_name: "BRO KAMERA",
		pack_price: 1_650_000,
		pack_size: 1,
		notes: "CSV: 1.65jt",
	},
	{
		sku: "EQ-CABLE-MONITOR",
		supplier_name: "BRO KAMERA",
		pack_price: 75_000,
		pack_size: 1,
		notes: "CSV: 75k",
	},
	{
		sku: "EQ-138962",
		supplier_name: "BRO KAMERA",
		pack_price: 46_000,
		pack_size: 1,
		notes: "CSV: Bracket Monitor 46k",
	},
	{
		sku: "EQ-VESA-CLAMP",
		supplier_name: "BRO KAMERA",
		pack_price: 75_000,
		pack_size: 1,
		notes: "CSV: 75k",
	},
	{
		sku: "EQ-220248",
		supplier_name: "BRO KAMERA",
		pack_price: 2_000,
		pack_size: 1,
		notes: "CSV: Baut Monitor 2k",
	},
	{
		sku: "EQ-860778",
		supplier_name: "BRO KAMERA",
		pack_price: 60_000,
		pack_size: 1,
		notes: "CSV: Sleeve Bag Monitor 60k",
	},
	// Lighting
	{
		sku: "EQ-782838",
		supplier_name: "BRO KAMERA",
		pack_price: 488_000,
		pack_size: 1,
		notes: "CSV: Lighting TNW 488k",
	},
	{
		sku: "EQ-PAYUNG",
		supplier_name: "BRO KAMERA",
		pack_price: 45_000,
		pack_size: 1,
		notes: "CSV: Payung lighting 45k",
	},
	// Backgrounds
	{
		sku: "EQ-KAIN-BG",
		supplier_name: "BRO KAMERA",
		pack_price: 583_000,
		pack_size: 1,
		notes: "DB_FA: Kain BG Merah 583k",
	},
	{
		sku: "EQ-683936",
		supplier_name: "BRO KAMERA",
		pack_price: 108_000,
		pack_size: 1,
		notes: "DB_FA: Kain BG Gold 108k",
	},
	{
		sku: "EQ-606777",
		supplier_name: "BRO KAMERA",
		pack_price: 96_000,
		pack_size: 1,
		notes: "DB_FA: Kain BG Silver 96k",
	},
	{
		sku: "EQ-253222",
		supplier_name: "BRO KAMERA",
		pack_price: 209_000,
		pack_size: 1,
		notes: "CSV: Tiang BG horizontal 209k",
	},
	{
		sku: "EQ-365905",
		supplier_name: "BRO KAMERA",
		pack_price: 129_000,
		pack_size: 1,
		notes: "CSV: Tas BG 129k",
	},
	// Tripods + bags
	{
		sku: "EQ-784133",
		supplier_name: "BRO KAMERA",
		pack_price: 337_000,
		pack_size: 1,
		notes: "CSV: Tripod besar 337k",
	},
	{
		sku: "EQ-648466",
		supplier_name: "BRO KAMERA",
		pack_price: 50_000,
		pack_size: 1,
		notes: "CSV: Tripod Banner 50k",
	},
	{
		sku: "EQ-929472",
		supplier_name: "BRO KAMERA",
		pack_price: 188_000,
		pack_size: 1,
		notes: "CSV: Tripod HP 188k",
	},
	{
		sku: "EQ-293639",
		supplier_name: "BRO KAMERA",
		pack_price: 160_000,
		pack_size: 1,
		notes: "CSV: Tripod Lighting kecil 160k",
	},
	{
		sku: "EQ-BAG-TRIPOD",
		supplier_name: "BRO KAMERA",
		pack_price: 120_000,
		pack_size: 1,
		notes: "CSV: Tas Tripod 120k",
	},
	{
		sku: "EQ-676439",
		supplier_name: "BRO KAMERA",
		pack_price: 150_000,
		pack_size: 1,
		notes: "CSV: Tas Tripod besar 150k",
	},
	// Clamps + small mounts
	{
		sku: "EQ-CLAMP-ULANZI",
		supplier_name: "BRO KAMERA",
		pack_price: 160_000,
		pack_size: 1,
		notes: "CSV: Clamp Ulanzi 160k",
	},
	{
		sku: "EQ-361723",
		supplier_name: "BRO KAMERA",
		pack_price: 35_000,
		pack_size: 1,
		notes: "CSV: U Clamp 35k",
	},
	{
		sku: "EQ-400983",
		supplier_name: "BRO KAMERA",
		pack_price: 10_000,
		pack_size: 1,
		notes: "CSV: Spigot 10k",
	},
	{
		sku: "EQ-897787",
		supplier_name: "SHOPEE",
		pack_price: 12_000,
		pack_size: 1,
		notes: "CSV: Andoer Klip 12k",
	},
	{
		sku: "EQ-823700",
		supplier_name: "SHOPEE",
		pack_price: 12_500,
		pack_size: 1,
		notes: "CSV: Bulldog Klip 12.5k",
	},
	// IT / Charger / Cables
	{
		sku: "EQ-948790",
		supplier_name: "ARADEA STORE",
		pack_price: 65_000,
		pack_size: 1,
		notes: "CSV: Kabel USB-C 65k",
	},
	{
		sku: "EQ-986009",
		supplier_name: "ARADEA STORE",
		pack_price: 159_000,
		pack_size: 1,
		notes: "CSV: USB HUB 159k",
	},
	{
		sku: "EQ-CHARGER-UGREEN",
		supplier_name: "ARADEA STORE",
		pack_price: 300_000,
		pack_size: 1,
		notes: "CSV: Charger Ugreen 300k",
	},
	// Printer DNP
	{
		sku: "EQ-253034",
		supplier_name: "MBA WULAN DNP",
		pack_price: 23_500_000,
		pack_size: 1,
		notes: "CSV: Printer DNP 23.5jt",
	},
	// Containers + storage
	{
		sku: "EQ-KONTAINER-BESAR",
		supplier_name: "SHOPEE",
		pack_price: 125_000,
		pack_size: 1,
		notes: "CSV: Kontainer Besar 125k",
	},
	{
		sku: "EQ-KONTAINER-KECIL",
		supplier_name: "SHOPEE",
		pack_price: 50_000,
		pack_size: 1,
		notes: "CSV: Kontainer Kecil 50k",
	},
	{
		sku: "EQ-947338",
		supplier_name: "SHOPEE",
		pack_price: 65_000,
		pack_size: 1,
		notes: "CSV: Kontainer Sedang 65k",
	},
	{
		sku: "EQ-781920",
		supplier_name: "SHOPEE",
		pack_price: 503_000,
		pack_size: 1,
		notes: "CSV: Rak Susun 503k",
	},
	{
		sku: "EQ-827969",
		supplier_name: "TIKTOK SHOP",
		pack_price: 250_000,
		pack_size: 1,
		notes: "CSV: Ransel 250k",
	},
	{
		sku: "EQ-623889",
		supplier_name: "SHOPEE",
		pack_price: 40_000,
		pack_size: 1,
		notes: "CSV: Box Kacamata 40k",
	},
	{
		sku: "EQ-497548",
		supplier_name: "SHOPEE",
		pack_price: 54_000,
		pack_size: 1,
		notes: "CSV: Tempat Bando 54k",
	},
	{
		sku: "EQ-TERMINAL",
		supplier_name: "SHOPEE",
		pack_price: 50_000,
		pack_size: 1,
		notes: "CSV: Terminal listrik 50k",
	},
	{
		sku: "EQ-654794",
		supplier_name: "TIKTOK SHOP",
		pack_price: 185_000,
		pack_size: 1,
		notes: "CSV+DB_FA: Kursi Trailtop 185k",
	},
	{
		sku: "EQ-PROPERTI",
		supplier_name: "TOKO SALEMBA",
		pack_price: 200_000,
		pack_size: 1,
		notes: "guess — generic properti 200k",
	},
	// Uniforms
	{
		sku: "EQ-200296",
		supplier_name: "TOKO SALEMBA",
		pack_price: 239_000,
		pack_size: 1,
		notes: "CSV: Seragam vest hijau 239k",
	},
	{
		sku: "EQ-871695",
		supplier_name: "TOKO SALEMBA",
		pack_price: 239_000,
		pack_size: 1,
		notes: "CSV: Seragam vest hitam 239k",
	},
];

async function main() {
	const [supRes, itemRes] = await Promise.all([
		sb.from("suppliers").select("id, name").is("deleted_at", null),
		sb
			.from("inventory_items")
			.select("id, sku, name, category, unit")
			.is("deleted_at", null)
			.eq("is_active", true),
	]);
	const supByName = new Map<string, string>();
	for (const s of supRes.data ?? []) supByName.set(s.name, s.id as string);
	const itemBySku = new Map<
		string,
		{ id: string; name: string; category: string; unit: string }
	>();
	for (const i of itemRes.data ?? [])
		itemBySku.set(i.sku as string, {
			id: i.id as string,
			name: i.name as string,
			category: i.category as string,
			unit: i.unit as string,
		});

	// Build rows + diagnostics
	const rows: Array<{
		seed: Seed;
		item_id: string;
		supplier_id: string;
		item_name: string;
		item_unit: string;
		effective_per_unit: number;
	}> = [];
	const missingItems: string[] = [];
	const missingSuppliers: string[] = [];
	for (const seed of SEEDS) {
		const item = itemBySku.get(seed.sku);
		const supplier_id = supByName.get(seed.supplier_name);
		if (!item) {
			missingItems.push(seed.sku);
			continue;
		}
		if (!supplier_id) {
			missingSuppliers.push(seed.supplier_name);
			continue;
		}
		rows.push({
			seed,
			item_id: item.id,
			supplier_id,
			item_name: item.name,
			item_unit: item.unit,
			effective_per_unit: Math.round(seed.pack_price / seed.pack_size),
		});
	}

	// Coverage report
	const coveredSkus = new Set(rows.map((r) => r.seed.sku));
	const missingFromSeeds: string[] = [];
	for (const sku of itemBySku.keys()) {
		if (!coveredSkus.has(sku)) missingFromSeeds.push(sku);
	}

	console.log("\n## Pre-Migration Preview\n");
	console.log(
		`Total seeds: ${SEEDS.length} · matched: ${rows.length} · skipped: ${SEEDS.length - rows.length}`,
	);
	console.log(`Total active items in DB: ${itemBySku.size}`);
	console.log(
		`Items WITHOUT seed (will not get supplier price): ${missingFromSeeds.length}`,
	);
	if (missingFromSeeds.length > 0) {
		console.log("  → " + missingFromSeeds.join(", "));
	}
	if (missingItems.length > 0) {
		console.log("\nSeeds with NO MATCHING ITEM (SKU typo?): " + missingItems.join(", "));
	}
	if (missingSuppliers.length > 0) {
		console.log(
			"\nSeeds with NO MATCHING SUPPLIER: " +
				[...new Set(missingSuppliers)].join(", "),
		);
	}

	console.log("\n| SKU | Item | Supplier | Pack Price | Pack Size | Unit | Eff/unit | Notes |");
	console.log("|---|---|---|---:|---:|---|---:|---|");
	for (const r of rows) {
		console.log(
			`| \`${r.seed.sku}\` | ${r.item_name} | ${r.seed.supplier_name} | ${r.seed.pack_price.toLocaleString("id-ID")} | ${r.seed.pack_size} | ${r.item_unit} | ${r.effective_per_unit.toLocaleString("id-ID")} | ${r.seed.notes} |`,
		);
	}

	if (!APPLY) {
		console.log("\nDry-run mode. Re-run with --apply to execute.");
		return;
	}

	// Apply
	console.log("\n## Applying...");
	const inserts = rows.map((r) => ({
		supplier_id: r.supplier_id,
		item_id: r.item_id,
		pack_price: r.seed.pack_price,
		pack_size: r.seed.pack_size,
		pack_unit: r.item_unit, // use item's base unit so trigger treats pack_size as base qty
		is_primary: true,
		notes: r.seed.notes,
	}));
	// Use upsert on (supplier_id, item_id) so re-runs don't blow up
	const { data: inserted, error } = await sb
		.from("supplier_prices")
		.upsert(inserts, { onConflict: "supplier_id,item_id" })
		.select("id");
	if (error) {
		console.error("ERROR:", error);
		process.exit(1);
	}
	console.log(`Inserted/updated: ${inserted?.length ?? 0} rows`);

	// Also set preferred_supplier_id on items_inventory_config so the
	// Persediaan UI reflects "Supplier Utama" without needing manual edit.
	const inventoryRows = rows.filter(
		(r) => itemBySku.get(r.seed.sku)?.category === "inventory",
	);
	console.log(
		`\nSetting preferred_supplier_id on ${inventoryRows.length} inventory items...`,
	);
	for (const r of inventoryRows) {
		const { error: prefErr } = await sb
			.from("items_inventory_config")
			.update({ preferred_supplier_id: r.supplier_id })
			.eq("item_id", r.item_id);
		if (prefErr) {
			console.error(`  ${r.seed.sku} → FAIL: ${prefErr.message}`);
		}
	}
	console.log("Done.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
