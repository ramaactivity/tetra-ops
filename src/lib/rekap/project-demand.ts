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

type InvItem = {
	id: string;
	sku: string;
	name: string;
	purchase_price_avg: number | null;
};

// PostgREST returns a to-one embed as an object, but a to-one over a non-unique
// FK can surface as a 1-element array — normalize both. See reference note
// reference_postgrest_to_one_embed.
type OneOrMany<T> = T | T[] | null;
function one<T>(v: OneOrMany<T>): T | null {
	return Array.isArray(v) ? (v[0] ?? null) : v;
}

type AddonShape = {
	name: string;
	inventory_item_id: string | null;
	inventory_item: OneOrMany<InvItem>;
	components: Array<{
		qty_per_unit: number | string;
		item: OneOrMany<InvItem>;
	}> | null;
};

type AddonConsumptionRow = {
	quantity: number;
	addon: OneOrMany<AddonShape>;
};

// Shared select for event_bonuses + event_addons: addon → multi-item components
// (addon_components) PLUS the legacy single inventory_item_id link (fallback).
const ADDON_CONSUMPTION_SELECT =
	"quantity, addon:addons(name, inventory_item_id," +
	" inventory_item:inventory_items(id, sku, name, purchase_price_avg)," +
	" components:addon_components(qty_per_unit," +
	" item:inventory_items(id, sku, name, purchase_price_avg)))";

/**
 * Expand one addon-consumption row (bonus or paid) into deduction lines.
 *
 * Prefers `addon_components` (one add-on → N inventory items, each with its own
 * qty_per_unit). Falls back to the legacy single `addons.inventory_item_id`
 * link when the add-on has no component rows — no regression for add-ons that
 * were never migrated to the multi-item table.
 *
 * Line qty = (ordered add-on units) × (component qty_per_unit).
 */
