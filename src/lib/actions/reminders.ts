"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const LogReminderSchema = z.object({
	event_id: z.uuid(),
	template_code: z.string().trim().min(1).max(80),
	recipient_phone: z.string().trim().min(1).max(40),
	recipient_label: z.enum(["client", "pic", "booker"]),
});

export type LogReminderResult = { ok?: boolean; error?: string; id?: string };

export async function logReminderSent(input: {
	event_id: string;
	template_code: string;
	recipient_phone: string;
	recipient_label: "client" | "pic" | "booker";
}): Promise<LogReminderResult> {
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Unauthorized" };
		if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
			return { error: "Hanya owner / super_admin" };
		}

		const parsed = LogReminderSchema.safeParse(input);
		if (!parsed.success) {
			return {
				error: parsed.error.issues
					.map((iss) =>
						iss.path.length
							? `${iss.path.join(".")}: ${iss.message}`
							: iss.message,
					)
					.join("; "),
			};
		}

		const supabase = await createClient();
		const { data, error } = await supabase
			.from("event_reminders_log")
			.insert({
				event_id: parsed.data.event_id,
				template_code: parsed.data.template_code,
				recipient_phone: parsed.data.recipient_phone,
				recipient_label: parsed.data.recipient_label,
				sent_by: me.profile.id,
			})
			.select("id")
			.single();

		if (error) return { error: error.message };

		revalidatePath("/reminders");
		return { ok: true, id: data?.id as string };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

export async function logRemindersBatch(
	items: Array<{
		event_id: string;
		template_code: string;
		recipient_phone: string;
		recipient_label: "client" | "pic" | "booker";
	}>,
): Promise<{ ok?: boolean; error?: string; count?: number }> {
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Unauthorized" };
		if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
			return { error: "Hanya owner / super_admin" };
		}

		const ItemsSchema = z.array(LogReminderSchema).min(1).max(200);
		const parsed = ItemsSchema.safeParse(items);
		if (!parsed.success) {
			return { error: "Invalid batch payload" };
		}

		const supabase = await createClient();
		const rows = parsed.data.map((it) => ({
			event_id: it.event_id,
			template_code: it.template_code,
			recipient_phone: it.recipient_phone,
			recipient_label: it.recipient_label,
			sent_by: me.profile.id,
		}));

		const { error, count } = await supabase
			.from("event_reminders_log")
			.insert(rows, { count: "exact" });

		if (error) return { error: error.message };

		revalidatePath("/reminders");
		return { ok: true, count: count ?? rows.length };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
