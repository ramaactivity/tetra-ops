"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for lead segmentation (B2B / Rekanan). Owner / super_admin only
 * — writes also pass RLS, this is defense-in-depth + friendly errors.
 *
 * The bot auto-detects a segment (segment_source='auto'); the admin's choice
 * here ALWAYS wins (segment_source='manual'). The bot reads manual overrides
 * every ~60s and never overwrites them (see WHATSAPP_BOT_SEGMENTASI_HANDOVER §1
 * + the DB guard trigger in 20260622_whatsapp_bot_contacts.sql).
 */

async function requireOwner() {
	const me = await getCurrentUser();
	if (!me) throw new Error("Tidak terautentikasi");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		throw new Error("Hanya owner yang boleh mengubah segmen kontak");
	}
	return me;
}

function revalidate() {
	revalidatePath("/leads");
	revalidatePath("/leads/rekanan");
}

const SEGMENTS = [
	"private",
	"corporate",
	"instansi",
	"eo_wo",
	"venue",
] as const;
const STATUSES = ["prospek", "aktif", "rekanan"] as const;

const SetSegmentSchema = z.object({
	waJid: z.string().trim().min(1),
	segment: z.enum(SEGMENTS),
	phone: z.string().trim().nullish(),
	name: z.string().trim().nullish(),
});

/**
 * Set a contact's segment as the admin's manual decision.
 * Upserts on wa_jid so it works whether or not the bot has seen the contact yet.
 * Always stamps segment_source='manual' — that's what makes the bot honour it.
 */
export async function setContactSegment(input: {
	waJid: string;
	segment: (typeof SEGMENTS)[number];
	phone?: string | null;
	name?: string | null;
}): Promise<void> {
	await requireOwner();
	const parsed = SetSegmentSchema.safeParse(input);
	if (!parsed.success) throw new Error("Input segmen tidak valid");

	const { waJid, segment, phone, name } = parsed.data;
	const supabase = await createClient();
	const nowISO = new Date().toISOString();

	const { error } = await supabase.from("whatsapp_bot_contacts").upsert(
		{
			wa_jid: waJid,
			segment,
			segment_source: "manual",
			...(phone ? { phone } : {}),
			...(name ? { name } : {}),
			updated_at: nowISO,
		},
		{ onConflict: "wa_jid" },
	);
	if (error) throw new Error(error.message);
	revalidate();
}

const SetStatusSchema = z.object({
	waJid: z.string().trim().min(1),
	status: z.enum(STATUSES),
});

/** Set a contact's relationship status (prospek → aktif → rekanan). */
export async function setContactStatus(input: {
	waJid: string;
	status: (typeof STATUSES)[number];
}): Promise<void> {
	await requireOwner();
	const parsed = SetStatusSchema.safeParse(input);
	if (!parsed.success) throw new Error("Input status tidak valid");

	const { waJid, status } = parsed.data;
	const supabase = await createClient();
	const { error } = await supabase
		.from("whatsapp_bot_contacts")
		.update({ status, updated_at: new Date().toISOString() })
		.eq("wa_jid", waJid);
	if (error) throw new Error(error.message);
	revalidate();
}
