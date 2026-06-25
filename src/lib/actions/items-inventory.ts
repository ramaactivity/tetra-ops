"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { defaultsForInventorySku } from "@/lib/inventory/coa-defaults";
import {
	ensureUniqueSku,
	generateInventorySku,
} from "@/lib/inventory/sku-generator";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions untuk Inventory (Persediaan) items.
 *
 * Flow baru (2026-05-26):
 *   - User input NAMA dulu; SKU auto-generated dari nama (slug + prefix).
 *   - Unit: dropdown preset (pcs/box/pack/roll/sheet).
 *   - Multi-tier conversion via purchase_unit + conversion_factor:
 *       1 <purchase_unit> = N <base_unit> → disimpan ke unit_conversion JSONB v2.
 *   - COA otomatis dari SKU prefix; tidak di-expose ke form Adit.
 *   - is_bom_component opsional untuk modul Bill of Materials nanti.
 *   - selling_price dihapus (misleading); avg cost auto-update dari Pembelian.
 */

const SKU_REGEX = /^[A-Z0-9_-]+$/;
const UNIT_OPTIONS = ["pcs", "box", "pack", "roll", "sheet"] as const;
type UnitOption = (typeof UNIT_OPTIONS)[number];

const InventoryItemInputSchema = z
	.object({
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
		base_unit: z.enum(UNIT_OPTIONS, "Pilih unit penggunaan"),
		purchase_unit: z
			.enum(UNIT_OPTIONS, "Pilih unit pembelian")
			.optional()
			.transform((v) => (v ? v : null)),
		conversion_factor: z
			.preprocess(
				(v) => (v === "" || v === null || v === undefined ? null : v),
				z.coerce.number().positive().nullable(),
			)
			.optional()
			.transform((v) => v ?? null),
		min_stock_alert: z.coerce.number().int().nonnegative().default(0),
		preferred_supplier_id: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? v : null))
			.refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), {
				message: "supplier_id harus UUID atau kosong",
			}),
		is_bom_component: z.coerce.boolean().default(false),
		notes: z
			.string()
			.trim()
			.max(500)
			.optional()
			.transform((v) => (v ? v : null)),
		is_active: z.coerce.boolean(),
	})
	.refine(
		(d) =>
			!d.purchase_unit ||
			d.purchase_unit === d.base_unit ||
			(d.conversion_factor !== null && d.conversion_factor > 0),
		{
			message:
				"Faktor konversi wajib diisi kalau unit pembelian beda dari unit penggunaan",
			path: ["conversion_factor"],
		},
	);

export type InventoryItemInput = z.infer<typeof InventoryItemInputSchema>;
type Errors = Partial<Record<keyof InventoryItemInput | "_form", string[]>>;
export type InventoryItemFormState =
	| { errors?: Errors; values?: Record<string, string> }
	| undefined;

function parse(formData: FormData) {
	return InventoryItemInputSchema.safeParse({
		name: formData.get("name"),
		// ?? undefined: field string-optional = null saat absen (mis.
		// preferred_supplier_id tak dirender bila belum ada supplier terdaftar) →
		// optional() tolak null. Samakan dgn pola fix di action lain.
		sku_override: formData.get("sku_override") ?? undefined,
		base_unit: formData.get("base_unit"),
		purchase_unit: formData.get("purchase_unit"),
		conversion_factor: formData.get("conversion_factor"),
		min_stock_alert: formData.get("min_stock_alert"),
		preferred_supplier_id: formData.get("preferred_supplier_id") ?? undefined,
		is_bom_component: formData.get("is_bom_component") === "on",
		notes: formData.get("notes") ?? undefined,
		is_active: formData.get("is_active") === "on",
	});
}

