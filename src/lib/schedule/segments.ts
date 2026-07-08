/**
 * schedule/segments.ts — Acara dengan JEDA (multi-sesi).
 *
 * Satu acara bisa berjalan dalam beberapa SESI aktif dengan jeda di tengah
 * (booth buka → tutup → buka lagi). Model:
 *
 *   • events.start_time / end_time = RENTANG keseluruhan (mulai sesi pertama →
 *     selesai sesi terakhir). Semua pembaca lama tetap benar.
 *   • events.session_segments (JSONB) = window aktif per-sesi. NULL/[]/1-item =
 *     acara satu blok biasa (tanpa jeda). ≥2 item = ada jeda.
 *
 * Jeda antar-sesi DITURUNKAN dari selisih (bukan disimpan) supaya fleksibel
 * sesuai negosiasi klien. Durasi paket = TOTAL jam aktif (jumlah semua sesi),
 * jeda TIDAK dihitung.
 *
 * Plain module (pure functions + types) — aman diimpor dari server action,
 * client form, availability engine, PDF, bot. TIDAK "use server".
 */

export type Segment = {
	/** "HH:MM" mulai sesi. */
	start: string;
	/** "HH:MM" selesai sesi. */
	end: string;
};

const HHMM_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** "HH:MM" / "HH:MM:SS" → menit sejak tengah malam; null kalau invalid. */
export function timeToMinutes(value: string | null | undefined): number | null {
	if (!value) return null;
	const m = HHMM_RE.exec(value.trim());
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return h * 60 + min;
}

