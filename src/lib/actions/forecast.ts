// Warehouse forecast — "what will upcoming events need, vs what we have?"
//
// NOT a "use server" action: this is a server-side data function imported by the
// warehouse server component AND (Phase 4) the anomaly scanner. It takes a
// Supabase client so both the SSR client (RLS, owner) and the admin client
// (cron) can drive it.
//
// Demand model (v1): average ACTUAL consumption per event (from the canonical
// rekap_consumption movements, via get_consumption_per_event_avg) × the number
// of upcoming events. This is an ESTIMATE from real history — useful and honest,
// no manual input. Deterministic per-event refinement (projectEventLinesFromSpec
// — bundle/bonus) layers in later once that data exists.

import type { SupabaseClient } from "@supabase/supabase-js";

// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic client (SSR or admin)
type AnySupabase = SupabaseClient<any, any, any>;

export type ForecastRow = {
	item_id: string;
	sku: string;
	name: string;
	unit: string;
	avg_per_event: number;
	projected_demand: number;
	on_hand: number;
	shortfall: number; // projected_demand - on_hand, only > 0 rows are returned
	suggested_buy_base: number; // base units to buy (ceil of shortfall)
	bulk_label: string | null; // e.g. "Box" if item has a purchase unit
	bulk_qty: number | null; // suggested buy expressed in the bulk unit
	purchase_price_avg: number;
	est_cost: number; // shortfall × avg cost
	preferred_supplier_id: string | null;
	preferred_supplier_name: string | null;
};

export type ForecastResult = {
	upcoming_count: number;
	events_observed: number;
	upcoming_events: Array<{
		id: string;
		client_name: string | null;
		event_date: string;
	}>;
	rows: ForecastRow[];
	total_est_cost: number;
	stock_unknown: boolean; // true if on-hand failed to load (shortfalls suppressed)
};

type AvgRow = {
	item_id: string;
	avg_per_event: number | string;
	events_observed: number;
};

type ItemRow = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	unit_conversion: unknown;
	purchase_price_avg: number | null;
	config:
		| {
				preferred_supplier_id: string | null;
				supplier: { name: string } | Array<{ name: string }> | null;
		  }
		| Array<{
				preferred_supplier_id: string | null;
				supplier: { name: string } | Array<{ name: string }> | null;
		  }>
		| null;
};

/** Detect a purchase/bulk unit from v2 unit_conversion (mirrors warehouse-tables). */
function getBulk(
	conversion: unknown,
): { label: string; multiplier: number } | null {
	const conv = conversion as {
		units?: Record<
			string,
			{ kind?: string; label?: string; multiplier?: number | null }
		>;
	} | null;
	if (!conv?.units) return null;
	const purchase = Object.entries(conv.units).find(
		([, def]) => def.kind === "purchase",
	);
	if (!purchase) return null;
	const [code, def] = purchase;
	const multiplier = Number(def.multiplier ?? 0);
	if (multiplier <= 0) return null;
	return {
		label: (def.label ?? code).replace(/\s*\([^)]*\)\s*$/, "").trim(),
		multiplier,
	};
}

/**
 * `todayISO` opsional: pemanggil yang jalan di cron (digest Telegram 06:30 WIB
 * = 23:30 UTC hari sebelumnya) WAJIB mengirim tanggal WIB-nya. Tanpa itu
 * `new Date()` di server memberi tanggal kemarin menurut WIB, sehingga event
 * yang sudah lewat ikut terhitung dan "butuh ±X utk N event" jadi lebih besar
 * dari yang tampil di /warehouse.
 */