function snapshot(formData: FormData): Record<string, string> {
	const keys = [
		"name",
		"sku_override",
		"base_unit",
		"purchase_unit",
		"conversion_factor",
		"min_stock_alert",
		"preferred_supplier_id",
		"notes",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	out.is_bom_component = formData.get("is_bom_component") === "on" ? "on" : "";
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

/**
 * Build v2 unit_conversion JSONB from form inputs:
 *   { base_unit, units: { <base>: {multiplier:1, kind:base}, <purchase>: {multiplier:N, kind:purchase} } }
 */
function buildConversionJsonb(
	baseUnit: UnitOption,
	purchaseUnit: UnitOption | null,
	conversionFactor: number | null,
): Record<string, unknown> {
	const units: Record<string, unknown> = {
		[baseUnit]: {
			multiplier: 1,
			denominator: 1,
			kind: "base",
			label: prettifyUnit(baseUnit),
		},
	};
	if (purchaseUnit && purchaseUnit !== baseUnit && conversionFactor) {
		units[purchaseUnit] = {
			multiplier: conversionFactor,
			denominator: null,
			kind: "purchase",
			// Label clean — TIDAK include "(N base)" parenthetical karena display
			// component yang renders dropdown bisa compose info dari multiplier
			// field. Label di dropdown harus singkat supaya user gak confused.
			label: prettifyUnit(purchaseUnit),
		};
	}
	return { base_unit: baseUnit, units };
}

function prettifyUnit(u: UnitOption): string {
	return u === "sheet" ? "Lembar" : u.charAt(0).toUpperCase() + u.slice(1);
}

export async function createInventoryItem(
	_prev: InventoryItemFormState,
	formData: FormData,
): Promise<InventoryItemFormState> {
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

	// Auto-generate SKU dari nama kalau user tidak override
	const baseSku = data.sku_override || generateInventorySku(data.name);
	const sku = await ensureUniqueSku(
		supabase as unknown as Parameters<typeof ensureUniqueSku>[0],
		baseSku,
	);

	const coa = defaultsForInventorySku(sku);
	const unitConversion = buildConversionJsonb(
		data.base_unit,
		data.purchase_unit,
		data.conversion_factor,
	);

	// Step 1: insert base — write unit_conversion juga supaya consumer (warehouse
	// list, pembelian, market list) yang baca dari base table dapat data fresh.
	const { data: inserted, error: insErr } = await supabase
		.from("inventory_items")
		.insert({
			sku,
			name: data.name,
			category: "inventory",
			unit: data.base_unit,
			unit_conversion: unitConversion,
			notes: data.notes,
			is_active: data.is_active,
		})
		.select("id")
		.single();
	if (insErr || !inserted) {
		return {
			errors: { _form: [insErr?.message ?? "Gagal create item"] },
			values: snapshot(formData),
		};
	}

	// Step 2: insert satellite (COA auto, avg cost starts 0 — auto-update via Pembelian)
	const { error: cfgErr } = await supabase
		.from("items_inventory_config")
		.insert({
			item_id: inserted.id,
			base_unit: data.base_unit,
			unit_conversion: unitConversion,
			min_stock_alert: data.min_stock_alert,
			purchase_price_avg: 0,
			selling_price: null,
			preferred_supplier_id: data.preferred_supplier_id,
			coa_account_inventory: coa.inventory,
			coa_account_cogs: coa.cogs,
			coa_account_wastage: coa.wastage,
			is_bom_component: data.is_bom_component,
		});
	if (cfgErr) {
		await supabase.from("inventory_items").delete().eq("id", inserted.id);
		return {
			errors: { _form: [`Gagal create config: ${cfgErr.message}`] },
			values: snapshot(formData),
		};
	}

	revalidatePath("/warehouse");
	revalidatePath("/warehouse");
	redirect(safeReturnTo(formData.get("return_to")));
}

export async function updateInventoryItem(
	id: string,
	_prev: InventoryItemFormState,
	formData: FormData,
): Promise<InventoryItemFormState> {
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

	const unitConversion = buildConversionJsonb(
		data.base_unit,
		data.purchase_unit,
		data.conversion_factor,
	);

	// inventory_items.unit_conversion HARUS ikut diupdate — banyak consumer
	// (warehouse list, pembelian, market list display) baca dari base table
	// langsung, bukan dari satellite. Kalau cuma update satellite, UI lain
	// jadi stale. Single source of truth: kedua tabel di-write bersama.
	const { error: baseErr } = await supabase
		.from("inventory_items")
		.update({
			name: data.name,
			unit: data.base_unit,
			unit_conversion: unitConversion,
			notes: data.notes,
			is_active: data.is_active,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.eq("category", "inventory");
	if (baseErr) {
		return {
			errors: { _form: [baseErr.message] },
			values: snapshot(formData),
		};
	}

	const { error: cfgErr } = await supabase
		.from("items_inventory_config")
		.update({
			base_unit: data.base_unit,
			unit_conversion: unitConversion,
			min_stock_alert: data.min_stock_alert,
			preferred_supplier_id: data.preferred_supplier_id,
			is_bom_component: data.is_bom_component,
			updated_at: new Date().toISOString(),
		})
		.eq("item_id", id);
	if (cfgErr) {
		return {
			errors: { _form: [`Gagal update config: ${cfgErr.message}`] },
			values: snapshot(formData),
		};
	}

	// Cascade ke supplier_prices: kalau item punya bulk purchase unit (Box,
	// Pack, dst dengan multiplier>1), semua existing supplier_prices rows
	// di-sync ke pack_unit + pack_size baru. Tanpa cascade ini, modal Market
	// List akan tampil unit lama padahal item config sudah berubah.
	if (
		data.purchase_unit &&
		data.purchase_unit !== data.base_unit &&
		data.conversion_factor &&
		data.conversion_factor > 0
	) {
		const { error: cascadeErr } = await supabase
			.from("supplier_prices")
			.update({
				pack_unit: data.purchase_unit,
				pack_size: data.conversion_factor,
				updated_at: new Date().toISOString(),
			})
			.eq("item_id", id);
		if (cascadeErr) {
			return {
				errors: {
					_form: [`Gagal sync supplier prices: ${cascadeErr.message}`],
				},
				values: snapshot(formData),
			};
		}
	}

	revalidatePath("/warehouse");
	revalidatePath(`/warehouse/items/${id}/edit`);
	revalidatePath("/warehouse");
	redirect(safeReturnTo(formData.get("return_to")));
}
