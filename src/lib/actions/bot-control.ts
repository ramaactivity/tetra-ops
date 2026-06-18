"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the WhatsApp bot control panel (Fase 2). Owner / super_admin
 * only — writes go through RLS too, this is defense-in-depth + friendly errors.
 * The bot reads bot_settings / bot_rules / bot_paused_contacts from Supabase to
 * override its local config.js (see WHATSAPP_BOT_LEADS_HANDOVER §5.3).
 */

async function requireOwner() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Tidak terautentikasi");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		throw new Error("Hanya owner yang boleh mengubah setting bot");
	}
	return me;
}

function revalidate() {
	revalidatePath("/leads/settings");
	revalidatePath("/leads");
}

// ── bot_settings ──────────────────────────────────────────────────────────

const SettingsSchema = z.object({
	business_start_hour: z.coerce.number().int().min(0).max(23),
	business_end_hour: z.coerce.number().int().min(0).max(24),
	timezone_offset: z.coerce.number().int().min(-12).max(14),
	cooldown_hours: z.coerce.number().int().min(0).max(720),
	pause_hours: z.coerce.number().int().min(0).max(720),
	salam_reply: z
		.string()
		.trim()
		.max(1000)
		.transform((v) => (v ? v : null)),
	after_hours_note: z
		.string()
		.max(1000)
		.transform((v) => (v.trim() ? v : null)),
	admin_notify_jid: z
		.string()
		.trim()
		.max(120)
		.transform((v) => (v ? v : null)),
});

export type BotSettingsFormState =
	| {
			ok?: boolean;
			errors?: Partial<
				Record<keyof z.input<typeof SettingsSchema> | "_form", string[]>
			>;
	  }
	| undefined;

export async function updateBotSettings(
	_prev: BotSettingsFormState,
	formData: FormData,
): Promise<BotSettingsFormState> {
	try {
		await requireOwner();
	} catch (e) {
		return { errors: { _form: [(e as Error).message] } };
	}

	const parsed = SettingsSchema.safeParse({
		business_start_hour: formData.get("business_start_hour"),
		business_end_hour: formData.get("business_end_hour"),
		timezone_offset: formData.get("timezone_offset"),
		cooldown_hours: formData.get("cooldown_hours"),
		pause_hours: formData.get("pause_hours"),
		salam_reply: formData.get("salam_reply") ?? "",
		after_hours_note: formData.get("after_hours_note") ?? "",
		admin_notify_jid: formData.get("admin_notify_jid") ?? "",
	});

	if (!parsed.success) {
		return { errors: parsed.error.flatten().fieldErrors };
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("bot_settings")
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq("id", 1);

	if (error) return { errors: { _form: [error.message] } };

	revalidate();
	return { ok: true };
}

/** Master on/off switch — instant toggle (no form round-trip). */
export async function setBotEnabled(enabled: boolean): Promise<void> {
	await requireOwner();
	const supabase = await createClient();
	const { error } = await supabase
		.from("bot_settings")
		.update({ enabled, updated_at: new Date().toISOString() })
		.eq("id", 1);
	if (error) throw new Error(error.message);
	revalidate();
}

// ── bot_rules ───────────────────────────────────────────────────────────────

const RuleSchema = z.object({
	name: z.string().trim().min(1, "Wajib").max(60),
	priority: z.coerce.number().int().min(0).max(1000),
	reply: z.string().trim().min(1, "Balasan wajib diisi").max(4000),
	file_path: z
		.string()
		.trim()
		.max(300)
		.transform((v) => (v ? v : null)),
});

export type BotRuleFormState =
	| {
			ok?: boolean;
			errors?: Partial<
				Record<
					keyof z.input<typeof RuleSchema> | "keywords" | "_form",
					string[]
				>
			>;
	  }
	| undefined;

/** Split a comma/newline-separated keyword string into a clean lowercased[]. */
function parseKeywords(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(/[\n,]/)
				.map((k) => k.trim().toLowerCase())
				.filter(Boolean),
		),
	];
}

export async function updateBotRule(
	id: string,
	_prev: BotRuleFormState,
	formData: FormData,
): Promise<BotRuleFormState> {
	try {
		await requireOwner();
	} catch (e) {
		return { errors: { _form: [(e as Error).message] } };
	}

	const parsed = RuleSchema.safeParse({
		name: formData.get("name"),
		priority: formData.get("priority"),
		reply: formData.get("reply"),
		file_path: formData.get("file_path") ?? "",
	});
	if (!parsed.success) {
		return { errors: parsed.error.flatten().fieldErrors };
	}

	const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
	if (keywords.length === 0) {
		return { errors: { keywords: ["Minimal 1 keyword"] } };
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("bot_rules")
		.update({
			...parsed.data,
			keywords,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);

	if (error) return { errors: { _form: [error.message] } };

	revalidate();
	return { ok: true };
}

export async function setBotRuleActive(
	id: string,
	isActive: boolean,
): Promise<void> {
	await requireOwner();
	const supabase = await createClient();
	const { error } = await supabase
		.from("bot_rules")
		.update({ is_active: isActive, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw new Error(error.message);
	revalidate();
}

// ── bot_paused_contacts ──────────────────────────────────────────────────────

/** Pause the bot for one contact for `hours` (default = settings.pause_hours). */
export async function pauseContact(
	waJid: string,
	hours?: number,
): Promise<void> {
	await requireOwner();
	const supabase = await createClient();

	let h: number;
	if (hours != null) {
		h = hours;
	} else {
		const { data } = await supabase
			.from("bot_settings")
			.select("pause_hours")
			.eq("id", 1)
			.single();
		h = data?.pause_hours ?? 24;
	}

	const pausedUntil = new Date(Date.now() + h * 3_600_000).toISOString();
	const { error } = await supabase.from("bot_paused_contacts").upsert(
		{
			wa_jid: waJid,
			paused_until: pausedUntil,
			source: "dashboard",
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "wa_jid" },
	);
	if (error) throw new Error(error.message);
	revalidate();
}

export async function unpauseContact(waJid: string): Promise<void> {
	await requireOwner();
	const supabase = await createClient();
	const { error } = await supabase
		.from("bot_paused_contacts")
		.delete()
		.eq("wa_jid", waJid);
	if (error) throw new Error(error.message);
	revalidate();
}
