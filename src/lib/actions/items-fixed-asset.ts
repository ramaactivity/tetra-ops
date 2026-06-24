"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { qualifiesAsFixedAsset } from "@/lib/inventory/capitalization-policy";
import { defaultsForFixedAsset } from "@/lib/inventory/coa-defaults";
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
		sku_override: formData.get("sku_override"),
		asset_number: formData.get("asset_number"),
		serial_number: formData.get("serial_number"),
		unit: formData.get("unit") || "unit",
		acquisition_type: formData.get("acquisition_type") || "new_commercial",
		purchase_price: formData.get("purchase_price"),
		purchase_date: formData.get("purchase_date"),
		salvage_value: formData.get("salvage_value"),
		useful_life_months: formData.get("useful_life_months"),
		depreciation_start_date: formData.get("depreciation_start_date"),
		condition: formData.get("condition"),
		current_location: formData.get("current_location"),
		image_url: formData.get("image_url"),
		notes: formData.get("notes"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshot(formData: FormData): Record<string, string> {
	const keys = [
		"name",
		"sku_override",
		"asset_number",
		"serial_number",
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

	// Auto-generate SKU dari nama
	const baseSku = data.sku_override || generateFixedAssetSku(data.name);
	const sku = await ensureUniqueSku(
		supabase as unknown as Parameters<typeof ensureUniqueSku>[0],
		baseSku,
	);
	// Asset number defaults to SKU kalau user tidak override (1 asset = 1 SKU = 1 asset_number)
	const assetNumber = data.asset_number || sku;
	const coa = defaultsForFixedAsset();

	const { data: inserted, error: insErr } = await supabase
		.from("inventory_items")
		.insert({
			sku,
			name: data.name,
			category: "fixed_asset",
			unit: data.unit,
			image_url: data.image_url,
			notes: data.notes,
			is_active: data.is_active,
		})
		.select("id")
		.single();
	if (insErr || !inserted) {
		return {
			errors: { _form: [insErr?.message ?? "Gagal create asset"] },
			values: snapshot(formData),
		};
	}

	// Capitalization policy: only capitalize + depreciate when price > Rp1,5jt
	// AND useful life >= 24 months. Below that → expensed (no depreciation),
	// even if a useful life was entered.
	const capitalized = qualifiesAsFixedAsset(
		data.purchase_price,
		data.useful_life_months,
	);
	const deprMethod = capitalized ? "straight_line" : "none";

	// Auto-create journal entry untuk Setoran Modal Owner
	// (Dr 1-400 Peralatan / Cr 3-100 Modal Owner)
	// new_commercial dan used_commercial TIDAK auto-jurnal di sini —
	// user akan catat Pembelian via /warehouse/purchases yang sudah handle
	// Dr 1-400 / Cr Kas atau Hutang Vendor.
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
				entry_date: data.purchase_date ?? new Date().toISOString().slice(0, 10),
				entry_type: "adjustment",
				description: `Setoran Modal Owner — ${data.name} (${sku})`,
				source_type: "owner_contribution",
				source_id: inserted.id,
				total_amount: data.purchase_price,
				created_by: me.profile.id,
			})
			.select("id")
			.single();
		if (entry && !entryErr) {
			acquisitionJournalId = entry.id;
			await supabase.from("journal_lines").insert([
				{
					entry_id: entry.id,
					// Capitalized → asset account; below policy → expense it now.
					account_code: capitalized ? coa.asset : "5-250",
					debit_amount: data.purchase_price,
					credit_amount: 0,
					description: capitalized
						? `Aset masuk (setoran owner): ${data.name}`
						: `Beban perlengkapan (setoran owner): ${data.name}`,
					line_order: 1,
				},
				{
					entry_id: entry.id,
					account_code: "3-100",
					debit_amount: 0,
					credit_amount: data.purchase_price,
					description: `Setoran modal — ${data.name}`,
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
			serial_number: data.serial_number,
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
	if (cfgErr) {
		if (acquisitionJournalId) {
			await supabase
				.from("journal_entries")
				.delete()
				.eq("id", acquisitionJournalId);
		}
		await supabase.from("inventory_items").delete().eq("id", inserted.id);
		return {
			errors: { _form: [`Gagal create config: ${cfgErr.message}`] },
			values: snapshot(formData),
		};
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse/assets");
	revalidatePath("/warehouse");
	revalidatePath("/finance/accounting");
	redirect(safeReturnTo(formData.get("return_to")));
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
