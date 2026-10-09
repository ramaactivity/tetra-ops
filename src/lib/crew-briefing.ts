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
	pic: { name: string | null; wa: string | null } | null;
	wo: { vendor: string; name: string | null; wa: string | null } | null;
	/** Sudah digabung: catatan acara, briefing owner, catatan & rundown klien. */
	catatan: string[];
	/** Baris peringatan stok media ukuran event ini. */
	stok: string[];
};

const hm = (t: string | null) => (t ? t.slice(0, 5).replace(":", ".") : null);

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
	r === "lead" ? "lead" : r === "asisten" ? "asisten" : r.toLowerCase();

function crewLines(d: BriefingData): string[] {
	if (!d.crew.length)
		return ["• ⚠️ crew belum ditugaskan, tolong cek ke Adit ya"];
	const sorted = [...d.crew].sort(
		(a, b) =>
			a.spot - b.spot || (a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0),
	);
	return sorted.map(
		(c) =>
			`• ${c.name} (${roleLabel(c.role)}${d.units > 1 ? `, spot ${c.spot}` : ""})`,
	);
}

function formatCetak(d: BriefingData): string {
	const s = d.sizes.map((x) => x ?? "❓ belum ditentukan");
	const uniq = [...new Set(s)];
	if (uniq.length <= 1) return uniq[0] ?? "❓ belum ditentukan";
	return s.map((x, i) => `spot ${i + 1} ${x}`).join(", ");
}

const DESAIN: Record<BriefingData["desain"], string> = {
	booth: "udah ACC & udah masuk Booth 👍",
	acc_belum_booth: "udah ACC, pastiin udah dipasang di Booth ya",
	belum_acc: "⚠️ belum ACC nih, tolong cek ke Iqbal ya",
	tanpa_frame: "paket ini nggak cetak frame",
};

const NO_NOTES = "• nggak ada catatan khusus dari klien";
const digits = (x: string | null) => (x ?? "").replace(/\D/g, "").slice(-9);

/** PIC hari H; PIC = kontak WO (nomor sama) → satu baris saja. */
function picLines(d: BriefingData): string[] {
	const pic = d.pic && (d.pic.name || d.pic.wa) ? d.pic : null;
	const wo = d.wo;
	const fmt = (n: string | null, w: string | null) =>
		[n, w].filter(Boolean).join(" · ");
	if (pic && wo && pic.wa && digits(pic.wa) === digits(wo.wa))
		return [`• ${fmt(pic.name ?? wo.name, pic.wa)} (WO ${wo.vendor})`];
	const out: string[] = [];
	if (pic) out.push(`• ${fmt(pic.name, pic.wa)}`);
	if (wo)
		out.push(
			`• WO: ${wo.vendor}${wo.name || wo.wa ? ` (${fmt(wo.name, wo.wa)})` : ""}`,
		);
	return out.length ? out : ["• belum ada"];
}

/** Catatan → baris "•" (catatan multi-baris dipecah, isinya tidak dipotong). */
function noteLines(d: BriefingData): string[] {
	const lines = d.catatan
		.flatMap((c) => c.split("\n"))
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => `• ${l.replace(/^[-•]\s*/, "")}`);
	return lines.length ? lines : [NO_NOTES];
}

