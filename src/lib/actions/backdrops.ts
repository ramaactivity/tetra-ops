"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const TYPES = ["basic_included", "rental_owned", "vendor_decor"] as const;

const BackdropInputSchema = z
	.object({
		code: z
			.string()
			.trim()
			.min(2, "Minimal 2 karakter")
			.max(40, "Maksimal 40 karakter")
			.regex(/^[A-Z0-9_-]+$/, "Pakai huruf kapital, angka, hyphen, underscore"),
		name: z.string().trim().min(2, "Minimal 2 karakter").max(80),
		type: z.enum(TYPES, "Pilih tipe"),
		rental_price: z.coerce.number().int().nonnegative().default(0),
		display_order: z.coerce.number().int().min(0).default(0),
		description: z
			.string()
			.trim()
			.max(300)
			.optional()
			.transform((v) => (v ? v : null)),
		is_active: z.coerce.boolean(),
	})
	.refine((d) => d.type === "rental_owned" || d.rental_price === 0, {
		message: "Hanya rental_owned yang boleh punya rental_price > 0",
		path: ["rental_price"],
	});

export type BackdropInput = z.infer<typeof BackdropInputSchema>;
type BackdropErrors = Partial<Record<keyof BackdropInput | "_form", string[]>>;
export type BackdropFormState =
	| { errors?: BackdropErrors; values?: Record<string, string> }
	| undefined;

function parseFormData(formData: FormData) {
	return BackdropInputSchema.safeParse({
		code: formData.get("code"),
		name: formData.get("name"),
		type: formData.get("type"),
		rental_price: formData.get("rental_price"),
		display_order: formData.get("display_order"),
		description: formData.get("description"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshotValues(formData: FormData): Record<string, string> {
	const keys = [
		"code",
		"name",
		"type",
		"rental_price",
		"display_order",
		"description",
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

export async function createBackdrop(
	_prev: BackdropFormState,
	formData: FormData,
): Promise<BackdropFormState> {
	await requireOwnerLevel();
	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as BackdropErrors,
			values: snapshotValues(formData),
		};
	}
	const supabase = await createClient();
	const { error } = await supabase.from("backdrops").insert(parsed.data);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}
	revalidatePath("/settings/backdrops");
	revalidatePath("/operations/new");
	redirect("/settings/backdrops");
}

export async function updateBackdrop(
	id: string,
	_prev: BackdropFormState,
	formData: FormData,
): Promise<BackdropFormState> {
	await requireOwnerLevel();
	const parsed = parseFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as BackdropErrors,
			values: snapshotValues(formData),
		};
	}
	const supabase = await createClient();
	const { error } = await supabase
		.from("backdrops")
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotValues(formData),
		};
	}
	revalidatePath("/settings/backdrops");
	revalidatePath(`/settings/backdrops/${id}/edit`);
	revalidatePath("/operations/new");
	redirect("/settings/backdrops");
}

export async function toggleBackdropActive(id: string, nextActive: boolean) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("backdrops")
		.update({ is_active: nextActive, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/settings/backdrops");
	revalidatePath("/operations/new");
}
