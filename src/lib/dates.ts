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
