/**
 * Shared types + label maps for the WhatsApp Bot Leads (CRM) module.
 *
 * Plain module (no "use server") so both client components and server
 * routes/pages can import the constants. Data contract mirrors the
 * `whatsapp_bot_leads` table — see WHATSAPP_BOT_LEADS_HANDOVER + migration
 * supabase/migrations/20260618_whatsapp_bot_leads.sql. Do NOT rename keys
 * without agreeing with the bot maintainer.
 */

export type LeadStatus = "new" | "contacted" | "converted" | "ignored";

export type LeadRow = {
	id: string;
	wa_jid: string;
	phone: string;
	name: string | null;
	topic: string;
	message: string | null;
	is_after_hours: boolean;
	status: string;
	received_at: string;
	created_at: string;
};

/** Topics come from the bot's rule names — known ones get a friendly label. */
export const TOPIC_LABELS: Record<string, string> = {
	pricelist: "Pricelist",
	dp: "DP",
	lokasi: "Lokasi",
	booking: "Booking",
};

export function topicLabel(topic: string): string {
	return TOPIC_LABELS[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1);
}

export const STATUS_LABELS: Record<string, string> = {
	new: "Baru",
	contacted: "Dihubungi",
	converted: "Closing",
	ignored: "Diabaikan",
};

export function statusLabel(status: string): string {
	return STATUS_LABELS[status] ?? status;
}

/** Maps a lead status to a <Badge variant>. */
export const STATUS_BADGE: Record<
	string,
	"warning" | "info" | "success" | "neutral"
> = {
	new: "warning",
	contacted: "info",
	converted: "success",
	ignored: "neutral",
};

export const STATUS_OPTIONS: ReadonlyArray<{
	value: LeadStatus;
	label: string;
}> = [
	{ value: "new", label: "Baru" },
	{ value: "contacted", label: "Dihubungi" },
	{ value: "converted", label: "Closing" },
	{ value: "ignored", label: "Diabaikan" },
];

export const PERIOD_OPTIONS = [
	{ value: "all", label: "Semua waktu" },
	{ value: "today", label: "Hari ini" },
	{ value: "7d", label: "7 hari" },
	{ value: "30d", label: "30 hari" },
] as const;

export type LeadPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

/** Strip + normalize a phone for `wa.me/` links (digits only, leading 62). */
export function waMePhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.startsWith("0")) return `62${digits.slice(1)}`;
	return digits;
}

/** Lower-bound ISO timestamp for a period filter, or null for "all". */
export function periodStartISO(period: string, now: Date): string | null {
	if (period === "today") {
		const d = new Date(now);
		d.setHours(0, 0, 0, 0);
		return d.toISOString();
	}
	if (period === "7d") {
		return new Date(now.getTime() - 7 * 86_400_000).toISOString();
	}
	if (period === "30d") {
		return new Date(now.getTime() - 30 * 86_400_000).toISOString();
	}
	return null;
}
