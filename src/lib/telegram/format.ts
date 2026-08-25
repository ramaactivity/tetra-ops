/**
 * Pemformat pesan Telegram — murni, tanpa IO dan tanpa `server-only`.
 *
 * Dipisah dari `client.ts`/`digest.ts` supaya penyusun pesan (mis.
 * `settled-report.ts`) bisa diuji dengan node:test. Selama helper ini menumpang
 * modul ber-`server-only`, mengimpornya dari test langsung melempar
 * "This module cannot be imported from a Client Component module" — jadi format
 * laporan tidak pernah bisa dites sama sekali.
 *
 * `client.ts` dan `digest.ts` mengekspor ulang dari sini, jadi pemanggil lama
 * tidak perlu diubah.
 */

/** Escape untuk parse_mode HTML Telegram. */
export function tgEscape(s: string | null | undefined): string {
	return (s ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

export function rp(n: number): string {
	return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HARI_FULL = [
	"Minggu",
	"Senin",
	"Selasa",
	"Rabu",
	"Kamis",
	"Jumat",
	"Sabtu",
];
const BULAN = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

/** "Sab 22 Agu" — tanggal dibaca sebagai UTC supaya tidak bergeser sehari. */
export function dateLabel(iso: string, full = false): string {
	const d = new Date(`${iso}T00:00:00Z`);
	const hari = (full ? HARI_FULL : HARI)[d.getUTCDay()];
	return `${hari} ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
}