function expandAddonRow(
	row: AddonConsumptionRow,
	bucket: HppBucket,
	labelPrefix: string,
): DeductionLine[] {
	const addon = one(row.addon);
	if (!addon) return [];
	const unitQty = Number(row.quantity ?? 0);
	if (unitQty <= 0) return [];

	const components = (addon.components ?? [])
		.map((c) => {
			const item = one(c.item);
			if (!item) return null;
			const per = Number(c.qty_per_unit ?? 1);
			if (!Number.isFinite(per) || per <= 0) return null;
			return { item, per };
		})
		.filter((c): c is { item: InvItem; per: number } => c !== null);

	// Fallback to legacy single link when no components are defined.
	if (components.length === 0) {
		const legacy = one(addon.inventory_item);
		if (!legacy) return []; // addon not linked to any inventory — no stock track
		components.push({ item: legacy, per: 1 });
	}

	return components.map(({ item, per }) => ({
		item_id: item.id,
		sku: item.sku,
		name: item.name,
		qty: unitQty * per,
		unit_cost: Number(item.purchase_price_avg ?? 0),
		source_label: `${labelPrefix}: ${addon.name}`,
		bucket,
	}));
}

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
					item: OneOrMany<InvItem>;
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
 * event: add-ons (paid event_addons + free event_bonuses, each → one or more
 * inventory items via addon_components) and the package's bundle BOM
 * (packages.bundle_id → item_bundles → bundle_components).
 *
 * This is the slice of planRekapDeduction that does NOT depend on crew-recorded
 * actuals (cetak_total / *_used / custom_materials), so it can be computed
 * BEFORE an event happens — that's what the warehouse forecast (Phase 3) needs.
 *
 * HPP bucket per source (drives the settlement journal's debit account):
 *   - free bonuses  → "bonus" (Dr 5-411 Cost bonus/freebie, Cr 1-209)
 *   - paid add-ons  → "other" (Dr 5-109 HPP Lainnya,         Cr 1-209)
 * Both credit the same inventory account 1-209, so the inventory asset stays
 * reconciled with stock regardless of which bucket a line lands in.
 *
 * IMPORTANT — dedup contract (must match planRekapDeduction exactly):
 *   - Add-on lines (bonus + paid) are deduped against `existingItemIds`, TAPI
 *     tidak terhadap sesama add-on: dua order photomagnet terpisah = dua
 *     konsumsi nyata dan tetap dijumlahkan.
 *
 *     Kenapa dedup ini WAJIB: rekap-form mengisi otomatis field crew
 *     photomagnet_used/keychain_used dari paid_addons + bonuses
 *     (rekap-form.tsx:155-171), lalu ASSEMBLY_RULES di planRekapDeduction
 *     meng-expand field itu ke SKU yang sama. Tanpa dedup, add-on "Photomagnet
 *     x5" terpotong DUA KALI: 5 dari assembly + 5 dari sini → stok turun 10
 *     untuk 5 keping fisik dan HPP membengkak 5x harga rata-rata.
 *     Pasca-event angka konfirmasi crew adalah hitungan fisik sebenarnya,
 *     jadi baris crew yang menang dan ekspansi add-on di-skip.
 *
 *     Forecast pra-event mengoper set KOSONG, jadi di sana add-on tetap
 *     ter-expand penuh — perilakunya tidak berubah.
 *   - Bundle components are deduped against `existingItemIds` PLUS any add-on
 *     line just added. In the post-event planner, `existingItemIds` carries the
 *     media/sleeve/assembly/custom lines already built before this point, so
 *     the bundle never double-deducts an item another rule already covers.
 *     Pass an empty set when projecting purely from spec (forecast).
 *
 * Order of returned lines: bonuses, then paid add-ons, then bundle.
 *
 * Qty is returned UN-rounded; the caller applies roundQty over the full set
 * (matches the original, which rounds all lines together at the end).
 */
export async function projectEventLinesFromSpec(
	supabase: AnySupabase,
	eventId: string,
	existingItemIds: ReadonlySet<string> = new Set(),
): Promise<DeductionLine[]> {
	const [{ data: bonusRows }, { data: paidRows }, { data: event }] =
		await Promise.all([
			supabase
				.from("event_bonuses")
				.select(ADDON_CONSUMPTION_SELECT)
				.eq("event_id", eventId),
			supabase
				.from("event_addons")
				.select(ADDON_CONSUMPTION_SELECT)
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

	// ── Bonuses + paid add-ons ────────────────────────────────────────────────
	// Deduped terhadap `existingItemIds` SAJA (bukan terhadap sesama add-on):
	// dua order photomagnet terpisah memang dua konsumsi nyata dan harus
	// dijumlahkan, tapi item yang SUDAH dihitung dari field rekap crew tidak
	// boleh dipotong lagi di sini. Lihat catatan double-deduct di atas.
	const addonLines = [
		...(bonusRows ?? []).flatMap((row) =>
			expandAddonRow(row as unknown as AddonConsumptionRow, "bonus", "bonus"),
		),
		...(paidRows ?? []).flatMap((row) =>
			expandAddonRow(row as unknown as AddonConsumptionRow, "other", "addon"),
		),
	];
	for (const line of addonLines) {
		if (existingItemIds.has(line.item_id)) continue;
		out.push(line);
	}

	// ── Package bundle BOM — deduped against existing + add-ons just added ─────
	const pkgField =
		(event as unknown as { package?: OneOrMany<PackageRow> })?.package ?? null;
	const eventPackage = Array.isArray(pkgField)
		? (pkgField[0] ?? null)
		: pkgField;
	const bundle = eventPackage
		? Array.isArray(eventPackage.bundle)
			? eventPackage.bundle[0]
			: eventPackage.bundle
		: null;
	if (bundle?.is_active) {
		const seen = new Set<string>(existingItemIds);
		for (const l of out) seen.add(l.item_id); // include add-ons just pushed
		for (const comp of bundle.components ?? []) {
			const compItem = one(comp.item as OneOrMany<InvItem>);
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
