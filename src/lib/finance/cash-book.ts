/**
 * Buku Kas — mutasi satu (atau semua) akun kas/bank dengan saldo berjalan.
 *
 * Pure function supaya bisa dicek tanpa database (scripts/check-cash-book.ts).
 * Satu baris = satu JURNAL, bukan satu journal_line: kalau satu jurnal
 * menyentuh akun yang sama dua kali, nettonya yang ditampilkan.
 *
 * Mode "semua kas & bank": pindah saldo antar rekening sendiri nettonya nol →
 * tetap tampil (biar kelihatan) tapi tidak dihitung uang masuk/keluar.
 *
 * Jurnal saldo awal cutoff (menyentuh 3-101) di dalam periode dilebur ke
 * SALDO AWAL, sama seperti Buku Bulanan — kalau tidak, bulan cutoff
 * kelihatan dapat "uang masuk" puluhan juta.
 */

export const OPENING_EQUITY_COA = "3-101";

export type CashBookLine = {
	entryId: string;
	refId: string;
	date: string; // YYYY-MM-DD
	code: string;
	debit: number;
	credit: number;
};

export type CashBookRow = {
	entryId: string;
	refId: string;
	date: string;
	masuk: number;
	keluar: number;
	/** Saldo sebelum & sesudah transaksi ini. */
	saldoSebelum: number;
	saldo: number;
	/** Akun lawan (di luar akun yang sedang dilihat). */
	contraCodes: string[];
	/** Pindah saldo antar akun yang sama-sama sedang dilihat (netto nol). */
	isTransfer: boolean;
};

export type CashBook = {
	opening: number;
	rows: CashBookRow[];
	totalMasuk: number;
	totalKeluar: number;
	countMasuk: number;
	countKeluar: number;
	closing: number;
};

export function buildCashBook(
	lines: CashBookLine[],
	scope: ReadonlySet<string>,
	from: string,
	to: string,
): CashBook {
	type Agg = {
		refId: string;
		date: string;
		delta: number;
		touches: boolean;
		isOpening: boolean;
		contra: Set<string>;
	};
	const entries = new Map<string, Agg>();
	for (const l of lines) {
		const agg = entries.get(l.entryId) ?? {
			refId: l.refId,
			date: l.date,
			delta: 0,
			touches: false,
			isOpening: false,
			contra: new Set<string>(),
		};
		if (scope.has(l.code)) {
			agg.delta += l.debit - l.credit;
			agg.touches = true;
		} else if (l.debit !== 0 || l.credit !== 0) {
			agg.contra.add(l.code);
		}
		if (l.code === OPENING_EQUITY_COA) agg.isOpening = true;
		entries.set(l.entryId, agg);
	}

	let opening = 0;
	const inRange: Array<[string, Agg]> = [];
	for (const [id, a] of entries) {
		if (!a.touches || a.date > to) continue;
		if (a.date < from || a.isOpening) opening += a.delta;
		else inRange.push([id, a]);
	}
	inRange.sort(
		([, a], [, b]) =>
			a.date.localeCompare(b.date) || a.refId.localeCompare(b.refId),
	);

	let saldo = opening;
	let totalMasuk = 0;
	let totalKeluar = 0;
	let countMasuk = 0;
	let countKeluar = 0;
	const rows: CashBookRow[] = inRange.map(([entryId, a]) => {
		const saldoSebelum = saldo;
		saldo += a.delta;
		const masuk = Math.max(0, a.delta);
		const keluar = Math.max(0, -a.delta);
		if (masuk > 0) {
			totalMasuk += masuk;
			countMasuk++;
		}
		if (keluar > 0) {
			totalKeluar += keluar;
			countKeluar++;
		}
		return {
			entryId,
			refId: a.refId,
			date: a.date,
			masuk,
			keluar,
			saldoSebelum,
			saldo,
			contraCodes: [...a.contra].sort(),
			isTransfer: a.delta === 0 && a.contra.size === 0,
		};
	});

	return {
		opening,
		rows,
		totalMasuk,
		totalKeluar,
		countMasuk,
		countKeluar,
		closing: saldo,
	};
}
