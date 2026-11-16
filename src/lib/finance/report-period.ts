import { monthLabel, monthLabelShort } from "@/lib/dates";

/**
 * Periode laporan di Finance › Ringkasan: satu bulan (?bulan=YYYY-MM) atau
 * pintasan rentang (?periode=…). Semua dalam satuan bulan, karena laporan
 * untung per event & arus kas memang dihitung per bulan. Rentang dipotong ke
 * bulan pertama pembukuan (cutoff) dan bulan berjalan.
 */
export const PERIOD_PRESETS = [
	{ key: "bulan-ini", label: "Bulan ini" },
	{ key: "bulan-lalu", label: "Bulan lalu" },
	{ key: "3-bulan", label: "3 bulan" },
	{ key: "tahun-ini", label: "Tahun ini" },
	{ key: "semua", label: "Semua" },
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];

export type ReportPeriod = {
	from: string;
	to: string;
	/** Jumlah bulan dalam rentang (≥ 1). */
	months: number;
	/** Pintasan yang aktif; null = bulan tunggal dari pemilih bulan. */
	preset: PeriodPreset | null;
	/** "November 2026" atau "Tahun ini · Jun–Nov 2026". */
	label: string;
};

export function shiftYm(ym: string, delta: number): string {
	const [y, m] = ym.split("-").map(Number);
	const t = y * 12 + (m - 1) + delta;
	return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const span = (from: string, to: string) => {
	const [fy, fm] = from.split("-").map(Number);
	const [ty, tm] = to.split("-").map(Number);
	return ty * 12 + tm - (fy * 12 + fm) + 1;
};

export function resolvePeriod(
	params: { periode?: string; bulan?: string },
	thisYm: string,
	/** Bulan pertama pembukuan (cutoff); null = tidak dibatasi. */
	firstYm: string | null,
): ReportPeriod {
	const preset = PERIOD_PRESETS.find((p) => p.key === params.periode)?.key;
	const isYm = (v?: string): v is string => !!v && /^\d{4}-\d{2}$/.test(v);
	let from = thisYm;
	let to = thisYm;
	if (preset === "bulan-lalu") from = to = shiftYm(thisYm, -1);
	else if (preset === "3-bulan") from = shiftYm(thisYm, -2);
	else if (preset === "tahun-ini") from = `${thisYm.slice(0, 4)}-01`;
	else if (preset === "semua") from = firstYm ?? thisYm;
	else if (!preset && isYm(params.bulan) && params.bulan <= thisYm)
		from = to = params.bulan;
	if (firstYm && from < firstYm) from = firstYm;
	if (from > to) from = to;
	const months = span(from, to);
	const range =
		from.slice(0, 4) === to.slice(0, 4)
			? `${monthLabelShort(from).slice(0, 3)}–${monthLabelShort(to)}`
			: `${monthLabelShort(from)}–${monthLabelShort(to)}`;
	const name = PERIOD_PRESETS.find((p) => p.key === preset)?.label;
	return {
		from,
		to,
		months,
		preset: preset ?? (from === thisYm && to === thisYm ? "bulan-ini" : null),
		label:
			months === 1 ? monthLabel(from) : name ? `${name} · ${range}` : range,
	};
}
