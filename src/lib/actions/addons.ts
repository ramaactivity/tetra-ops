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
});

export type AddonInput = z.infer<typeof AddonInputSchema>;

type AddonErrors = Partial<
	Record<keyof AddonInput | "addon_components" | "_form", string[]>
>;

export type AddonFormState =
	| {
			errors?: AddonErrors;
			values?: Record<string, string>;
	  }
	| undefined;

const FORM_KEYS = ["name", "category", "unit", "price"] as const;

// Komponen inventory yang dikonsumsi 1 add-on (1 add-on = N item). Dikirim form
// sebagai JSON di field hidden `addon_components`.
const AddonComponentsSchema = z
	.array(
		z.object({
			inventory_item_id: z.string().uuid(),
			qty_per_unit: z.coerce.number().positive(),
		}),
	)
	.max(20);

type AddonComponentInput = z.infer<typeof AddonComponentsSchema>[number];

/**
 * Parse + validate the `addon_components` JSON field. Dedupes by item (last
 * write wins) to satisfy the UNIQUE(addon_id, inventory_item_id) constraint.
 * Returns { ok, components } or { ok:false, error } for a form-level message.
 */
function parseComponents(
	formData: FormData,
):
	| { ok: true; components: AddonComponentInput[] }
	| { ok: false; error: string } {
	const raw = formData.get("addon_components");
	if (typeof raw !== "string" || raw.trim() === "")
		return { ok: true, components: [] };
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return { ok: false, error: "Format komponen tidak valid." };
	}
	const parsed = AddonComponentsSchema.safeParse(json);
	if (!parsed.success)
		return { ok: false, error: "Komponen inventory tidak valid." };
	const byItem = new Map<string, AddonComponentInput>();
	for (const c of parsed.data) byItem.set(c.inventory_item_id, c);
	return { ok: true, components: Array.from(byItem.values()) };
}

function parseFormData(formData: FormData) {
	return AddonInputSchema.safeParse({
		name: formData.get("name"),
		category: formData.get("category"),
		unit: formData.get("unit"),
		price: formData.get("price"),
		requires_extra_crew: formData.get("requires_extra_crew") === "on",
		is_active: formData.get("is_active") === "on",
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

// Rows untuk addon_components, urut sesuai input (sort_order = index). Legacy
// `addons.inventory_item_id` di-set ke komponen pertama supaya reader lama
// (display rekap, PDF) tetap nunjuk item utama; planner sendiri baca tabel ini.
function componentRows(addonId: string, components: AddonComponentInput[]) {
	return components.map((c, i) => ({
		addon_id: addonId,
		inventory_item_id: c.inventory_item_id,
		qty_per_unit: c.qty_per_unit,
		sort_order: i,
	}));
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
	const comps = parseComponents(formData);
	if (!comps.ok) {
		return {
			errors: { addon_components: [comps.error] },
			values: snapshotValues(formData),
		};
	}
	const supabase = await createClient();
	const primaryItem = comps.components[0]?.inventory_item_id ?? null;
	const { data: addon, error } = await supabase
		.from("addons")
		.insert({ ...parsed.data, inventory_item_id: primaryItem })
		.select("id")
		.single();
	if (error || !addon) {
		return {
			errors: { _form: [error?.message ?? "Gagal membuat add-on"] },
			values: snapshotValues(formData),
		};
	}
	if (comps.components.length > 0) {
		const { error: cErr } = await supabase
			.from("addon_components")
			.insert(componentRows(addon.id, comps.components));
		if (cErr) {
			await supabase.from("addons").delete().eq("id", addon.id); // rollback
			return {
				errors: { addon_components: [cErr.message] },
				values: snapshotValues(formData),
			};
		}
	}
	revalidatePath("/operations/addons");
	redirect("/operations/addons");
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
	const comps = parseComponents(formData);
	if (!comps.ok) {
		return {
			errors: { addon_components: [comps.error] },
			values: snapshotValues(formData),
		};
	}
	const supabase = await createClient();
	const primaryItem = comps.components[0]?.inventory_item_id ?? null;
	const { error } = await supabase
		.from("addons")
		.update({ ...parsed.data, inventory_item_id: primaryItem })
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}
	// Replace komponen: hapus semua lalu insert ulang (idempotent, urutan fresh).
	const { error: delErr } = await supabase
		.from("addon_components")
		.delete()
		.eq("addon_id", id);
	if (delErr) {
		return {
			errors: { addon_components: [delErr.message] },
			values: snapshotValues(formData),
		};
	}
	if (comps.components.length > 0) {
		const { error: insErr } = await supabase
			.from("addon_components")
			.insert(componentRows(id, comps.components));
		if (insErr) {
			return {
				errors: { addon_components: [insErr.message] },
				values: snapshotValues(formData),
			};
		}
	}
	revalidatePath("/operations/addons");
	revalidatePath(`/operations/addons/${id}/edit`);
	redirect("/operations/addons");
}

export async function archiveAddon(id: string) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("addons")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/operations/addons");
}
