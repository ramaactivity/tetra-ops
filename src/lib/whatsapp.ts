import { formatDateID, formatRupiah } from "@/lib/format";
import {
	formatScheduleInline,
	hasBreak,
	parseSegments,
} from "@/lib/schedule/segments";

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

/**
 * Build a crew-side reminder message tied to an event assignment.
 * Used by the per-crew "Send WA" button on /operations/[projectId]/crew.
 */
export type CrewReminderInput = {
	crew_name: string;
	/** Full team roster for this event (names only, including the recipient). */
	team: string[];
	event: EventForWA;
};

const BACKDROP_LABELS: Record<string, string> = {
	merah: "Merah",
	gold: "Gold",
	putih: "Putih",
	silver: "Silver",
	custom: "Custom (lihat brief)",
};

const DATE_WITH_DAY = new Intl.DateTimeFormat("id-ID", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
});

export function buildCrewReminderMessage(input: CrewReminderInput): string {
	const ev = input.event;
	const time = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
	const date = DATE_WITH_DAY.format(new Date(ev.event_date));

	const setupT = time(ev.setup_time);
	const startT = time(ev.start_time);
	const endT = time(ev.end_time);
	const segments = parseSegments(ev.session_segments);

	const sections: string[] = [];

	// Greeting
	sections.push(`Halo *${input.crew_name}*! 👋`);
	sections.push("Berikut detail assignment kamu di event berikutnya:");

	// Event identity (project_id is internal — keep it owner-side only)
	sections.push([`🎬 *EVENT*`, ev.client_name].join("\n"));

	// Vendor (show whenever vendor info is set on the event)
	if (ev.vendor_name) {
		const vendorLines = [`🏷 *VENDOR*`, ev.vendor_name];
		if (ev.vendor_pic_name) {
			vendorLines.push(
				ev.vendor_contact
					? `${ev.vendor_pic_name} · ${ev.vendor_contact}`
					: ev.vendor_pic_name,
			);
		} else if (ev.vendor_contact) {
			vendorLines.push(ev.vendor_contact);
		}
		sections.push(vendorLines.join("\n"));
	}

	// Team roster (all assigned crew, including recipient)
	if (input.team.length > 0) {
		sections.push(
			[`🤝 *TEAM YANG INCHARGE*`, ...input.team.map((n) => `- ${n}`)].join(
				"\n",
			),
		);
	}

	// Schedule
	const scheduleLines = [`📅 *JADWAL*`, date];
	if (setupT) scheduleLines.push(`🛠 Setup: ${setupT}`);
	if (hasBreak(segments)) {
		// Acara dengan jeda — booth berhenti di tengah. Rincikan tiap sesi.
		scheduleLines.push(
			`🎥 Sesi: ${formatScheduleInline(ev.start_time, ev.end_time, segments, {
				sep: " · ",
			})}`,
		);
	} else if (startT) {
		scheduleLines.push(`🎥 Mulai: ${startT}${endT ? ` - ${endT}` : ""}`);
	}
	sections.push(scheduleLines.join("\n"));

	// Location
	const locParts = [ev.venue_city, ev.venue_province].filter(Boolean);
	const venueLine =
		locParts.length > 0
			? `${ev.venue_name}, ${locParts.join(", ")}`
			: ev.venue_name;
	const locLines = [`📍 *LOKASI*`, venueLine];
	if (ev.venue_address) {
		locLines.push(ev.venue_address);
	}
	if (ev.google_maps_url) {
		locLines.push(`🗺 ${ev.google_maps_url}`);
	}
	sections.push(locLines.join("\n"));

	// PIC
	if (ev.pic_name) {
		const picLines = [`👤 *PIC DI LOKASI*`, ev.pic_name];
		if (ev.pic_wa) {
			picLines.push(`📞 wa.me/${toWaPhone(ev.pic_wa)}`);
		}
		sections.push(picLines.join("\n"));
	}

	// Package + spec — dedupe frame/duration if already mentioned in package name
	const backdropLabel = ev.backdrop_name
		? ev.backdrop_type && ev.backdrop_type !== ev.backdrop_name
			? `${ev.backdrop_name} (${ev.backdrop_type})`
			: ev.backdrop_name
		: ev.backdrop_color
			? (BACKDROP_LABELS[ev.backdrop_color] ?? ev.backdrop_color)
			: null;

	if (ev.package_name || ev.frame_size || backdropLabel) {
		const pkgLines: string[] = [`📦 *PAKET*`];
		const specBits: string[] = [];
		const pkgLower = (ev.package_name ?? "").toLowerCase();
		if (ev.package_name) specBits.push(ev.package_name);
		if (ev.frame_size && !pkgLower.includes(ev.frame_size.toLowerCase())) {
			specBits.push(ev.frame_size);
		}
		if (
			ev.duration_hours &&
			!pkgLower.includes(`${ev.duration_hours} jam`) &&
			!pkgLower.includes(`${ev.duration_hours}jam`)
		) {
			specBits.push(`${ev.duration_hours} jam`);
		}
		if (specBits.length) pkgLines.push(specBits.join(" · "));
		if (backdropLabel) {
			pkgLines.push(`🎨 Backdrop: ${backdropLabel}`);
		}
		if (ev.include_flashdisk_pouch) {
			pkgLines.push("📁 Include flashdisk + pouch");
		}
		sections.push(pkgLines.join("\n"));
	}

	// Add-ons
	if (ev.addons_list && ev.addons_list.length > 0) {
		const addonLines = [`➕ *ADD-ONS*`, ...ev.addons_list.map((a) => `• ${a}`)];
		sections.push(addonLines.join("\n"));
	}

	// Bonus — internal-only, klien tidak tahu, tapi crew harus kasih
	if (ev.bonuses_list && ev.bonuses_list.length > 0) {
		const bonusLines = [
			`🎁 *BONUS UNTUK KLIEN (gratis)*`,
			...ev.bonuses_list.map((b) => `• ${b}`),
			"_Pastikan disiapkan & dikasih ke klien hari-H._",
		];
		sections.push(bonusLines.join("\n"));
	}

	// Crew notes / special requests
	if (ev.crew_notes && ev.crew_notes.trim()) {
		sections.push([`📝 *CATATAN KHUSUS*`, ev.crew_notes.trim()].join("\n"));
	}

	// Footer
	sections.push(
		"—\nKonfirm di chat ini ya. Kalau ada kendala/pertanyaan langsung kabarin Managemen. Makasih banyak 🙏",
	);

	return sections.join("\n\n");
}

