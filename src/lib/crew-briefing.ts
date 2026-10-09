/**
 * Briefing crew ke grup WA "Tetra Crew" (permintaan owner 2026-10-09, lewat
 * Hermes). Bot: `send-grup-crew:{"pesan"}` maks 4000 huruf; bot menambah awalan
 * "🤖 Briefing otomatis …" sendiri.
 *
 * - H-1 mulai 15.00 WIB: briefing lengkap. Event yang baru dibuat sesudahnya
 *   tetap dapat di run berikutnya selama acaranya belum mulai.
 * - Hari H mulai 06.00 WIB: pengingat singkat.
 * - Satu pesan per event, idempoten per (event, jenis) lewat tabel crew_briefings.
 * - TANPA info uang. Catatan (catatan acara + briefing owner + catatan/rundown
 *   klien) WAJIB ikut utuh.
 *
 * Bagian ini murni (bisa dites); pengambil data & pengirim di crew-briefing-run.ts.
 */
import {
	activeMinutes,
	formatScheduleInline,
	hasBreak,
	parseSegments,
	timeToMinutes,
} from "@/lib/schedule/segments";
import { dateLabel } from "@/lib/telegram/format";

export const MAX_LEN = 4000;

export type BriefingData = {
	judul: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	session_segments: unknown;
	venue_name: string | null;
	venue_address: string | null;
	venue_city: string | null;
	maps_url: string | null;
	/** Crew per spot (spot 1 saja untuk event 1 unit). */
	crew: Array<{ spot: number; role: string; name: string }>;
	units: number;
	paket: string | null;
	/** Ukuran cetak per spot (index 0 = spot 1). */
	sizes: Array<string | null>;
	backdrop: string;
	addons: string[];
	desain: "booth" | "acc_belum_booth" | "belum_acc" | "tanpa_frame";
	pic: string | null;
	wo: string | null;
	/** Sudah digabung: catatan acara, briefing owner, catatan & rundown klien. */
	catatan: string[];
	/** Baris peringatan stok media ukuran event ini. */
	stok: string[];
};

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

function duration(d: BriefingData): string | null {
	const seg = parseSegments(d.session_segments);
	if (seg && seg.length) {
		const m = activeMinutes(seg);
		return m > 0 ? `${Math.round((m / 60) * 10) / 10}`.replace(".", ",") : null;
	}
	const a = timeToMinutes(d.start_time);
	let b = timeToMinutes(d.end_time);
	if (a === null || b === null) return null;
	if (b <= a) b += 24 * 60;
	return `${Math.round(((b - a) / 60) * 10) / 10}`.replace(".", ",");
}

function acara(d: BriefingData): string {
	const seg = parseSegments(d.session_segments);
	const jadwal = hasBreak(seg)
		? formatScheduleInline(d.start_time, d.end_time, seg)
		: `${hm(d.start_time) ?? "❓"}–${hm(d.end_time) ?? "❓"}`;
	const dur = duration(d);
	return `${jadwal}${dur ? ` (${dur} jam)` : ""}`;
}

const roleLabel = (r: string) =>
	r === "lead"
		? "Lead"
		: r === "asisten"
			? "Asisten"
			: r.charAt(0).toUpperCase() + r.slice(1);

function crewLines(d: BriefingData): string[] {
	if (!d.crew.length) return ["• ⚠️ Crew belum ditugaskan — cek ke Adit"];
	const sorted = [...d.crew].sort(
		(a, b) =>
			a.spot - b.spot || (a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0),
	);
	return sorted.map(
		(c) =>
			`• ${d.units > 1 ? `Spot ${c.spot} · ` : ""}${roleLabel(c.role)}: ${c.name}`,
	);
}

function formatCetak(d: BriefingData): string {
	const s = d.sizes.map((x) => x ?? "❓ belum ditentukan");
	const uniq = [...new Set(s)];
	if (uniq.length <= 1) return uniq[0] ?? "❓ belum ditentukan";
	return s.map((x, i) => `spot ${i + 1} ${x}`).join(", ");
}

const DESAIN: Record<BriefingData["desain"], string> = {
	booth: "ACC & sudah di Booth",
	acc_belum_booth: "ACC tapi belum di Booth — pastikan sudah dipasang",
	belum_acc: "⚠️ BELUM ACC — cek ke Iqbal",
	tanpa_frame: "- (paket tanpa cetak frame)",
};

