import { createClient } from "@supabase/supabase-js";

const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: prices } = await sb
	.from("supplier_prices")
	.select(
		"id, pack_price, pack_size, pack_unit, is_primary, supplier:suppliers(name), item:inventory_items(sku, name, unit, purchase_price_avg)",
	);

console.log(`Total rows: ${prices?.length ?? 0}`);
const primaryCount = (prices ?? []).filter((p: any) => p.is_primary).length;
console.log(`is_primary=true rows: ${primaryCount}`);

const bySupplier = new Map<string, number>();
for (const p of prices ?? []) {
	const supName = (p as any).supplier?.name ?? "?";
	bySupplier.set(supName, (bySupplier.get(supName) ?? 0) + 1);
}
console.log("\nPer-supplier counts:");
for (const [name, count] of [...bySupplier.entries()].sort()) {
	console.log(`  ${name}: ${count}`);
}

console.log("\nSample sync check (Mediaset Basic should be 650000/roll):");
const media = (prices ?? []).find(
	(p: any) => p.item?.sku === "MEDIA-BASIC",
);
console.log(JSON.stringify(media, null, 2));
