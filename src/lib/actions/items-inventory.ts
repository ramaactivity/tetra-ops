"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { defaultsForInventorySku } from "@/lib/inventory/coa-defaults";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions untuk Inventory (Persediaan) items — barang habis pakai
 * yang dideduct dari stok per event dan masuk COGS. Pattern: insert ke
 * inventory_items (base) + items_inventory_config (satellite) dalam 2 step,
 * dengan rollback manual kalau step 2 gagal.
 *
 * Untuk Fixed Asset (Aktiva Tetap) gunakan items-fixed-asset.ts.
 */

const SKU_REGEX = /^[A-Z0-9_-]+$/;
const COA_REGEX = /^[0-9]-[0-9]{3}$/;

const InventoryItemInputSchema = z.object({
	sku: z
		.string()
		.trim()
		.min(2, "Minimal 2 karakter")
		.max(40, "Maksimal 40 karakter")
		.regex(SKU_REGEX, "Pakai huruf kapital, angka, hyphen, underscore"),
	name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	base_unit: z.string().trim().min(1, "Wajib").max(20),
	min_stock_alert: z.coerce.number().int().nonnegative().default(0),
	selling_price: z
		.preprocess(
			(v) => (v === "" || v === null || v === undefined ? null : v),
			z.coerce.number().int().nonnegative().nullable(),
		)
		.optional()
		.transform((v) => v ?? null),
	coa_account_inventory: z
		.string()
		.trim()
		.regex(COA_REGEX, "Format kode akun: x-xxx")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	coa_account_cogs: z
		.string()
		.trim()
		.regex(COA_REGEX, "Format kode akun: x-xxx")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	coa_account_wastage: z
		.string()
		.trim()
		.regex(COA_REGEX, "Format kode akun: x-xxx")
		.optional()
		.or(z.literal("").transform(() => undefined)),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	is_active: z.coerce.boolean(),
});

export type InventoryItemInput = z.infer<typeof InventoryItemInputSchema>;
type Errors = Partial<Record<keyof InventoryItemInput | "_form", string[]>>;
export type InventoryItemFormState =
	| { errors?: Errors; values?: Record<string, string> }
	| undefined;

function parse(formData: FormData) {
	return InventoryItemInputSchema.safeParse({
		sku: formData.get("sku"),
		name: formData.get("name"),
		base_unit: formData.get("base_unit"),
		min_stock_alert: formData.get("min_stock_alert"),
		selling_price: formData.get("selling_price"),
		coa_account_inventory: formData.get("coa_account_inventory"),
		coa_account_cogs: formData.get("coa_account_cogs"),
		coa_account_wastage: formData.get("coa_account_wastage"),
		notes: formData.get("notes"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshot(formData: FormData): Record<string, string> {
	const keys = [
		"sku",
		"name",
		"base_unit",
		"min_stock_alert",
		"selling_price",
		"coa_account_inventory",
		"coa_account_cogs",
		"coa_account_wastage",
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
	const coa = defaultsForInventorySku(data.sku);
	const supabase = await createClient();

	// Step 1: insert base
	const { data: inserted, error: insErr } = await supabase
		.from("inventory_items")
		.insert({
			sku: data.sku,
			name: data.name,
			category: "inventory",
			unit: data.base_unit,
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

	// Step 2: insert satellite
	const { error: cfgErr } = await supabase.from("items_inventory_config").insert({
		item_id: inserted.id,
		base_unit: data.base_unit,
		unit_conversion: {},
		min_stock_alert: data.min_stock_alert,
		purchase_price_avg: 0,
		selling_price: data.selling_price,
		coa_account_inventory: data.coa_account_inventory ?? coa.inventory,
		coa_account_cogs: data.coa_account_cogs ?? coa.cogs,
		coa_account_wastage: data.coa_account_wastage ?? coa.wastage,
	});
	if (cfgErr) {
		// Manual rollback — delete the base row
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

	const { error: baseErr } = await supabase
		.from("inventory_items")
		.update({
			sku: data.sku,
			name: data.name,
			unit: data.base_unit,
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
			min_stock_alert: data.min_stock_alert,
			selling_price: data.selling_price,
			coa_account_inventory: data.coa_account_inventory ?? null,
			coa_account_cogs: data.coa_account_cogs ?? null,
			coa_account_wastage: data.coa_account_wastage ?? null,
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
