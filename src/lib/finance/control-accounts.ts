/**
 * Subledger-controlled GL accounts. These accounts are kept in lockstep with a
 * dedicated subledger table + flow, so a free-form manual journal / quick-record
 * entry touching them would silently desync the control account from its
 * subledger sum. Block free-form postings to these; use the proper flow instead:
 *   • 2-101 Hutang Vendor      → Pembelian (TOP) / bayar Hutang Dagang
 *   • 2-200..2-203 Sinking     → Dana Cadangan (deposit/withdrawal)
 *   • 2-300 Owner Pool         → settlement / Record withdrawal
 *   • 1-401 Akum. Penyusutan   → posting depresiasi / disposal
 *
 * Note: 2-100 Hutang Crew is intentionally NOT here — it has no subledger table
 * (cleared via the "Bayar fee crew" preset), so manual adjustments don't drift.
 *
 * Plain module (no "use server") — importable from server actions + UI.
 */

export const SUBLEDGER_CONTROLLED_ACCOUNTS: ReadonlySet<string> = new Set([
	"1-401",
	"2-101",
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
