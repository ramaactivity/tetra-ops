"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const TemplateInputSchema = z.object({
	code: z
		.string()
		.trim()
		.min(2, "Minimal 2 karakter")
		.max(60, "Maksimal 60 karakter")
		.regex(/^[a-z0-9_]+$/, "Pakai huruf kecil, angka, dan underscore"),
	name: z.string().trim().min(2, "Minimal 2 karakter").max(100),
	description: z
		.string()
		.trim()
		.max(300)
		.optional()
		.transform((v) => (v ? v : null)),
	template_body: z
		.string()
		.trim()
		.min(10, "Minimal 10 karakter")
		.max(2000, "Maksimal 2000 karakter"),
	available_variables: z
		.string()
		.trim()
		.optional()
		.transform((v) =>
			v
				? v
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
		),
	display_order: z.coerce.number().int().min(0).default(0),
	is_active: z.coerce.boolean(),
});

export type TemplateInput = z.infer<typeof TemplateInputSchema>;
type TemplateErrors = Partial<Record<keyof TemplateInput | "_form", string[]>>;
export type TemplateFormState =
	| { errors?: TemplateErrors; values?: Record<string, string> }
	| undefined;

function parseTemplateFormData(formData: FormData) {
	return TemplateInputSchema.safeParse({
		code: formData.get("code"),
		name: formData.get("name"),
		description: formData.get("description"),
		template_body: formData.get("template_body"),
		available_variables: formData.get("available_variables"),
		display_order: formData.get("display_order"),
		is_active: formData.get("is_active") === "on",
	});
}

function snapshotTemplateValues(formData: FormData): Record<string, string> {
	const keys = [
		"code",
		"name",
		"description",
		"template_body",
		"available_variables",
		"display_order",
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

export async function createWhatsAppTemplate(
	_prev: TemplateFormState,
	formData: FormData,
): Promise<TemplateFormState> {
	await requireOwnerLevel();

	const parsed = parseTemplateFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as TemplateErrors,
			values: snapshotTemplateValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("whatsapp_templates")
		.insert(parsed.data);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotTemplateValues(formData),
		};
	}

	revalidatePath("/settings/whatsapp-templates");
	redirect("/settings/whatsapp-templates");
}

export async function updateWhatsAppTemplate(
	id: string,
	_prev: TemplateFormState,
	formData: FormData,
): Promise<TemplateFormState> {
	await requireOwnerLevel();

	const parsed = parseTemplateFormData(formData);
	if (!parsed.success) {
		return {
			errors: parsed.error.flatten().fieldErrors as TemplateErrors,
			values: snapshotTemplateValues(formData),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("whatsapp_templates")
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: snapshotTemplateValues(formData),
		};
	}

	revalidatePath("/settings/whatsapp-templates");
	revalidatePath(`/settings/whatsapp-templates/${id}/edit`);
	redirect("/settings/whatsapp-templates");
}

export async function toggleWhatsAppTemplateActive(
	id: string,
	nextActive: boolean,
) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("whatsapp_templates")
		.update({ is_active: nextActive, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/settings/whatsapp-templates");
}