/** Briefing lengkap (H-1, atau hari H untuk event yang baru masuk). */
export function composeCrewBriefing(d: BriefingData, besok = true): string {
	const lokasi = [d.venue_name, d.venue_address, d.venue_city]
		.filter(Boolean)
		.join(", ");
	const sizes = [...new Set(d.sizes.filter(Boolean))].join(" + ");
	const head = [
		`📸 *BRIEFING ${besok ? "BESOK" : "HARI INI"} — ${d.judul}*`,
		dateLabel(d.event_date, true),
		"",
		"🕐 *Jadwal*",
		`• Crew tiba & setup: *${hm(d.setup_time) ?? "❓ belum ada"}*`,
		`• Acara: ${acara(d)}`,
		"",
		"📍 *Lokasi*",
		lokasi || "❓ belum ada",
		...(d.maps_url ? [`Maps: ${d.maps_url}`] : []),
		"",
		`👥 *Crew*`,
		...crewLines(d),
		"",
		"🎁 *Paket & perlengkapan*",
		`• ${d.paket ?? "Paket belum dipilih"} · ${d.units} unit`,
		`• Format cetak: ${formatCetak(d)}`,
		`• Backdrop: ${d.backdrop}`,
		`• Add-on: ${d.addons.length ? d.addons.join(", ") : "-"}`,
		`• Desain frame: ${DESAIN[d.desain]}`,
		...d.stok.map((s) => `⚠️ ${s}`),
		"",
		"☎️ *PIC hari H*",
		...(d.pic || d.wo ? [d.pic, d.wo].filter((x): x is string => !!x) : ["-"]),
		"",
		"📝 *Catatan*",
	];
	const tail = [
		"",
		`✅ Cek sebelum berangkat: media & frame ukuran ${sizes || "❓"} cukup untuk ${duration(d) ?? "?"} jam, backdrop, properti, kabel & colokan.`,
	];
	const notes = d.catatan.length ? d.catatan : ["-"];
	let text = [...head, ...notes, ...tail].join("\n");
	// Catatan wajib utuh: kalau kepanjangan, yang dibuang baris cek penutup dulu.
	if (text.length > MAX_LEN) text = [...head, ...notes].join("\n");
	if (text.length > MAX_LEN)
		text = `${text.slice(0, MAX_LEN - 40)}\n… (lanjut di halaman event)`;
	return text;
}

/** Pengingat singkat pagi hari H. */
export function composeHariH(d: BriefingData): string {
	const lead =
		d.crew
			.filter((c) => c.role === "lead")
			.map((c) => c.name)
			.join(", ") ||
		d.crew.map((c) => c.name).join(", ") ||
		"⚠️ crew belum ditugaskan";
	const penting = d.catatan.find((c) => c.trim() && c !== "-");
	return [
		`☀️ *Hari ini: ${d.judul}*`,
		`Tiba & setup *${hm(d.setup_time) ?? "❓"}* · ${d.venue_name ?? d.venue_city ?? "venue ❓"}`,
		...(d.maps_url ? [`Maps: ${d.maps_url}`] : []),
		`Lead ${lead} · Acara ${acara(d)}`,
		...(penting ? [penting.split("\n")[0].slice(0, 300)] : []),
		"Semangat dan hati-hati di jalan! 🙌",
	].join("\n");
}

/**
 * Jenis yang perlu dikirim sekarang untuk satu event.
 * `nowMin` = menit WIB sejak 00:00 hari ini; `started` = acara sudah mulai.
 */
export function dueKinds(input: {
	event_date: string;
	today: string;
	tomorrow: string;
	nowMin: number;
	started: boolean;
	sent: Set<"h1" | "hari_h">;
}): Array<"h1" | "hari_h"> {
	const { event_date, today, tomorrow, nowMin, started, sent } = input;
	// Grup crew tidak dikirimi pesan di luar 06.00–21.00 WIB.
	if (nowMin < 6 * 60 || nowMin > 21 * 60) return [];
	if (event_date === tomorrow && nowMin >= 15 * 60 && !sent.has("h1"))
		return ["h1"];
	if (event_date !== today || started) return [];
	// Event hari ini yang belum pernah dapat briefing lengkap: kirim lengkap
	// (pengganti H-1) dan anggap pengingat pagi sudah tercakup.
	if (!sent.has("h1")) return ["h1", "hari_h"];
	if (!sent.has("hari_h")) return ["hari_h"];
	return [];
}
