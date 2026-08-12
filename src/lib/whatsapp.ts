import { listMissingFields } from "@/lib/events/tbc";
import { backdropOriginLabel, formatDateID, formatRupiah } from "@/lib/format";
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
 * - "81234567890"  → "6281234567890"
 *
 * Bentuk terakhir itu bukan teori: 48 event & 70 kontak tersimpan tanpa angka 0
 * di depan (khas nomor yang lewat Excel/CSV — nol-nya dimakan). Tanpa dinormalkan,
 * link wa.me-nya mati dan crew mengira nomor PIC-nya salah.
 */
export function toWaPhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.startsWith("62")) return digits;
	if (digits.startsWith("0")) return `62${digits.slice(1)}`;
	if (digits.startsWith("8")) return `62${digits}`;
	return digits;
}

/**
 * Cukup masuk akal untuk dijadikan link wa.me? Nomor Indonesia yang benar jadi
 * 62 + 9–13 digit. Data lama menyimpan potongan seperti "92908" — lebih baik
 * ditampilkan apa adanya tanpa link daripada mengirim orang ke chat yang salah.
 */
export function isLikelyWaPhone(phone: string | null | undefined): boolean {
	if (!phone) return false;
	const normalized = toWaPhone(phone);
	return /^62\d{9,13}$/.test(normalized);
}

/** Link wa.me kalau nomornya masuk akal, null kalau tidak. */
export function waLink(phone: string | null | undefined): string | null {
	return isLikelyWaPhone(phone)
		? `https://wa.me/${toWaPhone(phone as string)}`
		: null;
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

/** "Basic Red (bawaan paket)" — nama backdrop plus siapa yang membawanya. */
function withBackdropOrigin(name: string, type?: string | null): string {
	const origin = backdropOriginLabel(name, type);
	return origin ? `${name} (${origin})` : name;
}

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
	} else {
		// Diam soal jam bikin crew mengira jamnya memang tidak penting. Sebut
		// terang-terangan bahwa jamnya belum turun.
		scheduleLines.push(`🎥 Mulai: _belum dipastikan_`);
	}
	sections.push(scheduleLines.join("\n"));

	// Location
	const locParts = [ev.venue_city, ev.venue_province].filter(Boolean);
	const locLines = [`📍 *LOKASI*`];
	if (ev.venue_name) {
		locLines.push(
			locParts.length > 0
				? `${ev.venue_name}, ${locParts.join(", ")}`
				: ev.venue_name,
		);
		if (ev.venue_address) {
			locLines.push(ev.venue_address);
		}
		locLines.push(
			ev.google_maps_url ? `🗺 ${ev.google_maps_url}` : "🗺 Link maps _menyusul_",
		);
	} else {
		locLines.push("_Belum dipastikan — nanti dikabari._");
	}
	sections.push(locLines.join("\n"));

	// PIC — barisnya selalu ada. "Tidak ditampilkan" dan "belum ada PIC" harus
	// kelihatan bedanya, kalau tidak crew berangkat tanpa tahu harus cari siapa.
	const picLines = [`👤 *PIC DI LOKASI*`];
	if (ev.pic_name || ev.pic_wa) {
		if (ev.pic_name) picLines.push(ev.pic_name);
		if (ev.pic_wa) {
			// Nomor cacat (data lama) dikirim apa adanya — jangan dibungkus jadi
			// link wa.me yang menuju chat orang lain.
			picLines.push(
				isLikelyWaPhone(ev.pic_wa)
					? `📞 wa.me/${toWaPhone(ev.pic_wa)}`
					: `📞 ${ev.pic_wa}`,
			);
		} else picLines.push("📞 Nomor _menyusul_");
	} else {
		picLines.push("_Belum ditentukan._");
	}
	sections.push(picLines.join("\n"));

	// Package + spec — dedupe frame/duration if already mentioned in package name
	const backdropLabel = ev.backdrop_name
		? withBackdropOrigin(ev.backdrop_name, ev.backdrop_type)
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

	// Yang masih ditunggu — sumbernya SAMA dengan chip TBC di aplikasi crew,
	// reminder H-7/H-3 ke owner, dan digest Telegram (lib/events/tbc.ts). Dihitung
	// di sini, bukan dioper pemanggil, supaya tidak ada tombol WA yang lupa.
	const missing = listMissingFields({
		event_date_is_estimate: ev.event_date_is_estimate,
		venue_name: ev.venue_name,
		start_time: ev.start_time,
		frame_size: ev.frame_size,
		backdrop_id: ev.backdrop_id,
		pic_name: ev.pic_name,
		pic_wa: ev.pic_wa,
		pending_package_hours: ev.pending_package_hours,
		package_frame_size: ev.package_frame_size,
	});
	if (missing.length > 0) {
		sections.push(
			[
				`⚠️ *MASIH MENUNGGU KEPASTIAN*`,
				...missing.map((m) => `• ${m}`),
				"_Nanti diupdate begitu klien memastikan. Kalau H-1 masih kosong, tanya Managemen ya._",
			].join("\n"),
		);
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
	/** true = tanggalnya masih perkiraan (klien belum memastikan). */
	event_date_is_estimate?: boolean | null;
	setup_time: string | null;
	start_time: string | null;
	end_time?: string | null;
	/** Raw events.session_segments JSONB — array (multi-sesi) or null. */
	session_segments?: unknown;
	/** Bisa null: venue termasuk hal yang boleh "menyusul" saat booking. */
	venue_name: string | null;
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
	/** Dipakai menghitung daftar TBC (lihat lib/events/tbc.ts). */
	backdrop_id?: string | null;
	package_frame_size?: string | null;
	pending_package_hours?: number | null;
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
		venue_name: event.venue_name ?? "—",
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
