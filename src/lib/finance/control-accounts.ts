/**
 * Subledger-controlled GL accounts. These accounts are kept in lockstep with a
 * dedicated subledger table + flow, so a free-form manual journal / quick-record
 * entry touching them would silently desync the control account from its
 * subledger sum. Block free-form postings to these; use the proper flow instead:
 *   • 1-2xx Persediaan         → Pembelian / Stock Opname / Wastage / settle
 *   • 2-101 Hutang Vendor      → Pembelian (TOP) / bayar Hutang Dagang
 *   • 2-102/2-103 Hutang Komisi→ settlement + modul Komisi (bayar/batalkan)
 *   • 1-310 Uang Muka Komisi   → modul Komisi ("Bayar di muka"), habis saat settle
 *   • 2-200..2-203 Sinking     → Dana Cadangan (deposit/withdrawal)
 *   • 2-300 Owner Pool         → settlement / Record withdrawal
 *   • 1-401 Akum. Penyusutan   → posting depresiasi / disposal
 *
 * Note: 2-100 Hutang Crew is intentionally NOT here — it has no subledger table
 * (cleared via the "Bayar fee crew" preset), so manual adjustments don't drift.
 *
 * Kategori kurasi Catat BOLEH menembak akun di sini (lihat guard di
 * journal-entries.ts) — yang diblokir hanya jurnal manual bebas & "Akun lain".
 * Itu sebabnya preset "Bayar fee crew" (2-100) dan "Bayar komisi …" (2-102/
 * 2-103) tetap jalan.
 *
 * Plain module (no "use server") — importable from server actions + UI.
 */

export const SUBLEDGER_CONTROLLED_ACCOUNTS: ReadonlySet<string> = new Set([
	// Persediaan direkonsiliasi terhadap stok fisik × harga rata-rata, jadi
	// jurnal manual bebas di sini langsung bikin drift yang tak sembuh sendiri.
	// Semua jalur sahnya sudah ada & menulis jurnalnya sendiri: Pembelian,
	// Stock Opname, Wastage, dan pemakaian saat settle.
	"1-200",
	"1-201",
	"1-202",
	"1-203",
	"1-204",
	"1-205",
	"1-206",
	"1-207",
	"1-209",
	"1-310",
	"1-401",
	"2-101",
	"2-102",
	"2-103",
	"2-200",
	"2-201",
	"2-202",
	"2-203",
	"2-300",
]);

export function isControlledAccount(code: string | null | undefined): boolean {
	return code ? SUBLEDGER_CONTROLLED_ACCOUNTS.has(code.trim()) : false;
}

export const CONTROLLED_ACCOUNT_MSG =
	"Akun ini dikelola otomatis lewat alur khusus (Hutang Dagang, Dana Cadangan, Owner, Penyusutan) — tidak bisa diisi lewat jurnal manual agar saldo tetap konsisten.";
