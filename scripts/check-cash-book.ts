/**
 * Self-check Buku Kas (saldo berjalan, cutoff, pindah saldo).
 *   npx tsx scripts/check-cash-book.ts
 */
import assert from "node:assert/strict";
import { buildCashBook, type CashBookLine } from "../src/lib/finance/cash-book";

const L = (
	entryId: string,
	date: string,
	code: string,
	debit: number,
	credit: number,
): CashBookLine => ({ entryId, refId: entryId, date, code, debit, credit });

const lines: CashBookLine[] = [
	// Bulan lalu: masuk 100 ke kas.
	L("a", "2026-09-20", "1-101", 100, 0),
	L("a", "2026-09-20", "4-100", 0, 100),
	// Cutoff opening di dalam periode → saldo awal, bukan uang masuk.
	L("o", "2026-10-01", "1-102", 500, 0),
	L("o", "2026-10-01", "3-101", 0, 500),
	// Pindah 50 dari bank ke kas.
	L("t", "2026-10-02", "1-101", 50, 0),
	L("t", "2026-10-02", "1-102", 0, 50),
	// Bayar biaya 30 dari kas.
	L("x", "2026-10-03", "5-210", 30, 0),
	L("x", "2026-10-03", "1-101", 0, 30),
	// Bulan depan: di luar periode.
	L("n", "2026-11-01", "1-101", 999, 0),
	L("n", "2026-11-01", "4-100", 0, 999),
];

// Kas tunai saja.
const kas = buildCashBook(
	lines,
	new Set(["1-101"]),
	"2026-10-01",
	"2026-10-31",
);
assert.equal(kas.opening, 100);
assert.deepEqual(
	kas.rows.map((r) => [r.entryId, r.masuk, r.keluar, r.saldoSebelum, r.saldo]),
	[
		["t", 50, 0, 100, 150],
		["x", 0, 30, 150, 120],
	],
);
assert.deepEqual(kas.rows[0].contraCodes, ["1-102"]);
assert.equal(kas.closing, 120);

// Semua kas & bank: opening lebur ke saldo awal, pindah saldo netto nol.
const all = buildCashBook(
	lines,
	new Set(["1-101", "1-102"]),
	"2026-10-01",
	"2026-10-31",
);
assert.equal(all.opening, 600);
assert.equal(all.totalMasuk, 0);
assert.equal(all.totalKeluar, 30);
assert.equal(all.rows[0].isTransfer, true);
assert.equal(all.closing, all.opening + all.totalMasuk - all.totalKeluar);

console.log("cash-book OK");
