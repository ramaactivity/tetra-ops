"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	normalizeConversion,
	toBase,
} from "@/lib/inventory/unit-conversion";
import { REKAP_FIELDS, type RekapField } from "@/lib/rekap-mapping/types";
import { createClient } from "@/lib/supabase/server";

const NonNegInt = z.coerce.number().int().nonnegative().default(0);
const NonNegMoney = z.coerce.number().nonnegative().default(0);

const TransportMethodSchema = z
	.enum(["online", "rental", "none"])
	.default("none");

const NullableUrlSchema = z
	.string()
	.trim()
	.optional()
	.transform((v) => (v && v.length > 0 ? v : null))
	.refine((v) => v === null || /^https?:\/\//.test(v), {
		message: "URL bukti tidak valid",
	});

const LainnyaItemsSchema = z
	.string()
	.trim()
	.optional()
	.transform((v): Array<{ note: string; amount: number }> => {
		if (!v) return [];
		try {
			const parsed = JSON.parse(v);
			if (!Array.isArray(parsed)) return [];
			const out: Array<{ note: string; amount: number }> = [];
			for (const row of parsed) {
				if (!row || typeof row !== "object") continue;
				const note = String(
					(row as Record<string, unknown>).note ?? "",
				)
					.trim()
					.slice(0, 120);
				const amount = Number((row as Record<string, unknown>).amount);
				if (!Number.isFinite(amount) || amount < 0) continue;
				if (!note && amount === 0) continue;
				out.push({ note, amount: Math.round(amount) });
				if (out.length >= 20) break;
			}
			return out;
		} catch {
			return [];
		}
	});

const CustomMaterialsSchema = z
	.string()
	.trim()
	.optional()
	.transform((v): Record<string, number> => {
		if (!v) return {};
		try {
			const parsed = JSON.parse(v);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return {};
			}
			const out: Record<string, number> = {};
			for (const [sku, qty] of Object.entries(
				parsed as Record<string, unknown>,
			)) {
				const n = Number(qty);
				if (!Number.isFinite(n) || n <= 0) continue;
				out[sku] = Math.floor(n);
			}
			return out;
		} catch {
			return {};
		}
	});

const RekapInputSchema = z.object({
	cetak_total: NonNegInt,
	media_set_used: NonNegInt,
	sleeve_used: NonNegInt,
	flashdisk_used: NonNegInt,
	pouch_used: NonNegInt,
	photomagnet_used: NonNegInt,
	keychain_used: NonNegInt,
	custom_materials: CustomMaterialsSchema,
	proof_photo_urls: z
		.string()
		.trim()
		.transform((v) =>
			v
				? v
						.split(/[\n,]/)
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
		)
		.refine((arr) => arr.length > 0, {
			message: "Minimal 1 URL foto bukti",
		}),
	crew_notes: z
		.string()
		.trim()
		.max(1000)
		.optional()
		.transform((v) => (v ? v : null)),

	// Field expenses (Phase F2) — biaya operasional lapangan crew
	transport_method: TransportMethodSchema,
	transport_cost: NonNegMoney,
	transport_proof_berangkat_url: NullableUrlSchema,
	transport_proof_pulang_url: NullableUrlSchema,
	bensin_cost: NonNegMoney,
	toll_cost: NonNegMoney,
	parking_cost: NonNegMoney,
	konsumsi_cost: NonNegMoney,
	lainnya_items: LainnyaItemsSchema,
});

export type RekapInput = z.infer<typeof RekapInputSchema>;
type RekapErrors = Partial<Record<keyof RekapInput | "_form", string[]>>;
export type RekapFormState =
	| { errors?: RekapErrors; values?: Record<string, string>; success?: true }
	| undefined;

async function requireOwnerOrCrew() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (
		me.profile.role !== "super_admin" &&
		me.profile.role !== "owner" &&
		me.profile.role !== "crew"
	) {
		throw new Error("Forbidden");
	}
	return me;
}

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

/**
 * Hydrate everything UI needs for crew + owner rekap pages in a single call:
 *  - paket spec (name, frame_size, duration_hours, include_flashdisk_pouch)
 *  - paid add-ons + bonus list (with inventory item link if any)
 *  - rekap_field_mapping with current stock + avg cost per linked item
 *  - inventory pool for "Tambah item lain" Combobox picker
 *
 * Pure read — no side effects. Owner-or-crew gate (rekap pages are
 * authorized at page level via the existing notFound() checks).
 */
