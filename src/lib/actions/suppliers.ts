"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

const PAYMENT_TERMS = [
	"cash",
	"top_7",
	"top_14",
	"top_30",
	"top_60",
	"top_custom",
] as const;

const SupplierInputSchema = z.object({
	name: z.string().trim().min(2).max(120),
	category: z
		.string()
		.trim()
		.max(60)
		.optional()
		.transform((v) => (v ? v : null)),
	contact: z
		.string()
		.trim()
		.max(120)
		.optional()
		.transform((v) => (v ? v : null)),
	default_payment_term: z.enum(PAYMENT_TERMS).default("cash"),
	default_top_days: z.coerce.number().int().nonnegative().max(365).default(0),
	notes: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : null)),
	is_active: z.coerce.boolean().default(true),
});

type SupplierErrors = Partial<
	Record<keyof z.infer<typeof SupplierInputSchema> | "_form", string[]>
>;

export type SupplierFormState =
	| {
			errors?: SupplierErrors;
			values?: Record<string, string>;
			success?: true;
	  }
	| undefined;

function snapshot(formData: FormData): Record<string, string> {
	const keys = [
		"name",
		"category",
		"contact",
		"default_payment_term",
		"default_top_days",
		"notes",
		"is_active",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

export async function createSupplier(
	_prev: SupplierFormState,
	formData: FormData,
): Promise<SupplierFormState> {
	await requireOwnerLevel();

	const parsed = SupplierInputSchema.safeParse({
		name: formData.get("name"),
		category: formData.get("category"),
		contact: formData.get("contact"),
		default_payment_term: formData.get("default_payment_term") || "cash",
		default_top_days: formData.get("default_top_days") || 0,
		notes: formData.get("notes"),
		is_active: formData.get("is_active") !== "false",
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as SupplierErrors,
			values: snapshot(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.from("suppliers").insert(parsed.data);
	if (error) {
		return { errors: { _form: [error.message] }, values: snapshot(formData) };
	}

	revalidatePath("/warehouse/suppliers");
	revalidatePath("/warehouse");
	return { success: true };
}

export async function updateSupplier(
	id: string,
	_prev: SupplierFormState,
	formData: FormData,
): Promise<SupplierFormState> {
	await requireOwnerLevel();

	const parsed = SupplierInputSchema.safeParse({
		name: formData.get("name"),
		category: formData.get("category"),
		contact: formData.get("contact"),
		default_payment_term: formData.get("default_payment_term") || "cash",
		default_top_days: formData.get("default_top_days") || 0,
		notes: formData.get("notes"),
		is_active: formData.get("is_active") !== "false",
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as SupplierErrors,
			values: snapshot(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("suppliers")
		.update({
			...parsed.data,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (error) {
		return { errors: { _form: [error.message] }, values: snapshot(formData) };
	}

	revalidatePath("/warehouse/suppliers");
	revalidatePath("/warehouse");
	return { success: true };
}

export async function archiveSupplier(id: string): Promise<void> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("suppliers")
		.update({
			deleted_at: new Date().toISOString(),
			is_active: false,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/warehouse/suppliers");
}

// ─────────────────────────────────────────────────────────────────────────────
// Supplier prices (Market List)
// ─────────────────────────────────────────────────────────────────────────────

const SupplierPriceSchema = z.object({
	supplier_id: z.uuid(),
	item_id: z.uuid(),
	pack_price: z.coerce.number().int().nonnegative(),
	pack_size: z.coerce.number().positive(),
	pack_unit: z.string().trim().min(1).max(20),
	is_primary: z.coerce.boolean().default(false),
	notes: z
		.string()
		.trim()
		.max(300)
		.optional()
		.transform((v) => (v ? v : null)),
});

type SupplierPriceErrors = Partial<
	Record<keyof z.infer<typeof SupplierPriceSchema> | "_form", string[]>
>;

export type SupplierPriceFormState =
	| {
			errors?: SupplierPriceErrors;
			values?: Record<string, string>;
			success?: true;
	  }
	| undefined;

function priceSnapshot(formData: FormData): Record<string, string> {
	const keys = [
		"supplier_id",
		"item_id",
		"pack_price",
		"pack_size",
		"pack_unit",
		"is_primary",
		"notes",
	];
	const out: Record<string, string> = {};
	for (const k of keys) out[k] = String(formData.get(k) ?? "");
	return out;
}

export async function upsertSupplierPrice(
	_prev: SupplierPriceFormState,
	formData: FormData,
): Promise<SupplierPriceFormState> {
	await requireOwnerLevel();

	const parsed = SupplierPriceSchema.safeParse({
		supplier_id: formData.get("supplier_id"),
		item_id: formData.get("item_id"),
		pack_price: formData.get("pack_price"),
		pack_size: formData.get("pack_size"),
		pack_unit: formData.get("pack_unit"),
		is_primary: formData.get("is_primary") === "true",
		notes: formData.get("notes"),
	});
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as SupplierPriceErrors,
			values: priceSnapshot(formData),
		};
	}

	const supabase = await createClient();
	const idRaw = formData.get("id");
	const existingId = typeof idRaw === "string" && idRaw ? idRaw : null;

	if (existingId) {
		const { error } = await supabase
			.from("supplier_prices")
			.update({
				...parsed.data,
				updated_at: new Date().toISOString(),
			})
			.eq("id", existingId);
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: priceSnapshot(formData),
			};
		}
	} else {
		const { error } = await supabase
			.from("supplier_prices")
			.upsert(parsed.data, { onConflict: "supplier_id,item_id" });
		if (error) {
			return {
				errors: { _form: [error.message] },
				values: priceSnapshot(formData),
			};
		}
	}

	// NOTE: tidak panggil revalidatePath di sini supaya server response
	// snappy (~50-300ms saved per call). Client side melalui router.refresh()
	// di MarketEntryDialog onSuccess handler sudah cukup untuk
	// invalidate displayed data. revalidatePath dibutuhkan cuma kalau ada
	// reader external yang cache page-level — Tetra workflow flow user
	// stays on /warehouse jadi router.refresh handle semua.
	return { success: true };
}

export async function deleteSupplierPrice(id: string): Promise<void> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase.from("supplier_prices").delete().eq("id", id);
	if (error) throw new Error(error.message);
}

/**
 * Toggle is_primary for a given supplier_price row. The single-primary
 * trigger handles flipping off the other rows; the sync trigger updates
 * inventory_items.purchase_price_avg.
 */
export async function setPrimarySupplierPrice(id: string): Promise<void> {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("supplier_prices")
		.update({ is_primary: true, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);
}