/**
 * All variable keys supported by buildEventVars. Used by the template editor
 * to surface insertable placeholders to the user.
 */
export const SUPPORTED_WA_VARIABLES = [
	"project_id",
	"client_name",
	"event_date",
	"setup_time",
	"start_time",
	"session_segments",
	"venue_name",
	"due_date",
	"dp_amount",
	"remaining_balance",
	"package_name",
	"duration_hours",
	"crew_lead",
	"crew_asisten",
	"drive_link",
	"reminder_count",
] as const;

export type EventForWA = {
	project_id: string;
	client_name: string;
	client_wa: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time?: string | null;
	/** Raw events.session_segments JSONB — array (multi-sesi) or null. */
	session_segments?: unknown;
	venue_name: string;
	venue_address?: string | null;
	venue_city?: string | null;
	venue_province?: string | null;
	google_maps_url?: string | null;
	pic_name?: string | null;
	pic_wa?: string | null;
	due_date?: string | null;
	total_paid?: number | null;
	remaining_balance?: number | null;
	package_name?: string | null;
	frame_size?: string | null;
	duration_hours?: number | null;
	backdrop_color?: string | null;
	backdrop_name?: string | null;
	backdrop_type?: string | null;
	channel?: string | null;
	vendor_name?: string | null;
	vendor_pic_name?: string | null;
	vendor_contact?: string | null;
	include_flashdisk_pouch?: boolean | null;
	addons_list?: string[] | null;
	bonuses_list?: string[] | null;
	crew_notes?: string | null;
	crew_lead?: string | null;
	crew_asisten?: string | null;
	drive_link?: string | null;
};

const trimTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "—");

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
