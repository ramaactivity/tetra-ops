"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { defaultsForFixedAsset } from "@/lib/inventory/coa-defaults";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions untuk Fixed Asset (Aktiva Tetap) items — peralatan tahan
 * lama yang dikapitalisasi & disusutkan. Tidak masuk ke COGS per event.
 *
 * Pattern: insert ke inventory_items (base, category='fixed_asset') +
 * items_fixed_asset_config (satellite) dalam 2 step.
 *
 * Catatan: Untuk MVP, jurnal CapEx (Dr 1-400 / Cr Kas) belum auto-create
 * di sini — itu tugas refactor purchases.ts. Action ini hanya register
 * asset di master data.
 */

const SKU_REGEX = /^[A-Z0-9_-]+$/;
const COA_REGEX = /^[0-9]-[0-9]{3}$/;
const CONDITIONS = ["normal", "service", "damaged", "lost"] as const;
const LOCATIONS = [
	"gudang_pusat",
	"event",
	"service_center",
	"crew_carry",
	"lost",
] as const;
const DEPR_METHODS = ["straight_line", "none"] as const;

const FixedAssetItemInputSchema = z.object({
	sku: z
		.string()
		.trim()
		.min(2, "Minimal 2 karakter")
		.max(40, "Maksimal 40 karakter")
		.regex(SKU_REGEX, "Pakai huruf kapital, angka, hyphen, underscore"),
	name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	unit: z.string().trim().min(1, "Wajib").max(20).default("unit"),
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
	depreciation_method: z.enum(DEPR_METHODS).default("straight_line"),
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
	coa_account_asset: z
		.string()
		.trim()
		.regex(COA_REGEX, "Format kode akun: x-xxx")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	coa_account_accum_depr: z
		.string()
		.trim()
		.regex(COA_REGEX, "Format kode akun: x-xxx")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	coa_account_depr_expense: z
		.string()
		.trim()
		.regex(COA_REGEX, "Format kode akun: x-xxx")
		.optional()
		.or(z.literal("").transform(() => undefined)),
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
		sku: formData.get("sku"),
		name: formData.get("name"),
		unit: formData.get("unit") || "unit",
		asset_number: formData.get("asset_number"),
		serial_number: formData.get("serial_number"),
		purchase_price: formData.get("purchase_price"),
		purchase_date: formData.get("purchase_date"),
		salvage_value: formData.get("salvage_value"),
		useful_life_months: formData.get("useful_life_months"),
		depreciation_method: formData.get("depreciation_method") || "straight_line",
		depreciation_start_date: formData.get("depreciation_start_date"),
		condition: formData.get("condition"),
		current_location: formData.get("current_location"),
		coa_account_asset: formData.get("coa_account_asset"),
		coa_account_accum_depr: formData.get("coa_account_accum_depr"),
		coa_account_depr_expense: formData.get("coa_account_depr_expense"),
		image_url: formData.get("image_url"),
		notes: formData.get("notes"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshot(formData: FormData): Record<string, string> {
	const keys = [
		"sku",
		"name",
		"unit",
		"asset_number",
		"serial_number",
		"purchase_price",
		"purchase_date",
		"salvage_value",
		"useful_life_months",
		"depreciation_method",
		"depreciation_start_date",
		"condition",
		"current_location",
		"coa_account_asset",
		"coa_account_accum_depr",
		"coa_account_depr_expense",
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
	const allowed = new Set(["/settings/items", "/warehouse"]);
	return allowed.has(s) ? s : "/warehouse";
}

export async function createFixedAssetItem(
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
	const coa = defaultsForFixedAsset();
	const supabase = await createClient();

	const { data: inserted, error: insErr } = await supabase
		.from("inventory_items")
		.insert({
			sku: data.sku,
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

	const { error: cfgErr } = await supabase
		.from("items_fixed_asset_config")
		.insert({
			item_id: inserted.id,
			asset_number: data.asset_number,
			serial_number: data.serial_number,
			purchase_price: data.purchase_price,
			purchase_date: data.purchase_date,
			salvage_value: data.salvage_value,
			useful_life_months: data.useful_life_months,
			depreciation_method: data.depreciation_method,
			depreciation_start_date: data.depreciation_start_date ?? data.purchase_date,
			condition: data.condition,
			current_location: data.current_location,
			coa_account_asset: data.coa_account_asset ?? coa.asset,
			coa_account_accum_depr: data.coa_account_accum_depr ?? coa.accum_depr,
			coa_account_depr_expense: data.coa_account_depr_expense ?? coa.depr_expense,
		});
	if (cfgErr) {
		await supabase.from("inventory_items").delete().eq("id", inserted.id);
		return {
			errors: { _form: [`Gagal create config: ${cfgErr.message}`] },
			values: snapshot(formData),
		};
	}

	revalidatePath("/warehouse");
	revalidatePath("/settings/items");
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
			sku: data.sku,
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

	const { error: cfgErr } = await supabase
		.from("items_fixed_asset_config")
		.update({
			asset_number: data.asset_number,
			serial_number: data.serial_number,
			purchase_price: data.purchase_price,
			purchase_date: data.purchase_date,
			salvage_value: data.salvage_value,
			useful_life_months: data.useful_life_months,
			depreciation_method: data.depreciation_method,
			depreciation_start_date: data.depreciation_start_date,
			condition: data.condition,
			current_location: data.current_location,
			coa_account_asset: data.coa_account_asset ?? null,
			coa_account_accum_depr: data.coa_account_accum_depr ?? null,
			coa_account_depr_expense: data.coa_account_depr_expense ?? null,
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
	revalidatePath(`/warehouse/items/${id}/edit`);
	revalidatePath("/settings/items");
	redirect(safeReturnTo(formData.get("return_to")));
}
