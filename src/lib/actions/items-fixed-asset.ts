"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { baseSkuOf } from "@/lib/inventory/asset-models";
import { qualifiesAsFixedAsset } from "@/lib/inventory/capitalization-policy";
import { defaultsForFixedAsset } from "@/lib/inventory/coa-defaults";
import { withItemCreated } from "@/lib/inventory/item-created-toast";
import { recordItemPurchaseLines } from "@/lib/inventory/item-origin";
import {
	ensureUniqueSku,
	generateFixedAssetSku,
} from "@/lib/inventory/sku-generator";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions untuk Fixed Asset (Aset Tetap).
 *
 * Flow baru (2026-05-26):
 *   - Name first; SKU + asset_number auto-generated dari nama.
 *   - Unit dropdown default "unit".
 *   - depreciation_method auto = "straight_line" (hidden dari form).
 *   - COA otomatis dari default fixed asset (1-400/1-401/5-500); tidak
 *     di-expose ke form Adit. Rama bisa override dari Finance nanti.
 *   - Salvage value label "Perkiraan Harga Jual Bekas", default 0.
 *   - useful_life_months → "Target Masa Pakai Alat".
 */

const SKU_REGEX = /^[A-Z0-9_-]+$/;
const CONDITIONS = ["normal", "service", "damaged", "lost"] as const;
const LOCATIONS = [
	"gudang_pusat",
	"event",
	"service_center",
	"crew_carry",
	"lost",
] as const;
const ASSET_UNIT_OPTIONS = ["unit", "pcs", "set"] as const;
const ACQUISITION_TYPES = [
	"new_commercial",
	"used_commercial",
	"owner_contribution",
] as const;
/** Sekali input maksimal sekian unit — pagar terhadap salah ketik jumlah. */
const MAX_UNITS_PER_SUBMIT = 20;

const FixedAssetItemInputSchema = z.object({
	name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	sku_override: z
		.string()
		.trim()
		.max(40, "Maksimal 40 karakter")
		.optional()
		.transform((v) => (v ? v.toUpperCase() : ""))
		.refine((v) => v === "" || SKU_REGEX.test(v), {
			message: "SKU: huruf kapital, angka, hyphen, underscore",
		}),
	asset_number: z
		.string()
		.trim()
		.max(60)
		.optional()
		.transform((v) => (v ? v : null)),
	serial_number: z
		.string()
		.trim()
		.max(120)
		.optional()
		.transform((v) => (v ? v : null)),
	/** Diisi kalau owner menambah unit untuk alat yang sudah terdaftar. */
	base_item_id: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.string().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	/** Beli beberapa unit sekaligus → sebanyak itu baris aset dibuat. */
	quantity: z.preprocess(
		(v) => (v === "" || v === null || v === undefined ? 1 : v),
		z.coerce
			.number()
			.int()
			.min(1, "Minimal 1 unit")
			.max(
				MAX_UNITS_PER_SUBMIT,
				`Maksimal ${MAX_UNITS_PER_SUBMIT} unit sekali input`,
			),
	),
	unit: z.enum(ASSET_UNIT_OPTIONS, "Pilih unit").default("unit"),
	acquisition_type: z
		.enum(ACQUISITION_TYPES, "Pilih asal-usul aset")
		.default("new_commercial"),
	purchase_price: z.coerce.number().int().nonnegative().default(0),
	purchase_date: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.iso.date().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	salvage_value: z.coerce.number().int().nonnegative().default(0),
	useful_life_months: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.coerce.number().int().positive().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	depreciation_start_date: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.iso.date().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	condition: z
		.union([z.enum(CONDITIONS), z.literal("")])
		.optional()
		.transform((v) => (v ? (v as (typeof CONDITIONS)[number]) : "normal")),
	current_location: z
		.union([z.enum(LOCATIONS), z.literal("")])
		.optional()
		.transform((v) => (v ? (v as (typeof LOCATIONS)[number]) : "gudang_pusat")),
	image_url: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	is_active: z.coerce.boolean(),
});

export type FixedAssetItemInput = z.infer<typeof FixedAssetItemInputSchema>;
type Errors = Partial<Record<keyof FixedAssetItemInput | "_form", string[]>>;
export type FixedAssetItemFormState =
	| { errors?: Errors; values?: Record<string, string> }
	| undefined;

