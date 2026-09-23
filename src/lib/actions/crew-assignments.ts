"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { tgEscape } from "@/lib/telegram/client";
import { notifyTelegramCrewChanged } from "@/lib/telegram/notify";

const ROLES = ["lead", "asisten", "crew_c"] as const;

const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const AssignSchema = z.object({
	event_id: z.uuid(),
	user_id: z.uuid(),
	role_in_event: z.enum(ROLES),
});

const UpdateSchema = z.object({
	id: z.uuid(),
	role_in_event: z.enum(ROLES),
	fee_amount: z.coerce.number().int().nonnegative(),
	bonus_amount: z.coerce.number().int().nonnegative().default(0),
	fee_override_reason: z
		.string()
		.trim()
		.max(255)
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : null)),
});

async function requireOwnerLevel() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");
	if (user.profile.role !== "super_admin" && user.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return user;
}

async function resolveDefaultFee(
	supabase: Awaited<ReturnType<typeof createClient>>,
	userId: string,
): Promise<number> {
	const { data: user } = await supabase
		.from("users")
		.select("tier, default_fee_override")
		.eq("id", userId)
		.maybeSingle();

	if (user?.default_fee_override) return user.default_fee_override;
	if (!user?.tier) return 0;

	const key = user.tier === "senior" ? "crew_fee_senior" : "crew_fee_junior";
	const { data: cfg } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", key)
		.maybeSingle();
	if (!cfg?.value) return 0;
	const raw = cfg.value;
	const num = typeof raw === "string" ? Number(raw) : Number(raw);
	return Number.isFinite(num) ? num : 0;
}

export async function assignCrew(
	projectId: string,
	formData: FormData,
): Promise<{ error?: string }> {
	const me = await requireOwnerLevel();
	const supabase = await createClient();
	const res = await assignCrewCore(supabase, me.authId, {
		event_id: formData.get("event_id"),
		user_id: formData.get("user_id"),
		role_in_event: formData.get("role_in_event"),
	});
	if (!res.error) {
		revalidatePath(`/operations/${projectId}`);
		revalidatePath(`/operations/${projectId}/crew`);
	}
	return res;
}

/**
 * Inti assign crew yang tidak bergantung pada cookie login — dipakai form di
 * atas dan agent MCP. Fee default + notifikasi Telegram ikut di sini supaya
 * kedua jalur berperilaku sama.
 */
export async function assignCrewCore(
	supabase: Awaited<ReturnType<typeof createClient>>,
	actorId: string,
	raw: Record<string, unknown>,
): Promise<{ error?: string }> {
	const parsed = AssignSchema.safeParse(raw);
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const fee = await resolveDefaultFee(supabase, parsed.data.user_id);

	const { error } = await supabase.from("crew_assignments").insert({
		event_id: parsed.data.event_id,
		user_id: parsed.data.user_id,
		role_in_event: parsed.data.role_in_event,
		fee_amount: fee,
		assigned_by: actorId,
	});

	if (error) return { error: error.message };

	// Best-effort: kabari grup Telegram owner susunan crew berubah.
	const { data: u } = await supabase
		.from("users")
		.select("full_name, nickname")
		.eq("id", parsed.data.user_id)
		.maybeSingle();
	const nama = (u?.nickname as string | null)?.trim() || u?.full_name || "Crew";
	await notifyTelegramCrewChanged(
		parsed.data.event_id,
		`➕ ${tgEscape(nama)} ditugaskan sebagai ${ROLE_LABEL[parsed.data.role_in_event]}`,
	);
	return {};
}

export async function unassignCrew(
	projectId: string,
	id: string,
): Promise<{ error?: string }> {
	await requireOwnerLevel();

	const supabase = await createClient();

	// Snapshot dulu sebelum delete — dipakai untuk notifikasi Telegram.
	// Sengaja TANPA embed users (crew_assignments punya 2 FK ke users →
	// embed tanpa hint kena PGRST201); nama di-fetch terpisah di bawah.
	const { data: row } = await supabase
		.from("crew_assignments")
		.select("event_id, user_id")
		.eq("id", id)
		.maybeSingle();

	const { error } = await supabase
		.from("crew_assignments")
		.delete()
		.eq("id", id);
	if (error) return { error: error.message };

	if (row) {
		const { data: u } = await supabase
			.from("users")
			.select("full_name, nickname")
			.eq("id", row.user_id)
			.maybeSingle();
		const nama =
			(u?.nickname as string | null)?.trim() || u?.full_name || "Crew";
		await notifyTelegramCrewChanged(
			row.event_id,
			`➖ ${tgEscape(nama)} dilepas dari event`,
		);
	}

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/crew`);
	return {};
}

export async function updateCrewAssignment(
	projectId: string,
	formData: FormData,
): Promise<{ error?: string }> {
	await requireOwnerLevel();

	const parsed = UpdateSchema.safeParse({
		id: formData.get("id"),
		role_in_event: formData.get("role_in_event"),
		fee_amount: formData.get("fee_amount"),
		bonus_amount: formData.get("bonus_amount"),
		fee_override_reason: formData.get("fee_override_reason"),
	});
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const supabase = await createClient();

	// Peran lama — untuk notifikasi kalau peran berubah (fee tidak diumumkan
	// supaya grup tidak berisik; fee toh sudah owner-only di webapp).
	const { data: prev } = await supabase
		.from("crew_assignments")
		.select("event_id, user_id, role_in_event")
		.eq("id", parsed.data.id)
		.maybeSingle();

	const { error } = await supabase
		.from("crew_assignments")
		.update({
			role_in_event: parsed.data.role_in_event,
			fee_amount: parsed.data.fee_amount,
			bonus_amount: parsed.data.bonus_amount,
			fee_override_reason: parsed.data.fee_override_reason,
		})
		.eq("id", parsed.data.id);

	if (error) return { error: error.message };

	if (prev && prev.role_in_event !== parsed.data.role_in_event) {
		const { data: u } = await supabase
			.from("users")
			.select("full_name, nickname")
			.eq("id", prev.user_id)
			.maybeSingle();
		const nama =
			(u?.nickname as string | null)?.trim() || u?.full_name || "Crew";
		const oldLabel =
			ROLE_LABEL[prev.role_in_event as (typeof ROLES)[number]] ??
			prev.role_in_event;
		await notifyTelegramCrewChanged(
			prev.event_id,
			`🔁 ${tgEscape(nama)}: ${oldLabel} → <b>${ROLE_LABEL[parsed.data.role_in_event]}</b>`,
		);
	}

	revalidatePath(`/operations/${projectId}`);
	revalidatePath(`/operations/${projectId}/crew`);
	return {};
}