export async function computeForecast(
	supabase: AnySupabase,
	todayISO?: string,
): Promise<ForecastResult> {
	const today = todayISO ?? new Date().toISOString().slice(0, 10);

	const [upcomingRes, avgRes] = await Promise.all([
		supabase
			.from("events")
			.select("id, client_name, event_date")
			.eq("status", "upcoming")
			.gte("event_date", today)
			.is("deleted_at", null)
			.order("event_date", { ascending: true }),
		supabase.rpc("get_consumption_per_event_avg"),
	]);

	const upcoming_events = (upcomingRes.data ?? []) as Array<{
		id: string;
		client_name: string | null;
		event_date: string;
	}>;
	const upcoming_count = upcoming_events.length;
	const avgRows = (avgRes.data ?? []) as AvgRow[];
	const events_observed = Number(avgRows[0]?.events_observed ?? 0);

	const empty: ForecastResult = {
		upcoming_count,
		events_observed,
		upcoming_events,
		rows: [],
		total_est_cost: 0,
		stock_unknown: false,
	};
	if (upcoming_count === 0 || avgRows.length === 0) return empty;

	const demandItemIds = avgRows.map((r) => r.item_id);
	const avgById = new Map(
		avgRows.map((r) => [r.item_id, Number(r.avg_per_event)] as const),
	);

	const [itemsRes, stockRes] = await Promise.all([
		supabase
			.from("inventory_items")
			.select(
				`id, sku, name, unit, unit_conversion, purchase_price_avg,
				 config:items_inventory_config(
				   preferred_supplier_id,
				   supplier:suppliers!items_inventory_config_preferred_supplier_id_fkey(name)
				 )`,
			)
			.in("id", demandItemIds)
			.eq("category", "inventory")
			.is("deleted_at", null),
		supabase.rpc("get_stock_levels", { p_item_ids: demandItemIds }),
	]);

	// If on-hand fails, we cannot compute shortfall honestly — surface that
	// rather than treating every item as 0 on-hand (false alarms).
	const stockUnknown = Boolean(stockRes.error);
	const stockById = new Map(
		((stockRes.data ?? []) as Array<{ item_id: string; stock: number }>).map(
			(r) => [r.item_id, Number(r.stock)] as const,
		),
	);

	const rows: ForecastRow[] = [];
	let total_est_cost = 0;

	for (const it of (itemsRes.data ?? []) as ItemRow[]) {
		const avg = avgById.get(it.id) ?? 0;
		if (avg <= 0) continue;
		const projected = avg * upcoming_count;
		const onHand = stockById.get(it.id) ?? 0;
		const shortfall = projected - onHand;
		if (shortfall <= 0) continue; // enough on hand → not a buy

		const cfg = Array.isArray(it.config) ? it.config[0] : it.config;
		const sup = Array.isArray(cfg?.supplier) ? cfg?.supplier[0] : cfg?.supplier;
		const bulk = getBulk(it.unit_conversion);
		const cost = Number(it.purchase_price_avg ?? 0);
		const suggestedBase = Math.ceil(shortfall);
		// Round to whole Rupiah — currency never shows decimals in this system.
		const estCost = Math.round(shortfall * cost);
		total_est_cost += estCost;

		rows.push({
			item_id: it.id,
			sku: it.sku,
			name: it.name,
			unit: it.unit,
			avg_per_event: avg,
			projected_demand: projected,
			on_hand: onHand,
			shortfall,
			suggested_buy_base: suggestedBase,
			bulk_label: bulk?.label ?? null,
			bulk_qty: bulk ? Math.ceil(shortfall / bulk.multiplier) : null,
			purchase_price_avg: cost,
			est_cost: estCost,
			preferred_supplier_id: cfg?.preferred_supplier_id ?? null,
			preferred_supplier_name: sup?.name ?? null,
		});
	}

	// Most-short first (biggest gap relative to demand = most urgent).
	rows.sort(
		(a, b) =>
			b.shortfall / b.projected_demand - a.shortfall / a.projected_demand,
	);

	return {
		upcoming_count,
		events_observed,
		upcoming_events,
		rows: stockUnknown ? [] : rows,
		total_est_cost: stockUnknown ? 0 : total_est_cost,
		stock_unknown: stockUnknown,
	};
}
