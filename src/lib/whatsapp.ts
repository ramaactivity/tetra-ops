import { formatDateID, formatRupiah } from "@/lib/format";

/**
 * Normalize an Indonesian phone number into wa.me format (digits only, with country code).
 * - "081234567890" → "6281234567890"
 * - "+6281234567890" → "6281234567890"
 * - "62 812 3456 7890" → "6281234567890"
 */
export function toWaPhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.startsWith("62")) return digits;
	if (digits.startsWith("0")) return `62${digits.slice(1)}`;
	return digits;
}

/**
 * Replace `{key}` placeholders in `template` with values from `vars`.
 * Missing keys keep their `{placeholder}` form so the user knows to edit them.
 */
export function substituteVariables(
	template: string,
	vars: Record<string, string | undefined | null>,
): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => {
		const v = vars[key];
		return v !== undefined && v !== null && v !== "" ? String(v) : `{${key}}`;
	});
}

export function whatsappUrl(phone: string, message: string): string {
	return `https://wa.me/${toWaPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export type EventForWA = {
	project_id: string;
	client_name: string;
	client_wa: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	venue_name: string;
	due_date?: string | null;
	total_paid?: number | null;
	remaining_balance?: number | null;
	package_name?: string | null;
	duration_hours?: number | null;
	crew_lead?: string | null;
	crew_asisten?: string | null;
	drive_link?: string | null;
};

const trimTime = (t: string | null | undefined) =>
	t ? t.slice(0, 5) : "—";

/**
 * Build the variables map a WhatsApp template expects from event row data.
 * Matches the keys used by the seeded templates in
 * docs/05_DATABASE_SCHEMA.sql §19.8.
 */
export function buildEventVars(
	event: EventForWA,
	overrides: Partial<Record<string, string>> = {},
): Record<string, string> {
	return {
		project_id: event.project_id,
		client_name: event.client_name,
		event_date: formatDateID(event.event_date),
		setup_time: trimTime(event.setup_time),
		start_time: trimTime(event.start_time),
		venue_name: event.venue_name,
		due_date: event.due_date ? formatDateID(event.due_date) : "—",
		dp_amount: formatRupiah(event.total_paid ?? 0),
		remaining_balance: formatRupiah(event.remaining_balance ?? 0),
		package_name: event.package_name ?? "—",
		duration_hours: String(event.duration_hours ?? "—"),
		crew_lead: event.crew_lead ?? "—",
		crew_asisten: event.crew_asisten ?? "—",
		drive_link: event.drive_link ?? "—",
		reminder_count: "1",
		...overrides,
	};
}
