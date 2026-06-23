import type { SupabaseClient } from "@supabase/supabase-js";
import type { HppBucket } from "@/lib/rekap/recipe";

/**
 * A single material-consumption line. Shared by the post-event consumption
 * planner (planRekapDeduction in src/lib/actions/rekap.ts) and the pre-event
 * demand projector (Phase 3 forecast).
 */
export type DeductionLine = {
	item_id: string;
	sku: string;
	name: string;
	qty: number;
	unit_cost: number;
	source_label: string; // e.g. "bonus: Frame" or "bundle: Paket Wedding"
	bucket: HppBucket; // HPP bucket — single source for stock + cost
};

// SupabaseClient (not the server SSR client type) so this module stays free of
// `server-only` and is importable from plain node/tsx test scripts. Both the
// SSR client and a service-role client are structurally compatible.
// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic client
type AnySupabase = SupabaseClient<any, any, any>;

type BonusRow = {
	quantity: number;
	addon:
		| {
				name: string;
				inventory_item_id: string | null;
				inventory_item:
					| {
							id: string;
							sku: string;
							name: string;
							purchase_price_avg: number | null;
					  }
					| Array<{
							id: string;
							sku: string;
							name: string;
							purchase_price_avg: number | null;
					  }>
					| null;
		  }
		| Array<{
				name: string;
				inventory_item_id: string | null;
				inventory_item:
					| {
							id: string;
							sku: string;
							name: string;
							purchase_price_avg: number | null;
					  }
					| Array<{
							id: string;
							sku: string;
							name: string;
							purchase_price_avg: number | null;
					  }>
					| null;
		  }>
		| null;
};

type PackageRow = {
	bundle_id: string | null;
	bundle:
		| {
				id: string;
				sku: string;
				name: string;
				is_active: boolean;
				components: Array<{
					qty: number | string;
					item:
						| {
								id: string;
								sku: string;
								name: string;
								purchase_price_avg: number | null;
						  }
						| Array<{
								id: string;
								sku: string;
								name: string;
								purchase_price_avg: number | null;
						  }>
						| null;
				}>;
		  }
		| Array<{
				id: string;
				sku: string;
				name: string;
				is_active: boolean;
				components: Array<{ qty: number | string; item: unknown }>;
		  }>
		| null;
};

/**
 * Project the DETERMINISTIC, event-spec-derivable consumption lines for an
 * event: bonuses (event_bonuses → addon → inventory_item) and the package's
 * bundle BOM (packages.bundle_id → item_bundles → bundle_components).
 *
 * This is the slice of planRekapDeduction that does NOT depend on crew-recorded
 * actuals (cetak_total / *_used / custom_materials), so it can be computed
 * BEFORE an event happens — that's what the warehouse forecast (Phase 3) needs.
 *
 * IMPORTANT — dedup contract (must match planRekapDeduction exactly):
 *   - Bonuses are appended UNCONDITIONALLY (no dedup).
 *   - Bundle components are deduped against `existingItemIds` PLUS any bonus
 *     line just added. In the post-event planner, `existingItemIds` carries the
 *     media/sleeve/assembly/custom lines already built before this point, so
 *     the bundle never double-deducts an item another rule already covers.
 *     Pass an empty set when projecting purely from spec (forecast).
 *
 * Order of returned lines: bonuses first, then bundle — identical to the
 * original inline order in planRekapDeduction.
 *
 * Qty is returned UN-rounded; the caller applies roundQty over the full set
 * (matches the original, which rounds all lines together at the end).
 */
export async function projectEventLinesFromSpec(
	supabase: AnySupabase,
	eventId: string,
	existingItemIds: ReadonlySet<string> = new Set(),
): Promise<DeductionLine[]> {
	const [{ data: bonusRows }, { data: event }] = await Promise.all([
		supabase
			.from("event_bonuses")
			.select(
				"quantity, addon:addons(name, inventory_item_id, inventory_item:inventory_items(id, sku, name, purchase_price_avg))",
			)
			.eq("event_id", eventId),
		supabase
			.from("events")
			.select(
				`package:packages(bundle_id,
				   bundle:item_bundles(id, sku, name, is_active,
				     components:bundle_components(qty,
				       item:inventory_items!bundle_components_item_id_fkey(id, sku, name, purchase_price_avg)
				     )
				   )
				 )`,
			)
			.eq("id", eventId)
			.maybeSingle(),
	]);

	const out: DeductionLine[] = [];

	// ── Bonuses (event_bonuses) — appended unconditionally, no dedup ──────────
	for (const row of (bonusRows ?? []) as unknown as BonusRow[]) {
		const addon = Array.isArray(row.addon) ? row.addon[0] : row.addon;
		if (!addon) continue;
		const invItem = Array.isArray(addon.inventory_item)
			? addon.inventory_item[0]
			: addon.inventory_item;
		if (!invItem) continue; // addon not linked to inventory — no stock track
		const qty = Number(row.quantity ?? 0);
		if (qty <= 0) continue;
		out.push({
			item_id: invItem.id,
			sku: invItem.sku,
			name: invItem.name,
			qty,
			unit_cost: Number(invItem.purchase_price_avg ?? 0),
			source_label: `bonus: ${addon.name}`,
			bucket: "bonus",
		});
	}

	// ── Package bundle BOM — deduped against existing + bonuses just added ────
	const eventPackage = Array.isArray(
		(event as unknown as { package?: unknown[] })?.package,
	)
		? ((event as unknown as { package?: PackageRow[] }).package ?? [])[0]
		: ((event as unknown as { package?: PackageRow }).package ?? null);
	const bundle = eventPackage
		? Array.isArray(eventPackage.bundle)
			? eventPackage.bundle[0]
			: eventPackage.bundle
		: null;
	if (bundle && bundle.is_active) {
		const seen = new Set<string>(existingItemIds);
		for (const l of out) seen.add(l.item_id); // include bonuses just pushed
		for (const comp of bundle.components ?? []) {
			const compItem = Array.isArray(comp.item) ? comp.item[0] : comp.item;
			if (!compItem) continue;
			if (seen.has(compItem.id)) continue; // dedup
			const qty = Number(comp.qty);
			if (!Number.isFinite(qty) || qty <= 0) continue;
			out.push({
				item_id: compItem.id,
				sku: compItem.sku,
				name: compItem.name,
				qty,
				unit_cost: Number(compItem.purchase_price_avg ?? 0),
				source_label: `bundle: ${bundle.name}`,
				bucket: "other",
			});
			seen.add(compItem.id);
		}
	}

	return out;
}