/** Briefing lengkap (H-1, atau pagi hari H untuk event yang baru masuk). */
export function composeCrewBriefing(d: BriefingData, besok = true): string {
	const lokasi = [d.venue_name, d.venue_address, d.venue_city]
		.filter(Boolean)
		.join(", ");
	const sizes = [...new Set(d.sizes.filter(Boolean))].join(" + ");
	const head = [
		`Gaes, ${besok ? "besok" : "hari ini"} kita jalan ke ${d.judul} ya 🙌`,
		dateLabel(d.event_date, true),
		"",
		"⏰ Jadwal",
		`• Loading & setup: ${hm(d.setup_time) ?? "❓ belum ada"}`,
		`• Acara: ${acara(d)}`,
		"",
		"📍 Lokasi",
		`• ${lokasi || "❓ belum ada"}`,
		...(d.maps_url ? [`• Maps: ${d.maps_url}`] : []),
		"",
		"👥 Crew",
		...crewLines(d),
		"",
		"📸 Paket & perlengkapan",
		`• ${d.paket ?? "paket belum dipilih"} • ${d.units} unit`,
		`• Cetak: ${formatCetak(d)}`,
		`• Backdrop: ${d.backdrop}`,
		`• Add-on: ${d.addons.length ? d.addons.join(", ") : "-"}`,
		...d.stok.map((x) => `• ⚠️ ${x}`),
		"",
		`🎨 Desain: ${DESAIN[d.desain]}`,
		"",
		"☎️ PIC hari H",
		...picLines(d),
		"",
		"📝 Catatan penting",
	];
	const tail = [
		"",
		`Jangan lupa cek perlengkapan sebelum berangkat ya: media & frame ${sizes || "❓"} cukup buat ${duration(d) ?? "?"} jam, backdrop, properti, kabel & colokan 🙏`,
	];
	const notes = noteLines(d);
	let text = [...head, ...notes, ...tail].join("\n");
	// Catatan wajib utuh: kalau kepanjangan, yang dibuang baris cek penutup dulu.
	if (text.length > MAX_LEN) text = [...head, ...notes].join("\n");
	if (text.length > MAX_LEN)
		text = `${text.slice(0, MAX_LEN - 40)}\n… (lanjut di halaman event)`;
	return text;
}

/** Pengingat singkat pagi hari H. */
export function composeHariH(d: BriefingData): string {
	const crew = d.crew.length
		? [...d.crew]
				.sort((a, b) => (a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0))
				.map((c) => (c.role === "lead" ? `${c.name} (lead)` : c.name))
				.join(" & ")
		: "⚠️ belum ditugaskan, cek ke Adit";
	const penting = noteLines(d)[0];
	return [
		`Pagi gaes! Hari ini ${d.judul} ☀️`,
		`• Loading & setup ${hm(d.setup_time) ?? "❓"} • acara ${acara(d)}`,
		`• ${d.venue_name ?? d.venue_city ?? "venue ❓"}`,
		...(d.maps_url ? [`• Maps: ${d.maps_url}`] : []),
		`• Crew: ${crew}`,
		...picLines(d).map((l) => l.replace(/^• /, "• PIC: ")),
		...(penting !== NO_NOTES ? [penting.slice(0, 300)] : []),
		"Semangat & hati-hati di jalan ya! 🙌",
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
	sent: Set<string>;
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

const join = (names: string[]) =>
	names.length <= 1
		? (names[0] ?? "tim")
		: `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;

/** Variasi pembuka supaya tidak monoton (dipilih stabil per event). */
const OPENERS = [
	(n: string, j: string) =>
		`Thank you for today ${n}! 🙌 Acara ${j} beres, kalian keren.`,
	(n: string, j: string) =>
		`Makasih banyak ${n}! 🙌 ${j} udah kelar, mantap kerjanya.`,
	(n: string, j: string) =>
		`Thank you ${n} buat hari ini! 🙌 ${j} beres dengan lancar.`,
];

/** Pengingat setelah acara (selesai + 30 menit) ke grup crew. */
export function composeSelesai(input: {
	judul: string;
	project_id: string;
	crew: string[];
	rekapUrl: string | null;
	rekapMasuk: boolean;
}): string {
	const names = [...new Set(input.crew)];
	const seed = [...input.project_id].reduce((s, c) => s + c.charCodeAt(0), 0);
	const open = OPENERS[seed % OPENERS.length](join(names), input.judul);
	const rekap = input.rekapMasuk
		? ["• Rekap udah masuk, makasih! 👍"]
		: [
				"• Rekap di aplikasi crew: foto bukti + bukti transfer/transaksi (bensin, parkir, tol, dll.)",
				...(input.rekapUrl ? [`  ${input.rekapUrl}`] : []),
			];
	return [
		open,
		"",
		"Sebelum lupa ya:",
		...rekap,
		"• Footage dokumentasi langsung kirim ke Iqbal ya 📸",
		"",
		"Hati-hati pulangnya! 🛵",
	].join("\n");
}

/** Waktu absolut (ms) jam selesai acara; selesai < mulai = lewat tengah malam. */
export function endAt(
	event_date: string,
	start: string | null,
	end: string | null,
): number | null {
	const e = timeToMinutes(end);
	if (e === null) return null;
	const s = timeToMinutes(start);
	const day = Date.parse(`${event_date}T00:00:00+07:00`);
	return day + (e + (s !== null && e <= s ? 24 * 60 : 0)) * 60_000;
}