export type RekapContextItem = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	purchase_price_avg: number;
	current_stock: number;
};

export type RekapContextMapping = {
	rekap_field: RekapField;
	frame_size: string; // '' = default fallback
	item_id: string | null;
	qty_per_unit: number;
	item: RekapContextItem | null;
};

export type RekapContextAddon = {
	addon_id: string;
	name: string;
	unit: string;
	quantity: number;
	unit_price: number;
	inventory_item: RekapContextItem | null;
};

export type RekapContextBonus = {
	addon_id: string;
	name: string;
	unit: string;
	quantity: number;
	notes: string | null;
	inventory_item: RekapContextItem | null;
};

export type RekapContext = {
	pkg: {
		name: string | null;
		frame_size: string | null;
		duration_hours: number | null;
		include_flashdisk_pouch: boolean | null;
	};
	paid_addons: RekapContextAddon[];
	bonuses: RekapContextBonus[];
	mappings: RekapContextMapping[];
	custom_inventory: RekapContextItem[];
};

export async function getRekapContext(
	eventId: string,
): Promise<RekapContext | { error: string }> {
	await requireOwnerOrCrew();
	const supabase = await createClient();

	// 1) Event + paket + include_flashdisk_pouch
	const { data: event, error: evErr } = await supabase
		.from("events")
		.select(
			`id, include_flashdisk_pouch, frame_size,
			package:packages(name, duration_hours),
			event_addons:event_addons(quantity, unit_price, addon:addons(id, name, unit, inventory_item_id)),
			event_bonuses:event_bonuses(quantity, notes, addon:addons(id, name, unit, inventory_item_id))`,
		)
		.eq("id", eventId)
		.maybeSingle();
	if (evErr) return { error: evErr.message };
	if (!event) return { error: "Event tidak ditemukan." };

	const pkg = Array.isArray(event.package) ? event.package[0] : event.package;

	// 2) Mapping + inventory lookup (batch). Multiple rows per rekap_field
	// (one per frame_size override + a '' default). Caller resolves which
	// row applies via resolveMapping(field, event.frame_size, mappings).
	const { data: mappingsRaw } = await supabase
		.from("rekap_field_mapping")
		.select("rekap_field, frame_size, item_id, qty_per_unit, is_active")
		.eq("is_active", true);

	const mappedItemIds = ((mappingsRaw ?? []) as Array<{ item_id: string | null }>)
		.map((m) => m.item_id)
		.filter((v): v is string => Boolean(v));

	// Collect addon-linked inventory IDs too (paid + bonuses)
	const addonInventoryIds = new Set<string>();
	type AddonRow = {
		quantity: number;
		unit_price?: number;
		notes?: string | null;
		addon:
			| {
					id: string;
					name: string;
					unit: string;
					inventory_item_id: string | null;
			  }
			| Array<{
					id: string;
					name: string;
					unit: string;
					inventory_item_id: string | null;
			  }>
			| null;
	};
	const paidAddonRows = ((event.event_addons ?? []) as unknown as AddonRow[]) ?? [];
	const bonusAddonRows = ((event.event_bonuses ?? []) as unknown as AddonRow[]) ?? [];
	for (const row of [...paidAddonRows, ...bonusAddonRows]) {
		const a = Array.isArray(row.addon) ? row.addon[0] : row.addon;
		if (a?.inventory_item_id) addonInventoryIds.add(a.inventory_item_id);
	}

	const allItemIds = Array.from(
		new Set([...mappedItemIds, ...Array.from(addonInventoryIds)]),
	);

	const itemsById = new Map<string, RekapContextItem>();
	if (allItemIds.length > 0) {
		const { data: items } = await supabase
			.from("inventory_items")
			.select("id, sku, name, unit, purchase_price_avg")
			.in("id", allItemIds);
		// Fetch stock in parallel via RPC per item (no batch RPC available)
		const stockPairs = await Promise.all(
			(items ?? []).map(async (it) => {
				const { data: stock } = await supabase.rpc("get_current_stock", {
					p_item_id: it.id as string,
				});
				return [it.id as string, Number(stock ?? 0)] as const;
			}),
		);
		const stockMap = new Map(stockPairs);
		for (const it of items ?? []) {
			itemsById.set(it.id as string, {
				id: it.id as string,
				sku: it.sku as string,
				name: it.name as string,
				unit: (it.unit as string | null) ?? "pcs",
				purchase_price_avg: Number(it.purchase_price_avg ?? 0),
				current_stock: stockMap.get(it.id as string) ?? 0,
			});
		}
	}

	const mappings: RekapContextMapping[] = (
		(mappingsRaw ?? []) as Array<{
			rekap_field: RekapField;
			frame_size: string | null;
			item_id: string | null;
			qty_per_unit: number | string;
		}>
	).map((m) => ({
		rekap_field: m.rekap_field,
		frame_size: m.frame_size ?? "",
		item_id: m.item_id,
		qty_per_unit: Number(m.qty_per_unit) || 1,
		item: m.item_id ? (itemsById.get(m.item_id) ?? null) : null,
	}));

	const paid_addons: RekapContextAddon[] = paidAddonRows
		.map((row) => {
			const a = Array.isArray(row.addon) ? row.addon[0] : row.addon;
			if (!a) return null;
			return {
				addon_id: a.id,
				name: a.name,
				unit: a.unit,
				quantity: Number(row.quantity ?? 0),
				unit_price: Number(row.unit_price ?? 0),
				inventory_item: a.inventory_item_id
					? (itemsById.get(a.inventory_item_id) ?? null)
					: null,
			};
		})
		.filter((v): v is RekapContextAddon => Boolean(v));

	const bonuses: RekapContextBonus[] = bonusAddonRows
		.map((row) => {
			const a = Array.isArray(row.addon) ? row.addon[0] : row.addon;
			if (!a) return null;
			return {
				addon_id: a.id,
				name: a.name,
				unit: a.unit,
				quantity: Number(row.quantity ?? 0),
				notes: row.notes ?? null,
				inventory_item: a.inventory_item_id
					? (itemsById.get(a.inventory_item_id) ?? null)
					: null,
			};
		})
		.filter((v): v is RekapContextBonus => Boolean(v));

	// 3) Custom inventory pool: all consumable items not yet covered by
	// mappings (those have dedicated fields). User picks from this list to
	// record "kami pakai 50× sticker X dari stok lain".
	const mappedSet = new Set(allItemIds);
	const { data: poolRaw } = await supabase
		.from("inventory_items")
		.select("id, sku, name, unit, purchase_price_avg")
		.eq("category", "consumable")
		.eq("is_active", true)
		.is("deleted_at", null)
		.order("sku", { ascending: true });

	const custom_inventory: RekapContextItem[] = [];
	for (const it of (poolRaw ?? []) as Array<{
		id: string;
		sku: string;
		name: string;
		unit: string | null;
		purchase_price_avg: number | null;
	}>) {
		if (mappedSet.has(it.id)) continue; // skip — covered by mapping
		const cached = itemsById.get(it.id);
		// Fetch stock only for items not already in itemsById
		let stock = cached?.current_stock ?? 0;
		if (!cached) {
			const { data: s } = await supabase.rpc("get_current_stock", {
				p_item_id: it.id,
			});
			stock = Number(s ?? 0);
		}
		custom_inventory.push({
			id: it.id,
			sku: it.sku,
			name: it.name,
			unit: it.unit ?? "pcs",
			purchase_price_avg: Number(it.purchase_price_avg ?? 0),
			current_stock: stock,
		});
	}

	return {
		pkg: {
			name: pkg?.name ?? null,
			frame_size: (event.frame_size as string | null) ?? null,
			duration_hours: pkg?.duration_hours ?? null,
			include_flashdisk_pouch:
				(event.include_flashdisk_pouch as boolean | null) ?? null,
		},
		paid_addons,
		bonuses,
		mappings,
		custom_inventory,
	};
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = [
		"cetak_total",
		"media_set_used",
		"sleeve_used",
		"flashdisk_used",
		"pouch_used",
		"photomagnet_used",
		"keychain_used",
		"custom_materials",
		"proof_photo_urls",
		"crew_notes",
		"transport_method",
		"transport_cost",
		"transport_proof_berangkat_url",
		"transport_proof_pulang_url",
		"bensin_cost",
		"toll_cost",
		"parking_cost",
		"konsumsi_cost",
		"lainnya_items",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

export async function submitRekap(
	eventId: string,
	projectId: string,
	_prev: RekapFormState,
	formData: FormData,
): Promise<RekapFormState> {
	const me = await requireOwnerOrCrew();

	const parsed = RekapInputSchema.safeParse({
		cetak_total: formData.get("cetak_total"),
		media_set_used: formData.get("media_set_used"),
		sleeve_used: formData.get("sleeve_used"),
		flashdisk_used: formData.get("flashdisk_used"),
		pouch_used: formData.get("pouch_used"),
		photomagnet_used: formData.get("photomagnet_used"),
		keychain_used: formData.get("keychain_used"),
		custom_materials: formData.get("custom_materials"),
		proof_photo_urls: formData.get("proof_photo_urls"),
		crew_notes: formData.get("crew_notes"),
		transport_method: formData.get("transport_method"),
		transport_cost: formData.get("transport_cost"),
		transport_proof_berangkat_url: formData.get(
			"transport_proof_berangkat_url",
		),
		transport_proof_pulang_url: formData.get("transport_proof_pulang_url"),
		bensin_cost: formData.get("bensin_cost"),
		toll_cost: formData.get("toll_cost"),
		parking_cost: formData.get("parking_cost"),
		konsumsi_cost: formData.get("konsumsi_cost"),
		lainnya_items: formData.get("lainnya_items"),
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as RekapErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();

	// Authorization: crew can only submit rekap for events they're assigned
	// to. Owner-level can submit for any event (e.g. retroactive entries).
	if (me.profile.role === "crew") {
		const { data: assignment } = await supabase
			.from("crew_assignments")
			.select("id")
			.eq("event_id", eventId)
			.eq("user_id", me.profile.id)
			.maybeSingle();
		if (!assignment) {
			return {
				errors: {
					_form: ["Lo gak di-assign ke event ini, gak bisa submit rekap."],
				},
				values: snapshotValues(formData),
			};
		}
	}

	// Upsert by event_id (UNIQUE)
	const { data: existing } = await supabase
		.from("crew_rekap")
		.select("id, is_approved")
		.eq("event_id", eventId)
		.maybeSingle();

	// Block edits to already-approved rekaps (owner can re-open via reject)
	if (existing && existing.is_approved === true) {
		return {
			errors: {
				_form: [
					"Rekap sudah di-approve owner. Hubungi owner kalau perlu revisi.",
				],
			},
			values: snapshotValues(formData),
		};
	}

	// Bensin only relevant for rental method; zero-out for online/none to keep
	// the data clean (UI hides the input but defensively normalize here).
	const bensinCost =
		parsed.data.transport_method === "rental" ? parsed.data.bensin_cost : 0;
	// Transport proof only relevant for online method; clear urls otherwise.
	const proofBerangkat =
		parsed.data.transport_method === "online"
			? parsed.data.transport_proof_berangkat_url
			: null;
	const proofPulang =
		parsed.data.transport_method === "online"
			? parsed.data.transport_proof_pulang_url
			: null;
	// transport_cost is 0 when method = none
	const transportCost =
		parsed.data.transport_method === "none" ? 0 : parsed.data.transport_cost;

	// Snapshot event.frame_size at submit time. Kalau owner ubah event.frame_size
	// nanti (mis. typo correction), rekap tetap pakai snapshot frozen → preserves
	// historical accuracy untuk HPP calculation di settlement.
	const { data: eventSnap } = await supabase
		.from("events")
		.select("frame_size")
		.eq("id", eventId)
		.maybeSingle();

	const payload = {
		event_id: eventId,
		submitted_by: me.profile.id,
		frame_size_snapshot: eventSnap?.frame_size ?? null,
		cetak_total: parsed.data.cetak_total,
		media_set_used: parsed.data.media_set_used,
		sleeve_used: parsed.data.sleeve_used,
		flashdisk_used: parsed.data.flashdisk_used,
		pouch_used: parsed.data.pouch_used,
		photomagnet_used: parsed.data.photomagnet_used,
		keychain_used: parsed.data.keychain_used,
		custom_materials: parsed.data.custom_materials,
		proof_photo_urls: parsed.data.proof_photo_urls,
		crew_notes: parsed.data.crew_notes,
		transport_method: parsed.data.transport_method,
		transport_cost: transportCost,
		transport_proof_berangkat_url: proofBerangkat,
		transport_proof_pulang_url: proofPulang,
		bensin_cost: bensinCost,
		toll_cost: parsed.data.toll_cost,
		parking_cost: parsed.data.parking_cost,
		konsumsi_cost: parsed.data.konsumsi_cost,
		lainnya_items: parsed.data.lainnya_items,
	};

	if (existing) {
		const { error } = await supabase
			.from("crew_rekap")
			.update(payload)
			.eq("id", existing.id);
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: snapshotValues(formData),
			};
		}
	} else {
		const { error } = await supabase.from("crew_rekap").insert(payload);
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: snapshotValues(formData),
			};
		}
	}

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/settle`);
	return { success: true };
}

type RekapStockSnapshot = {
	id: string;
	event_id: string;
	is_approved: boolean | null;
	stock_committed_at: string | null;
	stock_movement_batch_id: string | null;
	cetak_total: number;
	media_set_used: number;
	sleeve_used: number;
	flashdisk_used: number;
	pouch_used: number;
	photomagnet_used: number;
	keychain_used: number;
	custom_materials: Record<string, number> | null;
};

type DeductionLine = {
	item_id: string;
	sku: string;
	name: string;
	qty: number;
	unit_cost: number;
	source_label: string; // e.g. "media_set_used" or "extra: ITEM-X"
};

async function readAutoDeductFlag(
	supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
	const { data } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "rekap.auto_deduct_stock")
		.maybeSingle();
	if (!data) return true; // default ON
	const v = data.value;
	if (typeof v === "boolean") return v;
	if (typeof v === "string") return v === "true" || v === "1";
	if (typeof v === "number") return v !== 0;
	return true;
}

/**
 * Compute the deduction plan for a rekap (Inventory v2, 2026-05-21).
 *
 * New model:
 *   - 1 event = 1 frame_size (business rule, no mix)
 *   - Media + Sleeve consumption derived from event.frame_size + cetak_total
 *   - Add-on consumables (flashdisk, pouch, photomagnet, keychain) flat 1:1
 *   - No more rekap_field_mapping query — hardcoded recipe (data was
 *     migration drift target; user signed off on hardcoded canonical recipe)
 *
 * Capacity (per 1 roll):
 *   - MEDIA-BASIC: 700 prints 4R OR 1400 prints 2R
 *   - MEDIA-PERF:  1400 prints polaroid
 *
 * NUMERIC fractional rolls supported (stock_movements.quantity is NUMERIC(12,4)
 * post-2026-05-21 migration).
 *
 * Custom materials + event bonuses preserved unchanged.
 */
async function planRekapDeduction(
	supabase: Awaited<ReturnType<typeof createClient>>,
	rekap: RekapStockSnapshot,
): Promise<{ lines: DeductionLine[]; missingMappings: RekapField[] }> {
	const [{ data: event }, { data: items }] = await Promise.all([
		supabase
			.from("events")
			.select("frame_size")
			.eq("id", rekap.event_id)
			.maybeSingle(),
		supabase
			.from("inventory_items")
			.select("id, sku, name, unit, unit_conversion, purchase_price_avg")
			.in("sku", [
				"MEDIA-BASIC",
				"MEDIA-PERF",
				"SLEEVE-4R",
				"SLEEVE-2R",
				"SLEEVE-PR",
				"FLASHDISK",
				"FD-BOX",
				"POUCH",
				"PHOTOMAGNET",
				"KEY-FRAME",
				"KEY-STRAP",
			])
			.is("deleted_at", null),
	]);
	const frameSize = ((event?.frame_size as string | null) ?? "").trim();
	const cetakTotal = Number(rekap.cetak_total ?? 0);

	const itemsBySku = new Map(
		(items ?? []).map((it) => [
			it.sku,
			it as {
				id: string;
				sku: string;
				name: string;
				unit: string;
				unit_conversion: unknown;
				purchase_price_avg: number | null;
			},
		]),
	);

	/**
	 * Per-print roll consumption, sourced from inventory_items.unit_conversion
	 * (v2 shape). Fall back to legacy hardcoded ratio if lookup fails — this
	 * keeps rekap deduction working even if a future migration drops the
	 * consumption unit row by accident.
	 */
	function rollPerPrint(
		mediaSku: "MEDIA-BASIC" | "MEDIA-PERF",
		lembarUnit: "lembar_4r" | "lembar_2r" | "lembar_polaroid",
		fallback: number,
	): number {
		const item = itemsBySku.get(mediaSku);
		if (!item) return fallback;
		try {
			const map = normalizeConversion(item.unit_conversion, item.unit);
			// 1 lembar_X converted to base (roll) = roll cost of 1 print.
			return toBase(1, lembarUnit, map);
		} catch {
			return fallback;
		}
	}

	// Custom-material SKU lookup (preserved from v1)
	const customSkus: string[] = rekap.custom_materials
		? Object.keys(rekap.custom_materials).filter(
				(k) => Number(rekap.custom_materials?.[k] ?? 0) > 0,
			)
		: [];
	if (customSkus.length > 0) {
		const { data: customItems } = await supabase
			.from("inventory_items")
			.select("id, sku, name, purchase_price_avg")
			.in("sku", customSkus)
			.is("deleted_at", null);
		for (const it of customItems ?? []) {
			if (!itemsBySku.has(it.sku)) {
				itemsBySku.set(it.sku, it as never);
			}
		}
	}

	// Per-frame-size recipe (data-driven from user's spec 2026-05-21)
	const SIZE_RECIPE: Record<
		string,
		{
			mediaSku: "MEDIA-BASIC" | "MEDIA-PERF";
			mediaQtyPerPrint: number; // roll units per single print
			sleeveSku: "SLEEVE-4R" | "SLEEVE-2R" | "SLEEVE-PR";
		}
	> = {
		"4R": {
			mediaSku: "MEDIA-BASIC",
			mediaQtyPerPrint: rollPerPrint("MEDIA-BASIC", "lembar_4r", 1 / 700),
			sleeveSku: "SLEEVE-4R",
		},
		"2R": {
			mediaSku: "MEDIA-BASIC",
			mediaQtyPerPrint: rollPerPrint("MEDIA-BASIC", "lembar_2r", 1 / 1400),
			sleeveSku: "SLEEVE-2R",
		},
		polaroid: {
			mediaSku: "MEDIA-PERF",
			mediaQtyPerPrint: rollPerPrint(
				"MEDIA-PERF",
				"lembar_polaroid",
				1 / 1400,
			),
			sleeveSku: "SLEEVE-PR",
		},
	};

	const lines: DeductionLine[] = [];
	const missingMappings: RekapField[] = [];

	// Media + Sleeve derivation (skip if no prints or unknown frame_size)
	const recipe = SIZE_RECIPE[frameSize];
	if (cetakTotal > 0 && recipe) {
		const mediaItem = itemsBySku.get(recipe.mediaSku);
		if (mediaItem) {
			lines.push({
				item_id: mediaItem.id,
				sku: mediaItem.sku,
				name: mediaItem.name,
				qty: cetakTotal * recipe.mediaQtyPerPrint,
				unit_cost: Number(mediaItem.purchase_price_avg ?? 0),
				source_label: "cetak_total",
			});
		} else {
			missingMappings.push("cetak_total");
		}

		const sleeveItem = itemsBySku.get(recipe.sleeveSku);
		if (sleeveItem) {
			lines.push({
				item_id: sleeveItem.id,
				sku: sleeveItem.sku,
				name: sleeveItem.name,
				qty: cetakTotal, // 1:1 with prints
				unit_cost: Number(sleeveItem.purchase_price_avg ?? 0),
				source_label: "sleeve_used",
			});
		} else {
			missingMappings.push("sleeve_used");
		}
	}

	// Assembly-component recipes (Inventory v2, 2026-05-21).
	// 1 crew-recorded unit → N inventory SKU deductions. Flashdisk + keychain
	// are component-level (FLASHDISK + FD-BOX, KEY-FRAME + KEY-STRAP) since
	// owner buys parts separately and assembles per event. Pouch + photomagnet
	// stay 1:1 — they don't have separable sub-components.
	const ASSEMBLY_RULES: Array<{
		field: Exclude<RekapField, "cetak_total" | "media_set_used" | "sleeve_used">;
		components: Array<{ sku: string; qtyPerUnit: number }>;
	}> = [
		{
			field: "flashdisk_used",
			components: [
				{ sku: "FLASHDISK", qtyPerUnit: 1 },
				{ sku: "FD-BOX", qtyPerUnit: 1 },
			],
		},
		{
			field: "pouch_used",
			components: [{ sku: "POUCH", qtyPerUnit: 1 }],
		},
		{
			field: "photomagnet_used",
			components: [{ sku: "PHOTOMAGNET", qtyPerUnit: 1 }],
		},
		{
			field: "keychain_used",
			components: [
				{ sku: "KEY-FRAME", qtyPerUnit: 1 },
				{ sku: "KEY-STRAP", qtyPerUnit: 1 },
			],
		},
	];
	for (const { field, components } of ASSEMBLY_RULES) {
		const qty = Number(rekap[field] ?? 0);
		if (qty <= 0) continue;
		for (const { sku, qtyPerUnit } of components) {
			const item = itemsBySku.get(sku);
			if (!item) {
				if (!missingMappings.includes(field)) missingMappings.push(field);
				continue;
			}
			lines.push({
				item_id: item.id,
				sku: item.sku,
				name: item.name,
				qty: qty * qtyPerUnit,
				unit_cost: Number(item.purchase_price_avg ?? 0),
				source_label:
					components.length > 1 ? `${field} → ${sku}` : field,
			});
		}
	}

	if (rekap.custom_materials) {
		for (const [sku, qtyRaw] of Object.entries(rekap.custom_materials)) {
			const qty = Number(qtyRaw ?? 0);
			if (qty <= 0) continue;
			const item = itemsBySku.get(sku);
			if (!item) continue; // silently skip unknown SKU
			lines.push({
				item_id: item.id,
				sku: item.sku,
				name: item.name,
				qty,
				unit_cost: Number(item.purchase_price_avg ?? 0),
				source_label: `extra: ${sku}`,
			});
		}
	}

	// Bonuses — item gratis yang kasih ke klien (event_bonuses).
	// Lookup chain: event_bonuses.addon_id → addons.inventory_item_id →
	// inventory_items. Addons tanpa inventory_item_id silently skipped.
	const { data: bonusRows } = await supabase
		.from("event_bonuses")
		.select(
			"quantity, addon:addons(name, inventory_item_id, inventory_item:inventory_items(id, sku, name, purchase_price_avg))",
		)
		.eq("event_id", rekap.event_id);

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
	for (const row of (bonusRows ?? []) as unknown as BonusRow[]) {
		const addon = Array.isArray(row.addon) ? row.addon[0] : row.addon;
		if (!addon) continue;
		const invItem = Array.isArray(addon.inventory_item)
			? addon.inventory_item[0]
			: addon.inventory_item;
		if (!invItem) continue; // addon not linked to inventory — no stock track
		const qty = Number(row.quantity ?? 0);
		if (qty <= 0) continue;
		lines.push({
			item_id: invItem.id,
			sku: invItem.sku,
			name: invItem.name,
			qty,
			unit_cost: Number(invItem.purchase_price_avg ?? 0),
			source_label: `bonus: ${addon.name}`,
		});
	}

	return { lines, missingMappings };
}

function buildRefId(direction: "in" | "out") {
	const code = direction === "in" ? "I" : "O";
	const r = Math.floor(Math.random() * 99_999_999)
		.toString()
		.padStart(8, "0");
	return `MOV-${code}-${r}`;
}

/**
 * Public action: returns deduction lines for an unapproved rekap so the
 * UI can show a preview before owner clicks "Approve". Owner-level only.
 */
export async function getRekapApprovalPreview(
	rekapId: string,
): Promise<
	| {
			ok: true;
			lines: DeductionLine[];
			missingMappings: RekapField[];
			autoDeductEnabled: boolean;
			alreadyCommitted: boolean;
	  }
	| { ok: false; error: string }
> {
	await requireOwnerLevel();
	const supabase = await createClient();

	const { data: rekap, error } = await supabase
		.from("crew_rekap")
		.select(
			"id, event_id, is_approved, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("id", rekapId)
		.maybeSingle();
	if (error || !rekap) {
		return { ok: false, error: error?.message ?? "Rekap tidak ditemukan" };
	}

	const flag = await readAutoDeductFlag(supabase);
	const plan = await planRekapDeduction(supabase, rekap as RekapStockSnapshot);

	return {
		ok: true,
		lines: plan.lines,
		missingMappings: plan.missingMappings,
		autoDeductEnabled: flag,
		alreadyCommitted: rekap.stock_committed_at !== null,
	};
}

export async function reviewRekap(
	rekapId: string,
	projectId: string,
	approved: boolean,
	notes: string,
): Promise<{ error?: string }> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();

	// Read pre-update state to decide stock side-effects
	const { data: existing } = await supabase
		.from("crew_rekap")
		.select(
			"id, event_id, is_approved, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("id", rekapId)
		.maybeSingle();
	if (!existing) return { error: "Rekap tidak ditemukan" };

	const wasApproved = existing.is_approved === true;
	const willApprove = approved === true;
	const hadStockCommitted = existing.stock_committed_at !== null;

	const autoDeductEnabled = await readAutoDeductFlag(supabase);

	// 1. UPDATE the rekap row first (review fields)
	const updatePayload: Record<string, unknown> = {
		is_approved: approved,
		reviewed_by: me.profile.id,
		reviewed_at: new Date().toISOString(),
		review_notes: notes.trim() || null,
	};

	// 2. Handle stock side-effects
	if (
		willApprove &&
		!wasApproved &&
		!hadStockCommitted &&
		autoDeductEnabled
	) {
		// Approval transition → deduct stock
		const plan = await planRekapDeduction(
			supabase,
			existing as RekapStockSnapshot,
		);
		if (plan.lines.length > 0) {
			const batchId = randomUUID();
			const movements = plan.lines.map((l) => ({
				ref_id: buildRefId("out"),
				item_id: l.item_id,
				direction: "out" as const,
				quantity: l.qty,
				unit_cost: l.unit_cost,
				source: "rekap_consumption",
				source_id: existing.event_id,
				source_description: `Rekap approved (${l.source_label})`,
				notes: `Auto-deduct from rekap approval — batch ${batchId.slice(0, 8)}`,
				performed_by: me.profile.id,
			}));
			const { error: insErr } = await supabase
				.from("stock_movements")
				.insert(movements);
			if (insErr) {
				return { error: `Gagal create stock movements: ${insErr.message}` };
			}
			updatePayload.stock_committed_at = new Date().toISOString();
			updatePayload.stock_movement_batch_id = batchId;
		}
	} else if (!willApprove && wasApproved && hadStockCommitted) {
		// Reject after prior approval → reverse the original movements
		const { data: priorMovements } = await supabase
			.from("stock_movements")
			.select("id, item_id, quantity, unit_cost, source_description")
			.eq("source", "rekap_consumption")
			.eq("source_id", existing.event_id)
			.eq("direction", "out");

		if (priorMovements && priorMovements.length > 0) {
			const reversals = priorMovements.map((m) => ({
				ref_id: buildRefId("in"),
				item_id: m.item_id,
				direction: "in" as const,
				quantity: m.quantity,
				unit_cost: m.unit_cost,
				source: "rekap_consumption",
				source_id: existing.event_id,
				source_description: `Reversal: rekap rejected (${m.source_description ?? ""})`,
				notes: "Auto-reversal: rekap rejected after prior approval",
				performed_by: me.profile.id,
			}));
			const { error: revErr } = await supabase
				.from("stock_movements")
				.insert(reversals);
			if (revErr) {
				return {
					error: `Gagal create reversal movements: ${revErr.message}`,
				};
			}
		}
		updatePayload.stock_committed_at = null;
		updatePayload.stock_movement_batch_id = null;
	}

	const { error } = await supabase
		.from("crew_rekap")
		.update(updatePayload)
		.eq("id", rekapId);
	if (error) return { error: error.message };

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/settle`);
	revalidatePath("/warehouse");
	return {};
}

// Re-export REKAP_FIELDS so consumers don't need a second import.
export async function listRekapFields(): Promise<readonly RekapField[]> {
	return REKAP_FIELDS;
}
