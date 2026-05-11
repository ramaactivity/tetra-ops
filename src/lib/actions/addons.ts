"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const ADDON_CATEGORIES = [
	"voucher",
	"print_extras",
	"time_extras",
	"experience",
	"costume",
] as const;

const AddonInputSchema = z.object({
	name: z.string().trim().min(2, "Minimal 2 karakter").max(100),
	category: z.enum(ADDON_CATEGORIES, "Pilih kategori"),
	unit: z.string().trim().min(1, "Wajib").max(20),
	price: z.coerce.number().int().min(0, "Tidak boleh negatif"),
	requires_extra_crew: z.coerce.boolean(),
	is_active: z.coerce.boolean(),
	inventory_item_id: z
		.string()
		.uuid()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
});

export type AddonInput = z.infer<typeof AddonInputSchema>;

type AddonErrors = Partial<Record<keyof AddonInput | "_form", string[]>>;

export type AddonFormState =
	| {
			errors?: AddonErrors;
			values?: Record<string, string>;
	  }
	| undefined;

const FORM_KEYS = [
	"name",
	"category",
	"unit",
	"price",
	"inventory_item_id",
] as const;

function parseFormData(formData: FormData) {
	return AddonInputSchema.safeParse({
		name: formData.get("name"),
		category: formData.get("category"),
		unit: formData.get("unit"),
		price: formData.get("price"),
		requires_extra_crew: formData.get("requires_extra_crew") === "on",
		is_active: formData.get("is_active") === "on",
		inventory_item_id: formData.get("inventory_item_id") ?? "",
	});
}

function snapshotValues(formData: FormData): Record<string, string> {
	return {
		...Object.fromEntries(
			FORM_KEYS.map((k) => [k, String(formData.get(k) ?? "")]),
		),
		requires_extra_crew:
			formData.get("requires_extra_crew") === "on" ? "on" : "",
		is_active: formData.get("is_active") === "on" ? "on" : "",
	};
}

async function requireOwnerLevel() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");
	if (user.profile.role !== "super_admin" && user.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return user;
}

export async function createAddon(
	_prev: AddonFormState,
	formData: FormData,
): Promise<AddonFormState> {
	await requireOwnerLevel();
	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as AddonErrors,
			values: snapshotValues(formData),
		};
	}
	const supabase = await createClient();
	const { error } = await supabase.from("addons").insert(parsed.data);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}
	revalidatePath("/settings/addons");
	redirect("/settings/addons");
}

export async function updateAddon(
	id: string,
	_prev: AddonFormState,
	formData: FormData,
): Promise<AddonFormState> {
	await requireOwnerLevel();
	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as AddonErrors,
			values: snapshotValues(formData),
		};
	}
	const supabase = await createClient();
	const { error } = await supabase
		.from("addons")
		.update(parsed.data)
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}
	revalidatePath("/settings/addons");
	revalidatePath(`/settings/addons/${id}/edit`);
	redirect("/settings/addons");
}

export async function archiveAddon(id: string) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("addons")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/settings/addons");
}
