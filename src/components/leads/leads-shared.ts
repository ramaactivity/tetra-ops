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

/** Dot color per status — for the filter pills (mirrors the Asset & Design
 *  status pills: small colored dot + label + count). */
export const STATUS_DOT: Record<string, string> = {
	new: "bg-amber-500",
	contacted: "bg-sky-500",
	converted: "bg-emerald-500",
	ignored: "bg-muted-foreground/50",
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

// ── Segmentation (B2B / Rekanan) — mirrors whatsapp_bot_contacts ──────────────
// Contract: do NOT rename values without agreeing with the bot maintainer.
// See WHATSAPP_BOT_SEGMENTASI_HANDOVER §2 +
// supabase/migrations/20260622_whatsapp_bot_contacts.sql.

export type ContactSegment =
	| "private"
	| "corporate"
	| "instansi"
	| "eo_wo"
	| "venue";

export type ContactSegmentSource = "auto" | "manual";

export type ContactStatus = "prospek" | "aktif" | "rekanan";

export type ContactRow = {
	id: string;
	wa_jid: string;
	phone: string | null;
	name: string | null;
	segment: string;
	segment_source: string;
	org_name: string | null;
	status: string;
	notes: string | null;
	first_seen_at: string;
	last_seen_at: string;
	updated_at: string;
};

export const SEGMENT_LABELS: Record<string, string> = {
	private: "Private",
	corporate: "Corporate",
	instansi: "Instansi/Pemerintah",
	eo_wo: "EO/WO",
	venue: "Venue",
};

/** Short label for tight spaces (table badges, chips). */
export const SEGMENT_LABELS_SHORT: Record<string, string> = {
	private: "Private",
	corporate: "Corporate",
	instansi: "Instansi",
	eo_wo: "EO/WO",
	venue: "Venue",
};

export function segmentLabel(segment: string, short = false): string {
	const map = short ? SEGMENT_LABELS_SHORT : SEGMENT_LABELS;
	return map[segment] ?? segment;
}

/** B2B segments (everything except private) get colored badges; private = quiet. */
export const SEGMENT_BADGE: Record<
	string,
	"neutral" | "info" | "warning" | "success" | "danger"
> = {
	private: "neutral",
	corporate: "info",
	instansi: "warning",
	eo_wo: "success",
	venue: "danger",
};

/** Dot color per segment — for filter pills. */
export const SEGMENT_DOT: Record<string, string> = {
	private: "bg-muted-foreground/50",
	corporate: "bg-sky-500",
	instansi: "bg-amber-500",
	eo_wo: "bg-emerald-500",
	venue: "bg-rose-500",
};

export const SEGMENT_OPTIONS: ReadonlyArray<{
	value: ContactSegment;
	label: string;
}> = [
	{ value: "private", label: "Private" },
	{ value: "corporate", label: "Corporate" },
	{ value: "instansi", label: "Instansi/Pemerintah" },
	{ value: "eo_wo", label: "EO/WO" },
	{ value: "venue", label: "Venue" },
];

export function isB2B(segment: string): boolean {
	return segment !== "private";
}

export const STATUS_REL_LABELS: Record<string, string> = {
	prospek: "Prospek",
	aktif: "Aktif",
	rekanan: "Rekanan",
};

export function relStatusLabel(status: string): string {
	return STATUS_REL_LABELS[status] ?? status;
}

export const STATUS_REL_BADGE: Record<string, "warning" | "info" | "success"> =
	{
		prospek: "warning",
		aktif: "info",
		rekanan: "success",
	};

export const STATUS_REL_OPTIONS: ReadonlyArray<{
	value: ContactStatus;
	label: string;
}> = [
	{ value: "prospek", label: "Prospek" },
	{ value: "aktif", label: "Aktif" },
	{ value: "rekanan", label: "Rekanan" },
];

export const PERIOD_OPTIONS = [
	{ value: "all", label: "Semua waktu" },
	{ value: "today", label: "Hari ini" },
	{ value: "7d", label: "7 hari" },
	{ value: "30d", label: "30 hari" },
] as const;

export type LeadPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

/**
 * Is this a real Indonesian WhatsApp phone number (not a LID)?
 * WA numbers via Indonesia always start with `62` (~10–15 digits total).
 * A WhatsApp LID ("Linked ID" privacy identity) is a 15–16 digit value that
 * is NOT a phone number and can't be reversed into one — those must never be
 * rendered as a phone. See WHATSAPP_BOT_LID_DISPLAY_NOTE.
 */
export function isRealPhone(p?: string | null): boolean {
	if (!p) return false;
	const d = String(p).replace(/\D/g, "");
	return /^62\d{8,13}$/.test(d);
}

/**
 * Resolve the phone to DISPLAY (and link via wa.me), or null when only a LID
 * is known. Priority: a resolved `phone` → a `wa_jid` that is already a PN
 * (`…@s.whatsapp.net`) → null (LID, no real number). Returns clean `62…` digits.
 * Use `wa_jid` as the identity key for dedup/segment/pause — NOT for display.
 */
export function resolveDisplayPhone(row: {
	phone?: string | null;
	wa_jid?: string | null;
}): string | null {
	if (isRealPhone(row.phone)) return String(row.phone).replace(/\D/g, "");
	if (row.wa_jid?.endsWith("@s.whatsapp.net")) {
		const d = row.wa_jid.split("@")[0].replace(/\D/g, "");
		if (isRealPhone(d)) return d;
	}
	return null;
}

/** Strip + normalize a phone for `wa.me/` links (digits only, leading 62). */
export function waMePhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.startsWith("0")) return `62${digits.slice(1)}`;
	return digits;
}

/**
 * Human-readable phone for display only (DB keeps the raw value).
 * Normalizes to the local Indonesian `0`-prefix, then groups every 4 digits
 * with a hyphen: `6289611384767` → `0896-1138-4767`. Machines read the raw
 * string; humans read the grouped one.
 */
export function formatPhoneHuman(phone: string): string {
	let digits = phone.replace(/\D/g, "");
	if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
	else if (!digits.startsWith("0")) digits = `0${digits}`;
	return digits.replace(/(\d{4})(?=\d)/g, "$1-");
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
