"use server";

import { getCurrentUser } from "@/lib/auth/get-user";
import type { RekapField } from "@/lib/rekap-mapping/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Auto-derived HPP keys — match the JSONB shape that close_event_settlement
 * RPC accepts as p_hpp.
 */
export type AutoHppKey =
	| "mediaset"
	| "sleeve"
	| "flashdisk"
	| "pouch"
	| "photomagnet"
	| "keychain"
	| "bonus"
	| "other";

export type AutoHpp = Record<AutoHppKey, number>;

/**
 * Maps each rekap_field to its corresponding HPP bucket. cetak_total
 * goes to "other" since it's an aggregate (not a discrete SKU).
 */
const FIELD_TO_BUCKET: Record<RekapField, AutoHppKey> = {
	cetak_total: "other",
	media_set_used: "mediaset",
	sleeve_used: "sleeve",
	flashdisk_used: "flashdisk",
	pouch_used: "pouch",
	photomagnet_used: "photomagnet",
	keychain_used: "keychain",
};

const ZERO_HPP: AutoHpp = {
	mediaset: 0,
	sleeve: 0,
	flashdisk: 0,
	pouch: 0,
	photomagnet: 0,
	keychain: 0,
	bonus: 0,
	other: 0,
};

/**
 * Compute auto-derived HPP for a given event by joining its rekap with
 * the rekap_field_mapping and inventory_items.purchase_price_avg.
 *
 * Returns ZERO_HPP if no rekap exists or rekap has no consumption.
 * custom_materials JSONB entries fall into the "other" bucket.
 */
export async function getAutoHpp(eventId: string): Promise<AutoHpp> {
	const me = await getCurrentUser();
	if (!me) return ZERO_HPP;
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		return ZERO_HPP;
	}

	const supabase = await createClient();
	const [{ data: rekap }, { data: event }, { data: mappings }] = await Promise.all([
		supabase
			.from("crew_rekap")
			.select(
				"event_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
			)
			.eq("event_id", eventId)
			.maybeSingle(),
		supabase
			.from("events")
			.select("frame_size")
			.eq("id", eventId)
			.maybeSingle(),
		supabase
			.from("rekap_field_mapping")
			.select("rekap_field, frame_size, item_id, qty_per_unit, is_active"),
	]);

	if (!rekap) return ZERO_HPP;

	const frameSize = ((event?.frame_size as string | null) ?? "").trim();

	// v3: size-aware resolver — pick exact match on frame_size, fall back to ''
	const allMappings = ((mappings ?? []) as Array<{
		rekap_field: RekapField;
		frame_size: string | null;
		item_id: string | null;
		qty_per_unit: number | string;
		is_active: boolean;
	}>).map((m) => ({
		rekap_field: m.rekap_field,
		frame_size: m.frame_size ?? "",
		item_id: m.item_id,
		qty_per_unit: Number(m.qty_per_unit) || 1,
		is_active: m.is_active,
	}));

	const resolved = new Map<RekapField, (typeof allMappings)[number]>();
	const allFields = new Set(allMappings.map((m) => m.rekap_field));
	for (const field of allFields) {
		const candidates = allMappings.filter(
			(m) => m.rekap_field === field && m.is_active && m.item_id !== null,
		);
		if (candidates.length === 0) continue;
		const exact = candidates.find((m) => m.frame_size === frameSize);
		const fallback = candidates.find((m) => m.frame_size === "");
		const picked = exact ?? fallback;
		if (picked) resolved.set(field, picked);
	}

	const activeWithItem = Array.from(resolved.values());
	const itemIds = activeWithItem
		.map((m) => m.item_id as string)
		.filter((v, i, a) => a.indexOf(v) === i);

	const { data: items } = itemIds.length
		? await supabase
				.from("inventory_items")
				.select("id, sku, purchase_price_avg")
				.in("id", itemIds)
		: { data: [] as Array<{ id: string; sku: string; purchase_price_avg: number | null }> };

	const itemById = new Map(
		((items ?? []) as Array<{ id: string; sku: string; purchase_price_avg: number | null }>).map(
			(it) => [it.id, it],
		),
	);

	// Custom materials by SKU — looked up separately
	const customSkus = rekap.custom_materials
		? Object.keys(rekap.custom_materials).filter(
				(k) => Number(rekap.custom_materials?.[k] ?? 0) > 0,
			)
		: [];
	const { data: customItems } = customSkus.length
		? await supabase
				.from("inventory_items")
				.select("id, sku, purchase_price_avg")
				.in("sku", customSkus)
		: { data: [] as Array<{ id: string; sku: string; purchase_price_avg: number | null }> };
	const itemBySku = new Map(
		((customItems ?? []) as Array<{ id: string; sku: string; purchase_price_avg: number | null }>).map(
			(it) => [it.sku, it],
		),
	);

	const auto: AutoHpp = { ...ZERO_HPP };

	for (const m of activeWithItem) {
		const qtyRekap = Number(rekap[m.rekap_field] ?? 0);
		if (qtyRekap <= 0) continue;
		const item = itemById.get(m.item_id as string);
		if (!item) continue;
		const cost = qtyRekap * (m.qty_per_unit ?? 1) * Number(item.purchase_price_avg ?? 0);
		const bucket = FIELD_TO_BUCKET[m.rekap_field];
		auto[bucket] = (auto[bucket] ?? 0) + Math.round(cost);
	}

	if (rekap.custom_materials) {
		for (const [sku, qtyRaw] of Object.entries(rekap.custom_materials)) {
			const qty = Number(qtyRaw ?? 0);
			if (qty <= 0) continue;
			const it = itemBySku.get(sku);
			if (!it) continue;
			auto.other =
				(auto.other ?? 0) + Math.round(qty * Number(it.purchase_price_avg ?? 0));
		}
	}

	// Bonus cost — item gratis untuk klien (event_bonuses × purchase_price_avg
	// dari inventory_item yang di-link via addons.inventory_item_id). Bucket
	// terpisah dari "other" supaya owner bisa lihat freebie cost di P&L.
	const { data: bonusRows } = await supabase
		.from("event_bonuses")
		.select(
			"quantity, addon:addons(inventory_item:inventory_items(purchase_price_avg))",
		)
		.eq("event_id", eventId);

	type BonusPriceRow = {
		quantity: number;
		addon:
			| {
					inventory_item:
						| { purchase_price_avg: number | null }
						| Array<{ purchase_price_avg: number | null }>
						| null;
			  }
			| Array<{
					inventory_item:
						| { purchase_price_avg: number | null }
						| Array<{ purchase_price_avg: number | null }>
						| null;
			  }>
			| null;
	};
	for (const row of (bonusRows ?? []) as unknown as BonusPriceRow[]) {
		const addon = Array.isArray(row.addon) ? row.addon[0] : row.addon;
		if (!addon) continue;
		const invItem = Array.isArray(addon.inventory_item)
			? addon.inventory_item[0]
			: addon.inventory_item;
		if (!invItem) continue; // addon not linked → no cost tracking
		const qty = Number(row.quantity ?? 0);
		if (qty <= 0) continue;
		auto.bonus =
			(auto.bonus ?? 0) + Math.round(qty * Number(invItem.purchase_price_avg ?? 0));
	}

	return auto;
}
