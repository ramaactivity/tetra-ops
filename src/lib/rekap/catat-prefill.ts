/**
 * Jembatan antar-kartu di halaman rekap: tombol "Catat ke pembukuan" pada
 * biaya yang dibayar owner (kartu Fee crew) mengisi form di kartu "Pemasukan /
 * pengeluaran lain" — dua komponen client bersebelahan tanpa parent client.
 *
 * Dulu tombol itu deep-link ke /finance, jadi owner keluar dari halaman rekap
 * di tengah proses tutup buku. Sekarang semua selesai di satu halaman.
 *
 * CustomEvent dipilih ketimbang context/provider: keduanya sudah dirender oleh
 * server component yang sama, dan ini satu-satunya pesan yang perlu lewat.
 */

export const CATAT_PREFILL_EVENT = "tetra:catat-extra";

export type CatatPrefillDetail = {
	/** Kategori Catat (id di quick-record-categories). */
	categoryId: string;
	amount: number;
	note: string;
	/** Nota yang sudah di-upload crew (kalau ada) — langsung ikut terlampir. */
	proofUrl?: string | null;
};

export function emitCatatPrefill(detail: CatatPrefillDetail): void {
	window.dispatchEvent(
		new CustomEvent<CatatPrefillDetail>(CATAT_PREFILL_EVENT, { detail }),
	);
}