function parse(formData: FormData) {
	return FixedAssetItemInputSchema.safeParse({
		name: formData.get("name"),
		// ?? undefined pada field string/enum-optional: formData.get() = null saat
		// field absen (mis. asset_number cuma dirender di mode edit) → optional()
		// tolak null. Date/number pakai preprocess yg sudah null-safe.
		sku_override: formData.get("sku_override") ?? undefined,
		asset_number: formData.get("asset_number") ?? undefined,
		serial_number: formData.get("serial_number") ?? undefined,
		base_item_id: formData.get("base_item_id"),
		quantity: formData.get("quantity") ?? 1,
		unit: formData.get("unit") || "unit",
		acquisition_type: formData.get("acquisition_type") || "new_commercial",
		purchase_price: formData.get("purchase_price"),
		purchase_date: formData.get("purchase_date"),
		salvage_value: formData.get("salvage_value"),
		useful_life_months: formData.get("useful_life_months"),
		depreciation_start_date: formData.get("depreciation_start_date"),
		condition: formData.get("condition") ?? undefined,
		current_location: formData.get("current_location") ?? undefined,
		image_url: formData.get("image_url") ?? undefined,
		notes: formData.get("notes") ?? undefined,
		is_active: formData.get("is_active") === "on",
	});
}

function snapshot(formData: FormData): Record<string, string> {
	const keys = [
		"name",
		"sku_override",
		"asset_number",
		"serial_number",
		"base_item_id",
		"quantity",
		"unit",
		"acquisition_type",
		"purchase_price",
		"purchase_date",
		"salvage_value",
		"useful_life_months",
		"depreciation_start_date",
		"condition",
		"current_location",
		"image_url",
		"notes",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	out.is_active = formData.get("is_active") === "on" ? "on" : "";
	return out;
}

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

function safeReturnTo(raw: FormDataEntryValue | null): string {
	const s = typeof raw === "string" ? raw : "";
	const allowed = new Set(["/warehouse"]);
	return allowed.has(s) ? s : "/warehouse";
}

export async function createFixedAssetItem(
	_prev: FixedAssetItemFormState,
	formData: FormData,
): Promise<FixedAssetItemFormState> {
	const me = await requireOwnerLevel();
	const parsed = parse(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as Errors,
			values: snapshot(formData),
		};
	}
	const data = parsed.data;
	const supabase = await createClient();

	// Langkah pertama form: alat baru, atau unit tambahan untuk alat yang sudah
	// ada? Kalau menambah unit, nama & unit ikut model yang sudah terdaftar
	// (tidak percaya teks bebas) supaya grup unit tidak pecah karena beda ketik.
	let name = data.name;
	let unit: string = data.unit;
	let skuSeed = data.sku_override || generateFixedAssetSku(data.name);
	if (data.base_item_id) {
		const { data: base } = await supabase
			.from("inventory_items")
			.select("id, name, unit, sku")
			.eq("id", data.base_item_id)
			.eq("category", "fixed_asset")
			.is("deleted_at", null)
			.maybeSingle();
		if (!base) {
			return {
				errors: {
					_form: [
						"Alat yang mau ditambah unitnya tidak ditemukan. Muat ulang halaman lalu pilih lagi.",
					],
				},
				values: snapshot(formData),
			};
		}
		name = base.name as string;
		unit = (base.unit as string) ?? data.unit;
		// Tombol "+ unit" bisa ditekan dari unit mana pun, jadi basis SKU diambil
		// dari seluruh unit model — bukan dari baris yang kebetulan diklik.
		const { data: siblings } = await supabase
			.from("inventory_items")
			.select("sku")
			.eq("category", "fixed_asset")
			.eq("name", name)
			.is("deleted_at", null);
		skuSeed =
			baseSkuOf(
				((siblings ?? []) as Array<{ sku: string }>).map((s) => s.sku),
			) || (base.sku as string);
	}

	const quantity = data.quantity;
	// Serial per unit saat beli >1 sekaligus; kalau 1 unit pakai field tunggal.
	const serials =
		quantity > 1
			? formData
					.getAll("serial_numbers")
					.map((v) => String(v).trim())
					.slice(0, quantity)
			: [data.serial_number ?? ""];

	// Capitalization policy: only capitalize + depreciate when price > Rp1,5jt
	// AND useful life >= 24 months. Below that → expensed (no depreciation),
	// even if a useful life was entered. Ambangnya PER UNIT.
	const capitalized = qualifiesAsFixedAsset(
		data.purchase_price,
		data.useful_life_months,
	);
	const deprMethod = capitalized ? "straight_line" : "none";
	const coa = defaultsForFixedAsset();

	const createdItemIds: string[] = [];
	const createdJournalIds: string[] = [];
	/** Satu unit gagal = tidak ada yang tertinggal setengah jadi. */
	const rollback = async () => {
		if (createdJournalIds.length > 0) {
			await supabase
				.from("journal_entries")
				.delete()
				.in("id", createdJournalIds);
		}
		if (createdItemIds.length > 0) {
			await supabase.from("inventory_items").delete().in("id", createdItemIds);
		}
	};
	const fail = async (message: string): Promise<FixedAssetItemFormState> => {
		await rollback();
		return { errors: { _form: [message] }, values: snapshot(formData) };
	};

	for (let i = 0; i < quantity; i++) {
		// Dipanggil per unit supaya unit sebelumnya sudah terhitung: SKU jadi
		// AST-…, AST-…-2, AST-…-3 dst.
		const sku = await ensureUniqueSku(
			supabase as unknown as Parameters<typeof ensureUniqueSku>[0],
			skuSeed,
		);
		// Asset number defaults to SKU (1 unit = 1 SKU = 1 asset_number). Override
		// manual cuma masuk akal untuk satu unit.
		const assetNumber = (quantity === 1 ? data.asset_number : null) || sku;
		const serialNumber = serials[i]?.trim() || null;

		const { data: inserted, error: insErr } = await supabase
			.from("inventory_items")
			.insert({
				sku,
				name,
				category: "fixed_asset",
				unit,
				image_url: data.image_url,
				notes: data.notes,
				is_active: data.is_active,
			})
			.select("id")
			.single();
		if (insErr || !inserted) {
			return fail(insErr?.message ?? "Gagal create asset");
		}
		createdItemIds.push(inserted.id as string);

		// Auto-create journal entry untuk Setoran Modal Owner
		// (Dr 1-400 Peralatan / Cr 3-100 Modal Owner) — per unit, karena tiap unit
		// punya config & nilai bukunya sendiri.
		// new_commercial dan used_commercial TIDAK auto-jurnal di sini —
		// pembeliannya dicatat lewat modul Pembelian (satu nota, sekian baris).
		let acquisitionJournalId: string | null = null;
		if (
			data.acquisition_type === "owner_contribution" &&
			data.purchase_price > 0
		) {
			const journalRef = `JE-CONTRIB-${Date.now().toString(36).toUpperCase()}-${Math.floor(
				Math.random() * 99999,
			)
				.toString()
				.padStart(5, "0")}`;
			const { data: entry, error: entryErr } = await supabase
				.from("journal_entries")
				.insert({
					ref_id: journalRef,
					entry_date:
						data.purchase_date ?? new Date().toISOString().slice(0, 10),
					entry_type: "adjustment",
					description: `Setoran Modal Owner — ${name} (${sku})`,
					source_type: "owner_contribution",
					source_id: inserted.id,
					total_amount: data.purchase_price,
					created_by: me.profile.id,
				})
				.select("id")
				.single();
			if (entry && !entryErr) {
				acquisitionJournalId = entry.id as string;
				createdJournalIds.push(acquisitionJournalId);
				await supabase.from("journal_lines").insert([
					{
						entry_id: entry.id,
						// Capitalized → asset account; below policy → expense it now.
						account_code: capitalized ? coa.asset : "5-250",
						debit_amount: data.purchase_price,
						credit_amount: 0,
						description: capitalized
							? `Aset masuk (setoran owner): ${name}`
							: `Beban perlengkapan (setoran owner): ${name}`,
						line_order: 1,
					},
					{
						entry_id: entry.id,
						account_code: "3-100",
						debit_amount: 0,
						credit_amount: data.purchase_price,
						description: `Setoran modal — ${name}`,
						line_order: 2,
					},
				]);
			}
		}

		const { error: cfgErr } = await supabase
			.from("items_fixed_asset_config")
			.insert({
				item_id: inserted.id,
				asset_number: assetNumber,
				serial_number: serialNumber,
				acquisition_type: data.acquisition_type,
				acquisition_journal_entry_id: acquisitionJournalId,
				purchase_price: data.purchase_price,
				purchase_date: data.purchase_date,
				salvage_value: data.salvage_value,
				useful_life_months: data.useful_life_months,
				depreciation_method: deprMethod,
				is_capitalized: capitalized,
				depreciation_start_date:
					data.depreciation_start_date ?? data.purchase_date,
				condition: data.condition,
				current_location: data.current_location,
				coa_account_asset: coa.asset,
				coa_account_accum_depr: coa.accum_depr,
				coa_account_depr_expense: coa.depr_expense,
			});
		if (cfgErr) return fail(`Gagal create config: ${cfgErr.message}`);
	}

	// Alat yang DIBELI: catat pembeliannya lewat modul Pembelian (stok masuk +
	// jurnal Dr aset/beban perlengkapan / Cr kas atau Hutang Vendor + kebijakan
	// kapitalisasi). Beli beberapa unit sekaligus = SATU nota berisi beberapa
	// baris, bukan beberapa jurnal terpisah.
	let purchaseRef: string | null = null;
	let bookedAmount = 0;
	let origin: "purchase" | "owner_contribution" | "none" = "none";
	if (data.acquisition_type === "owner_contribution") {
		origin = "owner_contribution";
		bookedAmount = data.purchase_price * createdItemIds.length;
	}
	if (
		data.acquisition_type !== "owner_contribution" &&
		Number(formData.get("buy_quantity") ?? 0) > 0
	) {
		const res = await recordItemPurchaseLines(
			formData,
			createdItemIds.map((itemId) => ({ itemId, quantity: 1 })),
			"unit",
		);
		if (res.ok) {
			origin = "purchase";
			purchaseRef = res.journalRef ?? null;
			bookedAmount = data.purchase_price * createdItemIds.length;
		}
		if (!res.ok) {
			return {
				errors: {
					_form: [
						`Alat "${name}" sudah dibuat (${createdItemIds.length} unit), tapi pembeliannya gagal dicatat: ${res.error}. Catat lewat Warehouse › Pembelian.`,
					],
				},
				values: snapshot(formData),
			};
		}
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/assets");
	revalidatePath("/finance/accounting");
	// Bawa ringkasannya lewat URL — redirect membuang state, jadi tanpa ini
	// owner tidak punya tanda apa pun bahwa item & jurnalnya jadi.
	redirect(
		withItemCreated(safeReturnTo(formData.get("return_to")), {
			name,
			units: createdItemIds.length,
			origin,
			journalRef: purchaseRef,
			amount: bookedAmount,
		}),
	);
}

export async function updateFixedAssetItem(
	id: string,
	_prev: FixedAssetItemFormState,
	formData: FormData,
): Promise<FixedAssetItemFormState> {
	await requireOwnerLevel();
	const parsed = parse(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as Errors,
			values: snapshot(formData),
		};
	}
	const data = parsed.data;
	const supabase = await createClient();

	const { error: baseErr } = await supabase
		.from("inventory_items")
		.update({
			name: data.name,
			unit: data.unit,
			image_url: data.image_url,
			notes: data.notes,
			is_active: data.is_active,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("category", "fixed_asset");
	if (baseErr) {
		return {
			errors: { _form: [baseErr.message] },
			values: snapshot(formData),
		};
	}

	// Re-evaluate capitalization policy on edit (price/life may have changed).
	const capitalized = qualifiesAsFixedAsset(
		data.purchase_price,
		data.useful_life_months,
	);
	const deprMethod = capitalized ? "straight_line" : "none";

	const { error: cfgErr } = await supabase
		.from("items_fixed_asset_config")
		.update({
			asset_number: data.asset_number,
			serial_number: data.serial_number,
			acquisition_type: data.acquisition_type,
			purchase_price: data.purchase_price,
			purchase_date: data.purchase_date,
			salvage_value: data.salvage_value,
			useful_life_months: data.useful_life_months,
			depreciation_method: deprMethod,
			is_capitalized: capitalized,
			depreciation_start_date: data.depreciation_start_date,
			condition: data.condition,
			current_location: data.current_location,
			updated_at: new Date().toISOString(),
		})
		.eq("item_id", id);
	if (cfgErr) {
		return {
			errors: { _form: [`Gagal update config: ${cfgErr.message}`] },
			values: snapshot(formData),
		};
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/assets");
	revalidatePath(`/warehouse/items/${id}/edit`);
	revalidatePath("/warehouse");
	redirect(safeReturnTo(formData.get("return_to")));
}
