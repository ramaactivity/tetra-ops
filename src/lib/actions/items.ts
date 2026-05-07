"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = ["consumable", "equipment"] as const;
const CONDITIONS = ["normal", "service", "damaged", "lost"] as const;
const LOCATIONS = [
	"gudang_pusat",
	"event",
	"service_center",
	"crew_carry",
	"lost",
] as const;

const ItemInputSchema = z
	.object({
		sku: z
			.string()
			.trim()
			.min(2, "Minimal 2 karakter")
			.max(40, "Maksimal 40 karakter")
			.regex(/^[A-Z0-9_-]+$/, "Pakai huruf kapital, angka, hyphen, underscore"),
		name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
		category: z.enum(CATEGORIES, "Pilih kategori"),
		unit: z.string().trim().min(1, "Wajib").max(20),
		min_stock_alert: z.coerce.number().int().nonnegative().default(0),
		purchase_price_avg: z.coerce.number().int().nonnegative().default(0),
		purchase_price: z
			.preprocess(
				(v) => (v === "" || v === null || v === undefined ? null : v),
				z.coerce.number().int().nonnegative().nullable(),
			)
			.optional()
			.transform((v) => v ?? null),
		purchase_date: z
			.preprocess(
				(v) => (v === "" || v === null || v === undefined ? null : v),
				z.iso.date().nullable(),
			)
			.optional()
			.transform((v) => v ?? null),
		useful_life_months: z
			.preprocess(
				(v) => (v === "" || v === null || v === undefined ? null : v),
				z.coerce.number().int().positive().nullable(),
			)
			.optional()
			.transform((v) => v ?? null),
		condition: z
			.union([z.enum(CONDITIONS), z.literal("")])
			.optional()
			.transform((v) => (v ? (v as (typeof CONDITIONS)[number]) : null)),
		current_location: z
			.union([z.enum(LOCATIONS), z.literal("")])
			.optional()
			.transform((v) => (v ? (v as (typeof LOCATIONS)[number]) : null)),
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
			d.category === "equipment" ||
			(d.condition === null && d.current_location === null),
		{
			message: "Consumable tidak boleh punya condition atau location",
			path: ["category"],
		},
	);

export type ItemInput = z.infer<typeof ItemInputSchema>;
type ItemErrors = Partial<Record<keyof ItemInput | "_form", string[]>>;
export type ItemFormState =
	| { errors?: ItemErrors; values?: Record<string, string> }
	| undefined;

function parseFormData(formData: FormData) {
	return ItemInputSchema.safeParse({
		sku: formData.get("sku"),
		name: formData.get("name"),
		category: formData.get("category"),
		unit: formData.get("unit"),
		min_stock_alert: formData.get("min_stock_alert"),
		purchase_price_avg: formData.get("purchase_price_avg"),
		purchase_price: formData.get("purchase_price"),
		purchase_date: formData.get("purchase_date"),
		useful_life_months: formData.get("useful_life_months"),
		condition: formData.get("condition"),
		current_location: formData.get("current_location"),
		notes: formData.get("notes"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = [
		"sku",
		"name",
		"category",
		"unit",
		"min_stock_alert",
		"purchase_price_avg",
		"purchase_price",
		"purchase_date",
		"useful_life_months",
		"condition",
		"current_location",
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

export async function createItem(
	_prev: ItemFormState,
	formData: FormData,
): Promise<ItemFormState> {
	await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as ItemErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.from("inventory_items").insert(parsed.data);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	revalidatePath("/settings/items");
	revalidatePath("/warehouse");
	redirect("/settings/items");
}

export async function updateItem(
	id: string,
	_prev: ItemFormState,
	formData: FormData,
): Promise<ItemFormState> {
	await requireOwnerLevel();

	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as ItemErrors,
			values: snapshotValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("inventory_items")
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}

	revalidatePath("/settings/items");
	revalidatePath(`/settings/items/${id}/edit`);
	revalidatePath("/warehouse");
	redirect("/settings/items");
}

export async function archiveItem(id: string) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("inventory_items")
		.update({ deleted_at: new Date().toISOString(), is_active: false })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/settings/items");
	revalidatePath("/warehouse");
}
