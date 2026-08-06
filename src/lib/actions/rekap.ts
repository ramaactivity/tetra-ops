"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	notifyRekapReviewed,
	notifyRekapSubmitted,
} from "@/lib/actions/rekap-notifications";
import { alertRestockAfterCommit } from "@/lib/actions/restock-alert";
import { getCurrentUser } from "@/lib/auth/get-user";
import { bucketForSku } from "@/lib/inventory/cogs-buckets";
import { normalizeConversion, toBase } from "@/lib/inventory/unit-conversion";
import {
	type DeductionLine,
	projectEventLinesFromSpec,
} from "@/lib/rekap/project-demand";
import { bucketHpp, type HppBreakdown, roundQty } from "@/lib/rekap/recipe";
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

/**
 * Pembayar biaya lapangan:
 *  - "owner"  → uang perusahaan; TIDAK masuk OpEx settlement (owner catat
 *               sendiri via Catat transaksi).
 *  - <uuid>   → ditalangi crew TERTENTU; reimburse jatuh ke orang itu.
 *  - "crew"   → ditalangi crew tapi belum ditentukan siapa (nilai lama /
 *               default aman — owner yang membagi manual).
 * Yang mengisi rekap belum tentu yang membayar, jadi penalang dipilih per item.
 */
export type ExpensePaidBy = string;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paidByOf = (v: unknown): ExpensePaidBy => {
	if (v === "owner") return "owner";
	if (typeof v === "string" && UUID_RE.test(v.trim())) return v.trim();
	return "crew";
};

const LainnyaItemsSchema = z
	.string()
	.trim()
	.optional()
	.transform(
		(
			v,
		): Array<{
			note: string;
			amount: number;
			paid_by: ExpensePaidBy;
			nota_url: string | null;
		}> => {
			if (!v) return [];
			try {
				const parsed = JSON.parse(v);
				if (!Array.isArray(parsed)) return [];
				const out: Array<{
					note: string;
					amount: number;
					paid_by: ExpensePaidBy;
					nota_url: string | null;
				}> = [];
				for (const row of parsed) {
					if (!row || typeof row !== "object") continue;
					const r = row as Record<string, unknown>;
					const note = String(r.note ?? "")
						.trim()
						.slice(0, 120);
					const amount = Number(r.amount);
					if (!Number.isFinite(amount) || amount < 0) continue;
					if (!note && amount === 0) continue;
					out.push({
						note,
						amount: Math.round(amount),
						paid_by: paidByOf(r.paid_by),
						nota_url: safeUrl(r.nota_url),
					});
					if (out.length >= 20) break;
				}
				return out;
			} catch {
				return [];
			}
		},
	);

/** URL nota valid (http/https) atau null — jangan simpan sampah dari client. */
function safeUrl(v: unknown): string | null {
	const s = typeof v === "string" ? v.trim() : "";
	return s && /^https?:\/\//.test(s) ? s.slice(0, 500) : null;
}

/**
 * Map {transport|bensin|toll|parking|konsumsi: <drive_url>} — nota per biaya
 * lapangan, diagregasi ke Arsip Nota lewat v_nota_sistem.
 */
const ExpenseNotaSchema = z
	.string()
	.trim()
	.optional()
	.transform((v): Record<string, string> => {
		if (!v) return {};
		try {
			const parsed = JSON.parse(v);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return {};
			}
			const out: Record<string, string> = {};
			for (const key of EXPENSE_PAID_BY_KEYS) {
				const url = safeUrl((parsed as Record<string, unknown>)[key]);
				if (url) out[key] = url;
			}
			return out;
		} catch {
			return {};
		}
	});

/**
 * Map {transport|bensin|toll|parking|konsumsi: 'crew'|'owner'} dari hidden
 * input JSON. Key tak dikenal dibuang; nilai tak valid jatuh ke 'crew'
 * (default aman = perilaku lama: talangan crew → Hutang Crew).
 */
const EXPENSE_PAID_BY_KEYS = [
	"transport",
	"bensin",
	"toll",
	"parking",
	"konsumsi",
] as const;
export type ExpensePaidByMap = Partial<
	Record<(typeof EXPENSE_PAID_BY_KEYS)[number], ExpensePaidBy>
