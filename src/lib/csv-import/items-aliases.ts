// Header alias map for inventory items CSV — exported separately from the
// server action file so it can be imported by client components / pages
// (Next.js forbids non-async-function exports from "use server" modules).

export const ITEM_HEADER_ALIASES: Record<string, string> = {
	// Phase-2 sheet headers (SYS_ITEMS.csv) → our schema
	item_id: "sku",
	item_name: "name",
	standard_cost_rp: "purchase_price_avg",
	reorder_level: "min_stock_alert",
	is_active: "is_active",
	purchase_price: "purchase_price",
	useful_life_months: "useful_life_months",
	notes: "notes",
	// Already-aligned
	sku: "sku",
	name: "name",
	category: "category",
	unit: "unit",
	min_stock_alert: "min_stock_alert",
	purchase_price_avg: "purchase_price_avg",
};
