import { createClient } from "@supabase/supabase-js";

const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

const { data } = await sb
	.from("inventory_items")
	.select("sku, unit, unit_conversion")
	.in("sku", [
		"MEDIA-BASIC",
		"MEDIA-PERF",
		"SLEEVE-4R",
		"SLEEVE-2R",
		"SLEEVE-PR",
		"FD-BOX",
		"FLASHDISK",
		"KEY-FRAME",
		"KEY-STRAP",
		"POUCH",
		"ITM-BUSINESS-CARD",
		"PHOTOMAGNET",
		"ITM-AUT-72822",
		"ITM-CONSUMABLE-OTHER",
	])
	.is("deleted_at", null);
console.log(JSON.stringify(data, null, 2));