>;
const ExpensePaidBySchema = z
	.string()
	.trim()
	.optional()
	.transform((v): ExpensePaidByMap => {
		if (!v) return {};
		try {
			const parsed = JSON.parse(v);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return {};
			}
			const out: ExpensePaidByMap = {};
			for (const key of EXPENSE_PAID_BY_KEYS) {
				const raw = (parsed as Record<string, unknown>)[key];
				// Hanya simpan kalau memang ada nilainya — key yang absen berarti
				// "belum ditentukan" dan jatuh ke default 'crew' saat dibaca.
				if (raw !== undefined && raw !== null && raw !== "") {
					out[key] = paidByOf(raw);
				}
			}
			return out;
		} catch {
			return {};
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
	expense_paid_by: ExpensePaidBySchema,
	expense_nota_urls: ExpenseNotaSchema,
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
	unit_conversion: unknown;
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

export type RekapContextBundleComponent = {
	item_id: string;
	sku: string;
	name: string;
	qty: number;
	unit: string;
	purchase_price_avg: number;
};

export type RekapContextBundle = {
	id: string;
	name: string;
	components: RekapContextBundleComponent[];
};

export type RekapContext = {
	pkg: {
		name: string | null;
		frame_size: string | null;
		duration_hours: number | null;
		include_flashdisk_pouch: boolean | null;
	};
	bundle: RekapContextBundle | null;
	paid_addons: RekapContextAddon[];
	bonuses: RekapContextBonus[];
	mappings: RekapContextMapping[];
	custom_inventory: RekapContextItem[];
	/**
	 * Crew yang bertugas di event ini — dipakai memilih SIAPA yang menalangi
	 * tiap biaya lapangan. Yang mengisi rekap belum tentu yang bayar (mis.
	 * rekap diisi Asisten, bensin dibayar Lead), jadi penalang dipilih
	 * eksplisit per item, bukan diasumsikan dari submitter.
	 */
	crew: Array<{ user_id: string; name: string; role: string }>;
};

export async function getRekapContext(
	eventId: string,
): Promise<RekapContext | { error: string }> {
	const me = await requireOwnerOrCrew();
	const isCrew = me.profile.role === "crew";
	const supabase = await createClient();

	// Komponen bundle: owner meng-embed inventory_items langsung (butuh
	// purchase_price_avg untuk HPP). Crew TIDAK BOLEH — sejak 20260721g tabel
	// dasarnya owner-only, jadi embed-nya akan mengembalikan kosong dan daftar
	// komponen hilang dari form rekap. Untuk crew kita ambil item_id saja lalu
	// resolve namanya dari view inventory_items_safe di bawah. Bedanya penting:
	// biaya bukan "dinol-kan setelah diambil", tapi TIDAK PERNAH diambil.
	const bundleComponentSelect = isCrew
		? "components:bundle_components(qty, item_id)"
		: `components:bundle_components(qty,
			      item:inventory_items!bundle_components_item_id_fkey(id, sku, name, unit, purchase_price_avg)
			    )`;

	// 1) Event + paket + include_flashdisk_pouch + bundle BOM (if linked)
	const { data: event, error: evErr } = await supabase
		.from("events")
		.select(
			`id, include_flashdisk_pouch, frame_size,
			package:packages(name, duration_hours, bundle_id,
			  bundle:item_bundles(id, name, is_active,
			    ${bundleComponentSelect}
			  )
			),
			event_addons:event_addons(quantity, unit_price, addon:addons(id, name, unit, inventory_item_id)),
			event_bonuses:event_bonuses(quantity, notes, addon:addons(id, name, unit, inventory_item_id))`,
		)
		.eq("id", eventId)
		.maybeSingle();
	if (evErr) return { error: evErr.message };
	if (!event) return { error: "Event tidak ditemukan." };

	const pkg = Array.isArray(event.package) ? event.package[0] : event.package;
	const pkgBundle = pkg
		? Array.isArray((pkg as { bundle?: unknown }).bundle)
			? ((pkg as { bundle?: unknown[] }).bundle ?? [])[0]
			: ((pkg as { bundle?: unknown }).bundle ?? null)
		: null;
	type BundleRowShape = {
		id: string;
		name: string;
		is_active: boolean;
		components: Array<{
			qty: number | string;
			/** Hanya terisi di jalur crew (embed item sengaja tidak diminta). */
			item_id?: string | null;
			item?:
				| {
						id: string;
						sku: string;
						name: string;
						unit: string | null;
						purchase_price_avg: number | null;
				  }
				| Array<{
						id: string;
						sku: string;
						name: string;
						unit: string | null;
						purchase_price_avg: number | null;
				  }>
				| null;
		}>;
	};
	const bundleRow = pkgBundle as BundleRowShape | null;
	let bundle: RekapContextBundle | null = null;
	if (bundleRow && bundleRow.is_active) {
		const rawComponents = bundleRow.components ?? [];

		if (isCrew) {
			// Resolve nama/unit komponen dari view tanpa kolom biaya.
			const ids = rawComponents
				.map((c) => c.item_id)
				.filter((v): v is string => Boolean(v));
			const { data: safeItems } = ids.length
				? await supabase
						.from("inventory_items_safe")
						.select("id, sku, name, unit")
						.in("id", ids)
				: { data: [] };
			const byId = new Map(
				(
					(safeItems ?? []) as Array<{
						id: string;
						sku: string;
						name: string;
						unit: string | null;
					}>
				).map((it) => [it.id, it]),
			);
			bundle = {
				id: bundleRow.id,
				name: bundleRow.name,
				components: rawComponents
					.map((c) => {
						const it = c.item_id ? byId.get(c.item_id) : undefined;
						if (!it) return null;
						return {
							item_id: it.id,
							sku: it.sku,
							name: it.name,
							qty: Number(c.qty),
							unit: it.unit ?? "pcs",
							// Crew tidak pernah menerima biaya — bukan disamarkan, memang
							// tidak ikut diambil dari database.
							purchase_price_avg: 0,
						};
					})
					.filter((c): c is RekapContextBundleComponent => c !== null),
			};
		} else {
			bundle = {
				id: bundleRow.id,
				name: bundleRow.name,
				components: rawComponents
					.map((c) => {
						const it = Array.isArray(c.item) ? c.item[0] : c.item;
						if (!it) return null;
						return {
							item_id: it.id,
							sku: it.sku,
							name: it.name,
							qty: Number(c.qty),
							unit: it.unit ?? "pcs",
							purchase_price_avg: Number(it.purchase_price_avg ?? 0),
						};
					})
					.filter((c): c is RekapContextBundleComponent => c !== null),
			};
		}
	}

	// 2) Mapping + inventory lookup (batch). Multiple rows per rekap_field
	// (one per frame_size override + a '' default). Caller resolves which
	// row applies via resolveMapping(field, event.frame_size, mappings).
	const { data: mappingsRaw } = await supabase
		.from("rekap_field_mapping")
		.select("rekap_field, frame_size, item_id, qty_per_unit, is_active")
		.eq("is_active", true);

	const mappedItemIds = (
		(mappingsRaw ?? []) as Array<{ item_id: string | null }>
	)
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
	const paidAddonRows =
		((event.event_addons ?? []) as unknown as AddonRow[]) ?? [];
	const bonusAddonRows =
		((event.event_bonuses ?? []) as unknown as AddonRow[]) ?? [];
	for (const row of [...paidAddonRows, ...bonusAddonRows]) {
		const a = Array.isArray(row.addon) ? row.addon[0] : row.addon;
		if (a?.inventory_item_id) addonInventoryIds.add(a.inventory_item_id);
	}

	const allItemIds = Array.from(
		new Set([...mappedItemIds, ...Array.from(addonInventoryIds)]),
	);

	const itemsById = new Map<string, RekapContextItem>();
	if (allItemIds.length > 0) {
		// Crew membaca view tanpa kolom biaya; owner tetap dari tabel dasar.
		const { data: items } = isCrew
			? await supabase
					.from("inventory_items_safe")
					.select("id, sku, name, unit, unit_conversion")
					.in("id", allItemIds)
			: await supabase
					.from("inventory_items")
					.select("id, sku, name, unit, unit_conversion, purchase_price_avg")
					.in("id", allItemIds);
		// Batched stock levels — one grouped query for all mapped items instead
		// of an N+1 get_current_stock RPC per item. See get_stock_levels migration.
		const { data: levels } = await supabase.rpc("get_stock_levels", {
			p_item_ids: allItemIds,
		});
		const stockMap = new Map(
			((levels ?? []) as Array<{ item_id: string; stock: number }>).map(
				(r) => [r.item_id, Number(r.stock)] as const,
			),
		);
		for (const it of items ?? []) {
			itemsById.set(it.id as string, {
				id: it.id as string,
				sku: it.sku as string,
				name: it.name as string,
				unit: (it.unit as string | null) ?? "pcs",
				unit_conversion:
					(it as { unit_conversion?: unknown }).unit_conversion ?? null,
				// Jalur crew memakai view tanpa kolom biaya → selalu 0.
				purchase_price_avg: Number(
					(it as { purchase_price_avg?: number | null }).purchase_price_avg ??
						0,
				),
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
	const { data: poolRaw } = isCrew
		? await supabase
				.from("inventory_items_safe")
				.select("id, sku, name, unit")
				.eq("category", "inventory")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("sku", { ascending: true })
		: await supabase
				.from("inventory_items")
				.select("id, sku, name, unit, purchase_price_avg")
				.eq("category", "inventory")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("sku", { ascending: true });

	const poolRows = (poolRaw ?? []) as Array<{
		id: string;
		sku: string;
		name: string;
		unit: string | null;
		purchase_price_avg: number | null;
	}>;
	// Batched stock for the uncovered pool items in ONE query — replaces a
	// sequential get_current_stock RPC per item (the catalog can be 100s of
	// rows, so the old loop was 100s of serial round-trips). Only fetch ids not
	// already resolved via itemsById above. See get_stock_levels migration.
	const poolIdsNeedingStock = poolRows
		.filter((it) => !mappedSet.has(it.id) && !itemsById.has(it.id))
		.map((it) => it.id);
	const poolStockMap = new Map<string, number>();
	if (poolIdsNeedingStock.length > 0) {
		const { data: poolLevels } = await supabase.rpc("get_stock_levels", {
			p_item_ids: poolIdsNeedingStock,
		});
		for (const r of (poolLevels ?? []) as Array<{
			item_id: string;
			stock: number;
		}>) {
			poolStockMap.set(r.item_id, Number(r.stock));
		}
	}

	const custom_inventory: RekapContextItem[] = [];
	for (const it of poolRows) {
		if (mappedSet.has(it.id)) continue; // skip — covered by mapping
		const cached = itemsById.get(it.id);
		const stock = cached?.current_stock ?? poolStockMap.get(it.id) ?? 0;
		custom_inventory.push({
			id: it.id,
			sku: it.sku,
			name: it.name,
			unit: it.unit ?? "pcs",
			unit_conversion: null,
			purchase_price_avg: Number(it.purchase_price_avg ?? 0),
			current_stock: stock,
		});
	}

	// SECURITY: material cost (purchase_price_avg) is a business secret. The crew
	// rekap form is a client component, so anything in the context is shipped to
	// the browser even if not rendered. Zero out prices for crew so cost never
	// leaves the server for them. Owner-level keeps real prices (needs HPP).
	const stripPrice = <T extends { purchase_price_avg: number }>(it: T): T =>
		isCrew ? { ...it, purchase_price_avg: 0 } : it;
	const stripItem = (it: RekapContextItem | null) =>
		it ? stripPrice(it) : null;

	// Crew bertugas — untuk memilih penalang tiap biaya.
	//
	// WAJIB lewat RPC get_event_crew, BUKAN embed crew_assignments→users:
	// policy `users_read_own` hanya mengizinkan seseorang membaca barisnya
	// SENDIRI, jadi embed mengembalikan NULL untuk rekan setim begitu form
	// dibuka crew — daftar penalang jadi berisi "Crew" semua TANPA error apa
	// pun (lihat 20260615_get_event_crew.sql). RPC-nya SECURITY DEFINER,
	// memaparkan kolom aman saja, dan hanya bisa dipanggil crew yang bertugas
	// di event itu atau owner.
	const { data: crewRows, error: crewErr } = await supabase.rpc(
		"get_event_crew",
		{ p_event_id: eventId },
	);
	if (crewErr) {
		console.error("[getRekapContext] get_event_crew:", crewErr.message);
	}
	const crew = (
		(crewRows ?? []) as Array<{
			user_id: string;
			full_name: string | null;
			role_in_event: string | null;
		}>
	)
		.filter((r) => Boolean(r.user_id))
		.map((r) => ({
			user_id: r.user_id,
			name: r.full_name?.trim() || "Crew",
			role: r.role_in_event ?? "",
		}));

	return {
		pkg: {
			name: pkg?.name ?? null,
			frame_size: (event.frame_size as string | null) ?? null,
			duration_hours: pkg?.duration_hours ?? null,
			include_flashdisk_pouch:
				(event.include_flashdisk_pouch as boolean | null) ?? null,
		},
		bundle:
			isCrew && bundle
				? { ...bundle, components: bundle.components.map(stripPrice) }
				: bundle,
		paid_addons: paid_addons.map((a) => ({
			...a,
			inventory_item: stripItem(a.inventory_item),
		})),
		bonuses: bonuses.map((b) => ({
			...b,
			inventory_item: stripItem(b.inventory_item),
		})),
		mappings: mappings.map((m) => ({ ...m, item: stripItem(m.item) })),
		custom_inventory: custom_inventory.map(stripPrice),
		crew,
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
		"expense_paid_by",
		"expense_nota_urls",
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
		expense_paid_by: formData.get("expense_paid_by"),
		expense_nota_urls: formData.get("expense_nota_urls"),
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

	// Upsert by event_id (UNIQUE). Pull the prior quantities too so an owner
	// override can be recorded as a concrete diff in the audit note.
	const { data: existing } = await supabase
		.from("crew_rekap")
		.select(
			"id, is_approved, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used",
		)
		.eq("event_id", eventId)
		.maybeSingle();

	// Crew tidak boleh edit rekap yang sudah di-approve owner. Owner/super-admin
	// boleh re-submit kapan saja (di bawah: reverse commit lama → re-commit).
	if (existing && existing.is_approved === true && me.profile.role === "crew") {
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
		// Advance the state machine past 'draft'. Without this the row keeps the
		// column DEFAULT 'draft', which misrepresents a submitted rekap. Owner
		// auto-approve below overrides this to 'reviewed'. A crew re-submit of a
		// previously rejected rekap also correctly moves it back to 'submitted'.
		status: "submitted" as const,
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
		expense_paid_by: parsed.data.expense_paid_by,
		expense_nota_urls: parsed.data.expense_nota_urls,
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

	// Audit note: when an owner edits an EXISTING rekap, record exactly which
	// quantities changed (vs the value already stored — typically the crew's
	// submission) so the change isn't silent. Falls back to the generic note.
	let ownerReviewNotes = "Auto-approve (owner submit)";
	if (me.profile.role !== "crew" && existing) {
		const numericChanges: Array<[string, number, number]> = [
			["cetak", existing.cetak_total, payload.cetak_total],
			["mediaset", existing.media_set_used, payload.media_set_used],
			["sleeve", existing.sleeve_used, payload.sleeve_used],
			["flashdisk", existing.flashdisk_used, payload.flashdisk_used],
			["pouch", existing.pouch_used, payload.pouch_used],
			["photomagnet", existing.photomagnet_used, payload.photomagnet_used],
			["keychain", existing.keychain_used, payload.keychain_used],
		];
		const diff = numericChanges
			.filter(([, before, after]) => Number(before ?? 0) !== Number(after ?? 0))
			.map(([label, before, after]) => `${label} ${before ?? 0}→${after ?? 0}`);
		if (diff.length > 0) {
			ownerReviewNotes = `Owner override: ${diff.join(", ")}`.slice(0, 480);
		}
	}

	// Owner/super-admin: submit = approve + commit sekaligus. Mereka adalah
	// otoritas review — tidak masuk akal approve diri sendiri. Crew: tetap
	// "submitted", owner yang review & approve nanti (commit stok di situ).
	if (me.profile.role !== "crew") {
		const { data: row } = await supabase
			.from("crew_rekap")
			.select(
				"id, event_id, is_approved, frame_size_snapshot, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
			)
			.eq("event_id", eventId)
			.maybeSingle();
		if (row) {
			// Re-submit owner: reverse commit lama dulu biar stok tidak dobel.
			if (row.stock_committed_at) {
				const rev = await reverseRekapStock(supabase, eventId, me.profile.id, {
					rekapId: row.id,
				});
				if (!rev.ok) {
					return {
						errors: { _form: [rev.error] },
						values: snapshotValues(formData),
					};
				}
			}
			const commit = await commitRekapStock(
				supabase,
				row as RekapStockSnapshot,
				me.profile.id,
				{
					isApproved: true,
					status: "reviewed",
					reviewNotes: ownerReviewNotes,
				},
			);
			if (!commit.ok) {
				return {
					errors: { _form: [commit.error] },
					values: snapshotValues(formData),
				};
			}
		}
	}

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath("/warehouse");
	// Crew-facing surfaces that show "Perlu submit rekap" / rekap status. Without
	// these the crew home + schedule keep serving stale router-cache entries and
	// a just-submitted event lingers under "Belum".
	revalidatePath("/crew");
	revalidatePath("/crew/jadwal");
	revalidatePath(`/crew/jadwal/${projectId}`);

	// Crew submit → ping owners to review. Owner self-submits don't notify (they
	// ARE the reviewer). Best-effort: never blocks the submit.
	if (me.profile.role === "crew") {
		await notifyRekapSubmitted(eventId, projectId, me.profile.full_name);
	}
	return { success: true };
}

type RekapStockSnapshot = {
	id: string;
	event_id: string;
	is_approved: boolean | null;
	frame_size_snapshot: string | null;
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

// DeductionLine now lives in @/lib/rekap/project-demand (shared with the
// pre-event forecast projector).

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
	const [{ data: event, error: eventErr }, { data: items, error: itemsErr }] =
		await Promise.all([
			// Only frame_size is needed here; the package bundle BOM + bonuses are
			// handled by projectEventLinesFromSpec (shared with the forecast).
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

	// Baca gagal HARUS menghentikan perencanaan, bukan menghasilkan rencana
	// kosong. Kalau `items` null, itemsBySku kosong → SEMUA baris jatuh ke
	// missingMappings → commitRekapStock mengirim p_movements: [] dan
	// hpp_total: 0. Rekap tetap jadi "reviewed", stock_committed_at terisi,
	// stok tidak berkurang sepeser pun, lalu event di-settle dengan HPP Rp0 →
	// margin kotor 100% palsu dan tidak ada error di mana pun.
	if (eventErr) {
		throw new Error(`Gagal membaca data event: ${eventErr.message}`);
	}
	if (itemsErr) {
		throw new Error(`Gagal membaca master inventory: ${itemsErr.message}`);
	}

	// Use the FROZEN snapshot taken at submit time, not live event.frame_size.
	// If the owner corrects event.frame_size after submit, the stock deduction +
	// HPP must still reflect what the crew actually shot. Matches the COALESCE
	// pattern used by calculate_recap_hpp / settle_event / stock validators.
	const frameSize = (
		(rekap.frame_size_snapshot as string | null) ??
		(event?.frame_size as string | null) ??
		""
	).trim();
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
			mediaQtyPerPrint: rollPerPrint("MEDIA-PERF", "lembar_polaroid", 1 / 1400),
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
				bucket: "mediaset",
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
				bucket: "sleeve",
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
	const HARDCODED_ASSEMBLY: Array<{
		field: Exclude<
			RekapField,
			"cetak_total" | "media_set_used" | "sleeve_used"
		>;
		components: Array<{ sku: string; qtyPerUnit: number }>;
	}> = [
		{
			// 1 flashdisk diberikan ke klien = unit Flashdisk + Box + Pouch (1:1:1).
			// Box berisi flashdisk, lalu dimasukkan ke pouch — tiga-tiganya pasti
			// terpakai. Pouch standalone (untuk cetak foto tanpa flashdisk) tetap
			// dihitung lewat field pouch_used terpisah.
			field: "flashdisk_used",
			components: [
				{ sku: "FLASHDISK", qtyPerUnit: 1 },
				{ sku: "FD-BOX", qtyPerUnit: 1 },
				{ sku: "POUCH", qtyPerUnit: 1 },
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

	// B: resep assembly data-driven — baca dari tabel rekap_assembly_rules.
	// Fallback ke HARDCODED_ASSEMBLY kalau tabel kosong/error → tanpa regresi.
	type AssemblyRule = (typeof HARDCODED_ASSEMBLY)[number];
	const { data: ruleRows } = await supabase
		.from("rekap_assembly_rules")
		.select("rekap_field, component_sku, qty_per_unit, sort_order")
		.eq("is_active", true)
		.order("rekap_field", { ascending: true })
		.order("sort_order", { ascending: true });

	// Muat komponen SKU yang belum ada di itemsBySku (kalau owner pakai SKU baru).
	const ruleSkus = Array.from(
		new Set(
			((ruleRows ?? []) as Array<{ component_sku: string }>).map(
				(r) => r.component_sku,
			),
		),
	);
	const missingRuleSkus = ruleSkus.filter((s) => !itemsBySku.has(s));
	if (missingRuleSkus.length > 0) {
		const { data: more } = await supabase
			.from("inventory_items")
			.select("id, sku, name, unit, unit_conversion, purchase_price_avg")
			.in("sku", missingRuleSkus)
			.is("deleted_at", null);
		for (const it of more ?? []) {
			if (!itemsBySku.has(it.sku)) itemsBySku.set(it.sku, it as never);
		}
	}

	let ASSEMBLY_RULES: AssemblyRule[];
	if (ruleRows && ruleRows.length > 0) {
		const byField = new Map<string, AssemblyRule["components"]>();
		for (const r of ruleRows as Array<{
			rekap_field: string;
			component_sku: string;
			qty_per_unit: number;
		}>) {
			const arr = byField.get(r.rekap_field) ?? [];
			arr.push({ sku: r.component_sku, qtyPerUnit: Number(r.qty_per_unit) });
			byField.set(r.rekap_field, arr);
		}
		ASSEMBLY_RULES = Array.from(byField.entries()).map(
			([field, components]) => ({
				field: field as AssemblyRule["field"],
				components,
			}),
		);
	} else {
		ASSEMBLY_RULES = HARDCODED_ASSEMBLY;
	}

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
				source_label: components.length > 1 ? `${field} → ${sku}` : field,
				// Bucket per-KOMPONEN (bukan per-field): pouch yang ikut flashdisk
				// harus masuk bucket "pouch" supaya kredit persediaan settlement
				// (1-203) cocok dgn stok pouch fisik — bukan ke 1-202 (flashdisk).
				bucket: bucketForSku(item.sku),
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
				bucket: "other",
			});
		}
	}

	// Bonuses (event_bonuses) + package bundle BOM — the deterministic,
	// event-spec-derivable lines. Extracted into projectEventLinesFromSpec so
	// the same logic feeds the pre-event warehouse forecast (Phase 3). The
	// bundle dedup must see the lines built above (media/sleeve/assembly/custom),
	// so we pass their item_ids — preserving the original behaviour exactly.
	const specLines = await projectEventLinesFromSpec(
		supabase,
		rekap.event_id,
		new Set(lines.map((l) => l.item_id)),
	);
	lines.push(...specLines);

	// Round semua qty ke presisi ledger (NUMERIC(12,4)) supaya snapshot HPP
	// (bucketHpp) == nilai stok yang ter-simpan di stock_movements, exact.
	for (const l of lines) l.qty = roundQty(l.qty);

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
 * Commit stok + HPP snapshot + status approval secara ATOMIC via the
 * commit_rekap_stock RPC (one DB transaction). Sebelumnya insert movements +
 * update crew_rekap dilakukan terpisah → kalau yang kedua gagal, movements
 * yatim & stock_committed_at NULL → retry double-deduct. RPC menutup celah itu.
 */
async function commitRekapStock(
	supabase: Awaited<ReturnType<typeof createClient>>,
	rekap: RekapStockSnapshot,
	actorId: string,
	review: {
		isApproved?: boolean;
		status?: string;
		reviewNotes?: string | null;
	},
): Promise<{ ok: true } | { ok: false; error: string }> {
	const plan = await planRekapDeduction(supabase, rekap);

	// SKU yang tak ter-resolve = potongan stok & HPP yang hilang diam-diam.
	// Tolak commit daripada membekukan stock_committed_at dengan rencana
	// bolong: sekali ter-commit, jalur ini tidak akan mengulang dan event
	// ter-settle memakai HPP yang kurang.
	if (plan.missingMappings.length > 0) {
		return {
			ok: false,
			error:
				`Commit dibatalkan — SKU inventory untuk field berikut tidak ditemukan: ${plan.missingMappings.join(", ")}. ` +
				"Lengkapi master inventory dulu supaya stok & HPP tidak tercatat kurang.",
		};
	}

	const snapshot = bucketHpp(plan.lines);
	const batchId = plan.lines.length > 0 ? randomUUID() : null;
	const movements = plan.lines.map((l) => ({
		ref_id: buildRefId("out"),
		item_id: l.item_id,
		quantity: l.qty,
		unit_cost: l.unit_cost,
		source_description: `Rekap approved (${l.source_label})`,
		notes: `Auto-deduct — batch ${(batchId ?? "").slice(0, 8)}`,
	}));
	const { error } = await supabase.rpc("commit_rekap_stock", {
		p_rekap_id: rekap.id,
		p_event_id: rekap.event_id,
		p_actor: actorId,
		p_movements: movements,
		p_hpp_snapshot: snapshot,
		p_hpp_total: snapshot.total,
		p_batch_id: batchId,
		p_is_approved: review.isApproved ?? true,
		p_status: review.status ?? "reviewed",
		p_review_notes: review.reviewNotes ?? null,
	});
	if (error)
		return { ok: false, error: `Gagal commit rekap: ${error.message}` };

	// Best-effort: stok baru saja turun — cek apakah item yang terpakai kini
	// kurang untuk event mendatang, lalu kabari owner (in-app + Telegram).
	// Momen inilah satu-satunya saat stok turun banyak sekaligus; tanpa ini
	// owner harus ingat membuka Forecast sendiri.
	try {
		const { data: ev } = await supabase
			.from("events")
			.select("project_id, client_name")
			.eq("id", rekap.event_id)
			.maybeSingle();
		await alertRestockAfterCommit(
			[...new Set(plan.lines.map((l) => l.item_id))],
			{
				eventId: rekap.event_id,
				projectId: (ev?.project_id as string) ?? "",
				clientName: (ev?.client_name as string) ?? null,
			},
		);
	} catch (e) {
		console.error("[rekap] restock alert:", e);
	}

	return { ok: true };
}

/**
 * Reverse NET konsumsi stok rekap untuk satu event (insert 'in' offset sebesar
 * Σout − Σin per item). Idempotent-ish — dipakai sebelum owner re-commit supaya
 * stok tidak dobel-potong saat re-submit.
 */
async function reverseRekapStock(
	supabase: Awaited<ReturnType<typeof createClient>>,
	eventId: string,
	actorId: string,
	opts: { rekapId: string; reject?: boolean; reviewNotes?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
	const { data: moves, error: movesErr } = await supabase
		.from("stock_movements")
		.select("item_id, quantity, direction, unit_cost")
		.eq("source", "rekap_consumption")
		.eq("source_id", eventId);

	// Error di sini TIDAK boleh diabaikan: `moves` jadi null → `reversals`
	// kosong → RPC tetap jalan dan membersihkan stock_committed_at, padahal
	// tidak ada satu pun stok yang dikembalikan. Owner submit ulang rekap →
	// commitRekapStock memotong konsumsi penuh untuk KEDUA kalinya.
	if (movesErr) {
		return {
			ok: false,
			error: `Gagal membaca stok terpakai: ${movesErr.message}. Reversal dibatalkan supaya stok tidak terpotong dua kali.`,
		};
	}

	const net = new Map<string, { qty: number; cost: number }>();
	for (const m of (moves ?? []) as Array<{
		item_id: string;
		quantity: number;
		direction: string;
		unit_cost: number;
	}>) {
		const sign = m.direction === "out" ? 1 : -1;
		const cur = net.get(m.item_id) ?? {
			qty: 0,
			cost: Number(m.unit_cost) || 0,
		};
		cur.qty += sign * (Number(m.quantity) || 0);
		net.set(m.item_id, cur);
	}
	const label = opts.reject
		? "Reversal: rekap rejected"
		: "Reversal: owner re-submit rekap";
	const reversals = [];
	for (const [item_id, v] of net) {
		if (v.qty > 0) {
			reversals.push({
				ref_id: buildRefId("in"),
				item_id,
				quantity: v.qty,
				unit_cost: v.cost,
				source_description: label,
				notes: label,
			});
		}
	}
	// Atomic: insert reversals + clear the commit (+ mark rejected) in one tx.
	// Net-based above → re-running after success inserts nothing (idempotent).
	const { error } = await supabase.rpc("reverse_rekap_stock", {
		p_rekap_id: opts.rekapId,
		p_event_id: eventId,
		p_actor: actorId,
		p_reversals: reversals,
		p_reject: opts.reject ?? false,
		p_review_notes: opts.reviewNotes ?? null,
	});
	if (error)
		return { ok: false, error: `Gagal reverse stok: ${error.message}` };
	return { ok: true };
}

/**
 * Safety-net sebelum settle: pastikan rekap sudah commit stok + snapshot.
 * Owner-level. Kalau owner isi rekap sendiri & belum ke-commit, ini auto-commit
 * (approve diri = otomatis) → owner tinggal klik Settle, tidak perlu approve
 * terpisah. No-op kalau sudah committed (idempotent).
 */
export async function ensureRekapCommitted(
	eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const { data: row } = await supabase
		.from("crew_rekap")
		.select(
			"id, event_id, is_approved, frame_size_snapshot, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("event_id", eventId)
		.maybeSingle();
	if (!row)
		return { ok: false, error: "Rekap belum di-submit untuk event ini." };
	if (row.stock_committed_at) return { ok: true }; // sudah committed — no-op
	const commit = await commitRekapStock(
		supabase,
		row as RekapStockSnapshot,
		me.profile.id,
		{
			isApproved: true,
			status: "reviewed",
			reviewNotes: "Auto-approve (owner settle)",
		},
	);
	if (!commit.ok) return { ok: false, error: commit.error };
	return { ok: true };
}

/**
 * Dry-run HPP (read-only) dari plan konsumsi kanonik — dipakai profit preview
 * saat rekap belum punya hpp_snapshot, supaya preview == hasil settle (bukan
 * pakai calculate_recap_hpp lama yang bisa drifted). Owner-level.
 */
export async function previewRekapHpp(
	eventId: string,
): Promise<HppBreakdown | null> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { data: row } = await supabase
		.from("crew_rekap")
		.select(
			"id, event_id, is_approved, frame_size_snapshot, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("event_id", eventId)
		.maybeSingle();
	if (!row) return null;
	const plan = await planRekapDeduction(supabase, row as RekapStockSnapshot);
	return bucketHpp(plan.lines);
}

/**
 * Public action: returns deduction lines for an unapproved rekap so the
 * UI can show a preview before owner clicks "Approve". Owner-level only.
 */
export async function getRekapApprovalPreview(rekapId: string): Promise<
	| {
			ok: true;
			lines: DeductionLine[];
			missingMappings: RekapField[];
			autoDeductEnabled: boolean;
			alreadyCommitted: boolean;
			/** Live warehouse stock per item_id — for before→after display. */
			stockByItem: Record<string, number>;
	  }
	| { ok: false; error: string }
> {
	await requireOwnerLevel();
	const supabase = await createClient();

	const { data: rekap, error } = await supabase
		.from("crew_rekap")
		.select(
			"id, event_id, is_approved, frame_size_snapshot, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("id", rekapId)
		.maybeSingle();
	if (error || !rekap) {
		return { ok: false, error: error?.message ?? "Rekap tidak ditemukan" };
	}

	const plan = await planRekapDeduction(supabase, rekap as RekapStockSnapshot);

	// Live stock per consumed item (one batched RPC) → lets the UI show
	// stok awal → penggunaan → stok akhir. For a not-yet-committed rekap this is
	// the stock BEFORE this event; for a committed one it's already AFTER.
	const itemIds = [...new Set(plan.lines.map((l) => l.item_id))];
	const stockByItem: Record<string, number> = {};
	if (itemIds.length > 0) {
		const { data: levels } = await supabase.rpc("get_stock_levels", {
			p_item_ids: itemIds,
		});
		for (const r of (levels ?? []) as Array<{
			item_id: string;
			stock: number;
		}>) {
			stockByItem[r.item_id] = Number(r.stock);
		}
	}

	return {
		ok: true,
		lines: plan.lines,
		missingMappings: plan.missingMappings,
		// Deduksi stok + snapshot HPP selalu jalan saat approval (single engine).
		autoDeductEnabled: true,
		alreadyCommitted: rekap.stock_committed_at !== null,
		stockByItem,
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
			"id, event_id, is_approved, frame_size_snapshot, stock_committed_at, stock_movement_batch_id, cetak_total, media_set_used, sleeve_used, flashdisk_used, pouch_used, photomagnet_used, keychain_used, custom_materials",
		)
		.eq("id", rekapId)
		.maybeSingle();
	if (!existing) return { error: "Rekap tidak ditemukan" };

	const wasApproved = existing.is_approved === true;
	const willApprove = approved === true;
	const hadStockCommitted = existing.stock_committed_at !== null;

	const reviewNotes = notes.trim() || null;

	if (willApprove && !wasApproved && !hadStockCommitted) {
		// Approval transition → deduct stock + write snapshot + set status, ALL
		// in one transaction (RPC). No partial state / no double-deduct on retry.
		const commit = await commitRekapStock(
			supabase,
			existing as RekapStockSnapshot,
			me.profile.id,
			{ isApproved: true, status: "reviewed", reviewNotes },
		);
		if (!commit.ok) return { error: commit.error };
	} else if (!willApprove && wasApproved && hadStockCommitted) {
		// Reject after prior approval → reverse stock + clear commit + mark
		// rejected, ALL in one transaction (RPC). Net-based + idempotent.
		const rev = await reverseRekapStock(
			supabase,
			existing.event_id,
			me.profile.id,
			{ rekapId, reject: true, reviewNotes },
		);
		if (!rev.ok) return { error: rev.error };
	} else {
		// No stock change (re-affirm an already-committed approval, or reject a
		// never-approved rekap). Sync review fields + status only.
		const { error } = await supabase
			.from("crew_rekap")
			.update({
				is_approved: approved,
				reviewed_by: me.profile.id,
				reviewed_at: new Date().toISOString(),
				review_notes: reviewNotes,
				status: approved ? "reviewed" : "rejected",
			})
			.eq("id", rekapId);
		if (error) return { error: error.message };
	}

	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/rekap`);
	revalidatePath("/warehouse");

	// Tell the assigned crew their rekap was approved / needs revision.
	await notifyRekapReviewed(
		existing.event_id,
		projectId,
		approved,
		reviewNotes,
	);
	return {};
}

// Re-export REKAP_FIELDS so consumers don't need a second import.
export async function listRekapFields(): Promise<readonly RekapField[]> {
	return REKAP_FIELDS;
}
