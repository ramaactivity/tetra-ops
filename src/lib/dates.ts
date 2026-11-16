/**
 * "Hari ini" menurut jam Indonesia — bukan jam server.
 *
 * Vercel menjalankan function-nya di UTC, jadi `new Date().toISOString()` masih
 * menunjuk tanggal KEMARIN sepanjang 00:00–07:00 WIB. Di aplikasi crew itu jam
 * paling rawan: crew berangkat setup subuh dan melihat event hari-H nya
 * dilabeli "Besok". Semua perbandingan tanggal yang dibaca manusia harus lewat
 * helper ini.
 *
 * Modul polos supaya bisa dipakai server component maupun client.
 */

const WIB = "Asia/Jakarta";

/** Tanggal hari ini di WIB sebagai `YYYY-MM-DD` (en-CA = format ISO). */
export function todayWIB(): string {
	return new Date().toLocaleDateString("en-CA", { timeZone: WIB });
}

/** Tanggal sebuah instant di WIB sebagai `YYYY-MM-DD`. */
export function isoDateWIB(d: Date): string {
	return d.toLocaleDateString("en-CA", { timeZone: WIB });
}

/** Geser tanggal `YYYY-MM-DD` sebanyak n hari (tanpa efek zona waktu). */
export function shiftISODate(iso: string, days: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + days);
	return dt.toISOString().slice(0, 10);
}

const RELATIVE = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

/** Waktu relatif bahasa Indonesia: "5 menit yang lalu", "kemarin", "2 bulan yang lalu". */
export function timeAgo(iso: string): string {
	const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
	if (Math.abs(mins) < 60) return RELATIVE.format(mins, "minute");
	const hours = Math.round(mins / 60);
	if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
	const days = Math.round(hours / 24);
	if (Math.abs(days) < 30) return RELATIVE.format(days, "day");
	const months = Math.round(days / 30);
	if (Math.abs(months) < 12) return RELATIVE.format(months, "month");
	return RELATIVE.format(Math.round(days / 365), "year");
}

export const ID_MONTH_NAMES = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
] as const;

export function monthLabel(ym: string): string {
	const [y, m] = ym.split("-");
	const idx = Number(m) - 1;
	return `${ID_MONTH_NAMES[idx] ?? m} ${y}`;
}

export function monthLabelShort(ym: string): string {
	const [y, m] = ym.split("-");
	const idx = Number(m) - 1;
	return `${(ID_MONTH_NAMES[idx] ?? m).slice(0, 3)} ${y}`;
}
