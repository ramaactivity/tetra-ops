/**
 * Photobooth unit-availability engine (pure, no I/O — easy to unit-test).
 *
 * Tetra punya 3 unit photobooth → max 3 acara berbarengan. Yang mengunci unit
 * adalah JAM PAKAI photobooth (`events.start_time`/`end_time`), bukan durasi
 * acara. Antar acara berurutan di unit yang sama butuh BUFFER (bongkar +
 * perjalanan + pasang) yang besarnya tergantung jarak lokasi.
 *
 * Keputusan tim bot (2026-06-26), semua konservatif:
 *   1. Booking `draft`/tentatif IKUT mengunci unit (caller yang memfilter status).
 *   2. Buffer default 3 jam saat kota salah satu acara tak diketahui.
 *   3. Event existing tanpa jam → tahan 1 unit SELURUH hari.
 *
 * Lihat WHATSAPP_BOT_AVAILABILITY_HANDOVER.md untuk konteks lengkap.
 */

export const UNITS_TOTAL = 3;

/** Buffer (menit) — lihat tabel di handover. Tanpa data venue kita hanya bisa
 *  bedakan di level kota, jadi "venue sama (2 jam)" tak terdeteksi → kita pakai
 *  batas atas yang aman. */
export const DEFAULT_BUFFER_MIN = 180; // kota tak diketahui (Keputusan #2)
export const NEAR_BUFFER_MIN = 180; // kota sama / sama-sama Jabodetabek
export const FAR_BUFFER_MIN = 240; // luar kota / jauh
/** Durasi fallback saat jam mulai ada tapi jam selesai + paket tak diketahui. */
export const FALLBACK_DURATION_MIN = 120;

const MINUTES_PER_DAY = 24 * 60;

/** Kota seputar Jabodetabek + kabupaten Bogor (lokasi yang selama ini terdata).
 *  Dipakai untuk membedakan buffer "beda kota Jabodetabek" (3 jam) vs
 *  "luar kota jauh" (4 jam). Dinormalisasi lowercase. */
const NEAR_CITIES = new Set([
	"jakarta",
	"jakarta pusat",
	"jakarta selatan",
	"jakarta barat",
	"jakarta timur",
	"jakarta utara",
	"bogor",
	"depok",
	"tangerang",
	"tangerang selatan",
	"bekasi",
	"rumpin",
	"babakan madang",
	"cibinong",
	"sentul",
	"gunung putri",
	"cileungsi",
	"citeureup",
	"parung",
	"ciawi",
	"cisarua",
	"sukmajaya",
	"sawangan",
]);

export type AvailabilityEvent = {
	client_name: string | null;
	start_time: string | null; // "HH:MM" / "HH:MM:SS"
	end_time: string | null;
	venue_city: string | null;
	package_duration_hours: number | null;
};

export type Conflict = {
	project: string;
	time: string;
	city: string | null;
	/** Buffer (menit) yang dipakai untuk event ini. */
	buffer_min: number;
};

export type AvailabilityResult = {
	units_total: number;
	units_free: number;
	available: boolean;
	conflicts: Conflict[];
	/** Buffer terbesar yang benar-benar diterapkan (menit); 0 bila tak ada bentrok. */
	buffer_applied_minutes: number;
	/** Catatan asumsi (default/konservatif) supaya bot bisa kasih disclaimer. */
	assumptions: string[];
};

/** "HH:MM" atau "HH:MM:SS" → menit sejak tengah malam; null kalau tak valid. */
export function parseHHMM(value: string | null | undefined): number | null {
	if (!value) return null;
	const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return h * 60 + min;
}

