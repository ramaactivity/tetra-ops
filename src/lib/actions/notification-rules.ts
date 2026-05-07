"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const SEVERITIES = ["alert", "warning", "info", "success"] as const;
const ROLES = ["super_admin", "owner", "crew"] as const;

const RuleInputSchema = z.object({
	name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	description: z
		.string()
		.trim()
		.max(300)
		.optional()
		.transform((v) => (v ? v : null)),
	severity: z.enum(SEVERITIES, "Pilih severity"),
	recipient_roles: z.array(z.enum(ROLES)).min(1, "Pilih minimal 1 role"),
	send_push: z.coerce.boolean(),
	is_enabled: z.coerce.boolean(),
});

export type RuleInput = z.infer<typeof RuleInputSchema>;
type RuleErrors = Partial<Record<keyof RuleInput | "_form", string[]>>;
export type RuleFormState =
	| { errors?: RuleErrors; values?: Record<string, string> }
	| undefined;

async function requireOwnerLevel() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return me;
}

export async function updateNotificationRule(
	id: string,
	_prev: RuleFormState,
	formData: FormData,
): Promise<RuleFormState> {
	await requireOwnerLevel();

	const recipientRoles = formData.getAll("recipient_roles").map(String);

	const parsed = RuleInputSchema.safeParse({
		name: formData.get("name"),
		description: formData.get("description"),
		severity: formData.get("severity"),
		recipient_roles: recipientRoles,
		send_push: formData.get("send_push") === "on",
		is_enabled: formData.get("is_enabled") === "on",
	});

	if (!parsed.success) {
		const out: Record<string, string> = {
			name: String(formData.get("name") ?? ""),
			description: String(formData.get("description") ?? ""),
			severity: String(formData.get("severity") ?? ""),
			send_push: formData.get("send_push") === "on" ? "on" : "",
			is_enabled: formData.get("is_enabled") === "on" ? "on" : "",
			recipient_roles: recipientRoles.join(","),
		};
		return {
			errors: parsed.error.flatten().fieldErrors as RuleErrors,
			values: out,
		};
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("notification_rules")
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) {
		return {
			errors: { _form: [error.message] },
			values: {
				name: parsed.data.name,
				description: parsed.data.description ?? "",
				severity: parsed.data.severity,
				send_push: parsed.data.send_push ? "on" : "",
				is_enabled: parsed.data.is_enabled ? "on" : "",
				recipient_roles: parsed.data.recipient_roles.join(","),
			},
		};
	}

	revalidatePath("/settings/notification-rules");
	revalidatePath(`/settings/notification-rules/${id}/edit`);
	redirect("/settings/notification-rules");
}

export async function toggleNotificationRuleEnabled(
	id: string,
	nextEnabled: boolean,
) {
	await requireOwnerLevel();
	const supabase = await createClient();
	const { error } = await supabase
		.from("notification_rules")
		.update({
			is_enabled: nextEnabled,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidatePath("/settings/notification-rules");
}