/** "HH:MM:SS" → "HH:MM" (potong detik). Kosong → "". */
export function trimTime(value: string | null | undefined): string {
	if (!value) return "";
	const m = HHMM_RE.exec(value.trim());
	if (!m) return "";
	return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** menit → "HH:MM" (wrap 24 jam untuk sesi yang lewat tengah malam tidak didukung; clamp). */
export function minutesToTime(minutes: number): string {
	const clamped = Math.max(0, Math.min(24 * 60, minutes));
	const h = Math.floor(clamped / 60) % 24;
	const m = clamped % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Parse nilai mentah (dari DB JSONB atau hidden input JSON string) menjadi
 * Segment[] yang sudah dinormalisasi ("HH:MM"). Membuang entri yang invalid.
 * Mengembalikan null kalau tidak ada segmen valid.
 */
export function parseSegments(raw: unknown): Segment[] | null {
	let arr: unknown = raw;
	if (typeof raw === "string") {
		const s = raw.trim();
		if (!s) return null;
		try {
			arr = JSON.parse(s);
		} catch {
			return null;
		}
	}
	if (!Array.isArray(arr)) return null;
	const out: Segment[] = [];
	for (const item of arr) {
		if (!item || typeof item !== "object") continue;
		const start = trimTime((item as Record<string, unknown>).start as string);
		const end = trimTime((item as Record<string, unknown>).end as string);
		if (!start || !end) continue;
		out.push({ start, end });
	}
	return out.length ? out : null;
}

/** True kalau acara benar-benar punya jeda (≥2 sesi valid). */
export function hasBreak(segments: Segment[] | null | undefined): boolean {
	return Array.isArray(segments) && segments.length >= 2;
}

export type SegmentValidation =
	| { ok: true; segments: Segment[] }
	| { ok: false; error: string; index?: number };

/**
 * Validasi urutan sesi: tiap sesi end > start, dan tiap sesi mulai setelah
 * (atau sama dengan) sesi sebelumnya selesai — tidak boleh tumpang tindih.
 * Sesi diurutkan by start sebelum divalidasi.
 */
export function validateSegments(segments: Segment[]): SegmentValidation {
	if (!segments.length) return { ok: false, error: "Minimal satu sesi." };
	const withMin = segments.map((s) => ({
		...s,
		sMin: timeToMinutes(s.start),
		eMin: timeToMinutes(s.end),
	}));
	for (let i = 0; i < withMin.length; i++) {
		const seg = withMin[i];
		if (seg.sMin === null || seg.eMin === null)
			return {
				ok: false,
				error: `Sesi ${i + 1} jamnya belum lengkap.`,
				index: i,
			};
		if (seg.eMin <= seg.sMin)
			return {
				ok: false,
				error: `Sesi ${i + 1}: jam selesai harus setelah jam mulai.`,
				index: i,
			};
	}
	const sorted = [...withMin].sort((a, b) => (a.sMin ?? 0) - (b.sMin ?? 0));
	for (let i = 1; i < sorted.length; i++) {
		if ((sorted[i].sMin ?? 0) < (sorted[i - 1].eMin ?? 0))
			return {
				ok: false,
				error: `Sesi ${i + 1} mulai sebelum sesi ${i} selesai (tumpang tindih).`,
				index: i,
			};
	}
	return {
		ok: true,
		segments: sorted.map((s) => ({ start: s.start, end: s.end })),
	};
}

/** Rentang keseluruhan: mulai sesi pertama → selesai sesi terakhir. */
export function segmentsEnvelope(
	segments: Segment[],
): { start: string; end: string } | null {
	if (!segments.length) return null;
	const sorted = [...segments].sort(
		(a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0),
	);
	return { start: sorted[0].start, end: sorted[sorted.length - 1].end };
}

/** Total jam aktif (menit) = jumlah durasi tiap sesi (jeda tidak dihitung). */
export function activeMinutes(segments: Segment[]): number {
	return segments.reduce((sum, s) => {
		const a = timeToMinutes(s.start);
		const b = timeToMinutes(s.end);
		if (a === null || b === null || b <= a) return sum;
		return sum + (b - a);
	}, 0);
}

/** Durasi jeda (menit) antar sesi, panjang = segments.length - 1. */
export function segmentGaps(segments: Segment[]): number[] {
	const gaps: number[] = [];
	const sorted = [...segments].sort(
		(a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0),
	);
	for (let i = 1; i < sorted.length; i++) {
		const prevEnd = timeToMinutes(sorted[i - 1].end);
		const curStart = timeToMinutes(sorted[i].start);
		if (prevEnd === null || curStart === null) {
			gaps.push(0);
			continue;
		}
		gaps.push(Math.max(0, curStart - prevEnd));
	}
	return gaps;
}

/** "30 menit" · "1 jam" · "1 jam 30 menit" · "5 jam". */
export function formatDuration(min: number): string {
	if (min <= 0) return "0 menit";
	const h = Math.floor(min / 60);
	const m = min % 60;
	if (h === 0) return `${m} menit`;
	if (m === 0) return `${h} jam`;
	return `${h} jam ${m} menit`;
}

/**
 * Satu-baris deskripsi jadwal untuk digest/list/PDF.
 * Tanpa jeda → "17:30–22:30".
 * Ada jeda    → "17:30–18:30 · jeda 30 menit · 19:00–23:00".
 */
export function formatScheduleInline(
	startTime: string | null | undefined,
	endTime: string | null | undefined,
	segments: Segment[] | null | undefined,
	opts?: { sep?: string; gapLabel?: (min: number) => string },
): string {
	const sep = opts?.sep ?? " · ";
	const gapLabel =
		opts?.gapLabel ?? ((m: number) => `jeda ${formatDuration(m)}`);
	if (hasBreak(segments)) {
		const sorted = [...(segments as Segment[])].sort(
			(a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0),
		);
		const gaps = segmentGaps(sorted);
		const parts: string[] = [];
		sorted.forEach((s, i) => {
			parts.push(`${trimTime(s.start)}–${trimTime(s.end)}`);
			if (i < gaps.length && gaps[i] > 0) parts.push(gapLabel(gaps[i]));
		});
		return parts.join(sep);
	}
	const a = trimTime(startTime);
	const b = trimTime(endTime);
	if (a && b) return `${a}–${b}`;
	if (a) return a;
	return "";
}

/**
 * Deskripsi terstruktur untuk UI detail (owner detail, crew jadwal).
 * `sessions` sudah diurut; tiap gap ditempel di sesi sesudahnya (gapBeforeMin).
 */
export type ScheduleView = {
	hasBreak: boolean;
	envelope: { start: string; end: string } | null;
	sessions: Array<{
		index: number;
		start: string;
		end: string;
		durationMin: number;
		gapBeforeMin: number; // 0 utk sesi pertama
	}>;
	activeMin: number;
};

export function describeSchedule(
	startTime: string | null | undefined,
	endTime: string | null | undefined,
	segments: Segment[] | null | undefined,
): ScheduleView {
	if (hasBreak(segments)) {
		const sorted = [...(segments as Segment[])].sort(
			(a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0),
		);
		const gaps = segmentGaps(sorted);
		return {
			hasBreak: true,
			envelope: segmentsEnvelope(sorted),
			activeMin: activeMinutes(sorted),
			sessions: sorted.map((s, i) => {
				const a = timeToMinutes(s.start) ?? 0;
				const b = timeToMinutes(s.end) ?? 0;
				return {
					index: i,
					start: trimTime(s.start),
					end: trimTime(s.end),
					durationMin: Math.max(0, b - a),
					gapBeforeMin: i === 0 ? 0 : (gaps[i - 1] ?? 0),
				};
			}),
		};
	}
	const a = trimTime(startTime);
	const b = trimTime(endTime);
	const aMin = timeToMinutes(a);
	const bMin = timeToMinutes(b);
	return {
		hasBreak: false,
		envelope: a && b ? { start: a, end: b } : null,
		activeMin: aMin !== null && bMin !== null ? Math.max(0, bMin - aMin) : 0,
		sessions:
			a && b
				? [
						{
							index: 0,
							start: a,
							end: b,
							durationMin:
								aMin !== null && bMin !== null ? Math.max(0, bMin - aMin) : 0,
							gapBeforeMin: 0,
						},
					]
				: [],
	};
}