/** Menit → "HH:MM" (di-clamp 00:00–24:00 untuk tampilan). */
export function formatHHMM(minutes: number): string {
	const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
	const h = Math.floor(clamped / 60);
	const m = clamped % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeCity(city: string | null | undefined): string | null {
	if (!city) return null;
	const n = city
		.toLowerCase()
		.replace(/^(kota|kab\.?|kabupaten|kec\.?|kecamatan)\s+/i, "")
		.replace(/\s+/g, " ")
		.trim();
	return n || null;
}

/** Buffer (menit) antara kota acara yang diminta vs kota event existing. */
export function bufferMinutes(
	reqCity: string | null,
	evCity: string | null,
): number {
	const a = normalizeCity(reqCity);
	const b = normalizeCity(evCity);
	if (!a || !b) return DEFAULT_BUFFER_MIN; // Keputusan #2
	if (a === b) return NEAR_BUFFER_MIN;
	if (NEAR_CITIES.has(a) && NEAR_CITIES.has(b)) return NEAR_BUFFER_MIN;
	return FAR_BUFFER_MIN;
}

/** Apakah [aStart,aEnd) overlap dengan [bStart,bEnd)? (titik singgung ≠ overlap) */
function overlaps(
	aStart: number,
	aEnd: number,
	bStart: number,
	bEnd: number,
): boolean {
	return aStart < bEnd && aEnd > bStart;
}

/** Jumlah maksimum interval yang berbarengan di satu instan (sweep line).
 *  Interval yang cuma bersinggungan di ujung (end == start) TIDAK dihitung
 *  overlap — proses end sebelum start pada koordinat yang sama. */
function maxConcurrent(intervals: Array<{ start: number; end: number }>): number {
	const points: Array<{ at: number; delta: number }> = [];
	for (const iv of intervals) {
		if (iv.end <= iv.start) continue;
		points.push({ at: iv.start, delta: 1 });
		points.push({ at: iv.end, delta: -1 });
	}
	// Urut by koordinat; pada koordinat sama, -1 (end) didahulukan dari +1 (start).
	points.sort((p, q) => (p.at === q.at ? p.delta - q.delta : p.at - q.at));
	let cur = 0;
	let max = 0;
	for (const p of points) {
		cur += p.delta;
		if (cur > max) max = cur;
	}
	return max;
}

/**
 * Hitung ketersediaan unit untuk window [reqStart, reqEnd] (dalam menit).
 * `events` HARUS sudah difilter ke tanggal yang diminta + status yang mengunci.
 */
export function computeAvailability(params: {
	reqStart: number;
	reqEnd: number;
	reqCity: string | null;
	events: AvailabilityEvent[];
}): AvailabilityResult {
	const { reqStart, reqEnd, reqCity, events } = params;
	const assumptions = new Set<string>();
	const conflicts: Conflict[] = [];
	const occupying: Array<{ start: number; end: number }> = [];

	if (!normalizeCity(reqCity)) {
		assumptions.add(
			"Kota acara tidak diberikan → buffer default 3 jam dipakai untuk semua perhitungan.",
		);
	}

	let missingCityCount = 0;

	for (const ev of events) {
		const name = ev.client_name?.trim() || "Tanpa nama";
		const s = parseHHMM(ev.start_time);
		let buffer = bufferMinutes(reqCity, ev.venue_city);
		if (!normalizeCity(ev.venue_city)) missingCityCount++;

		let winStart: number;
		let winEnd: number;
		let timeLabel: string;

		if (s === null) {
			// Keputusan #3 — jam tak diketahui → tahan 1 unit seluruh hari.
			winStart = 0;
			winEnd = MINUTES_PER_DAY;
			buffer = 0; // sudah seharian penuh, buffer tak menambah apa-apa
			timeLabel = "tanpa jam (ditahan seharian)";
			assumptions.add(
				`Event "${name}" tanpa jam → ditahan seluruh hari (konservatif).`,
			);
		} else {
			let e = parseHHMM(ev.end_time);
			if (e === null || e <= s) {
				const durMin = ev.package_duration_hours
					? ev.package_duration_hours * 60
					: FALLBACK_DURATION_MIN;
				e = s + durMin;
				assumptions.add(
					`Event "${name}" tanpa jam selesai → diperkirakan ${Math.round(
						durMin / 60,
					)} jam dari jam mulai.`,
				);
			}
			winStart = s;
			winEnd = e;
			timeLabel = `${formatHHMM(s)}-${formatHHMM(e)}`;
		}

		// Lebarkan window dengan buffer di kedua sisi, lalu cek overlap.
		const exStart = winStart - buffer;
		const exEnd = winEnd + buffer;
		if (overlaps(exStart, exEnd, reqStart, reqEnd)) {
			occupying.push({
				start: Math.max(exStart, reqStart),
				end: Math.min(exEnd, reqEnd),
			});
			conflicts.push({
				project: name,
				time: timeLabel,
				city: ev.venue_city,
				buffer_min: buffer,
			});
		}
	}

	if (missingCityCount > 0 && normalizeCity(reqCity)) {
		assumptions.add(
			`${missingCityCount} event tanpa data kota → buffer default 3 jam dipakai untuk event tersebut.`,
		);
	}

	const maxOverlap = maxConcurrent(occupying);
	const unitsFree = Math.max(0, UNITS_TOTAL - maxOverlap);
	const bufferApplied = conflicts.reduce(
		(mx, c) => Math.max(mx, c.buffer_min),
		0,
	);

	return {
		units_total: UNITS_TOTAL,
		units_free: unitsFree,
		available: unitsFree > 0,
		conflicts,
		buffer_applied_minutes: bufferApplied,
		assumptions: [...assumptions],
	};
}
