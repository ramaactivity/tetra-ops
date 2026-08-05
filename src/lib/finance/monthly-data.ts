import "server-only";

import { isCashOrBank } from "@/lib/finance/accounting";
import { fetchAllJournalLines } from "@/lib/finance/balance-guard";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Pembukuan per bulan untuk halaman /finance/bulanan.
 *
 * Tiga cerita berbeda yang sengaja DIPISAH — kalau dicampur, angkanya
 * kelihatan "salah" padahal benar:
 *
 *   1. ALUR UANG  — saldo awal + uang masuk − uang keluar = saldo akhir.
 *      Murni pergerakan kas/bank (1-1xx). Selalu tutup persis, karena saldo
 *      awal dihitung dari seluruh mutasi kas sebelum bulan itu.
 *
 *   2. UNTUNG (BUKU) — pendapatan bulan itu − beban bulan itu. INI yang namanya
 *      untung. Sengaja tidak sama dengan naiknya saldo: beli stok, bayar utang,
 *      dan ambil bagi hasil bikin uang keluar tapi bukan biaya; sebaliknya
 *      pemakaian stok adalah biaya tanpa uang keluar bulan itu.
 *
 *   3. LABA EVENT DI-SETTLE — jumlah laba bersih tiap event yang ditutup bulan
 *      itu. Ukuran "event-nya untung berapa", bukan ukuran bulanan: uangnya
 *      bisa masuk bulan lain.
 *
 * Catatan cutoff: jurnal "Saldo Awal" (yang menyentuh 3-101 Modal Awal) TIDAK
 * dihitung sebagai uang masuk — kalau ikut, bulan cutoff kelihatan seolah dapat
 * pemasukan puluhan juta. Kas dari jurnal itu masuk ke SALDO AWAL bulan
 * tersebut, sehingga persamaan alur uang tetap tutup.
 */

/** Akun ekuitas yang menandai jurnal saldo awal / cutoff pembukuan. */
const OPENING_EQUITY_COA = "3-101";

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

/** YYYY-MM dari sebuah tanggal lokal (bukan UTC — hindari geser sehari). */
export function ymOf(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(ym: string): { start: string; end: string } {
	const [y, m] = ym.split("-").map(Number);
	const last = new Date(y, m, 0).getDate();
	return {
		start: `${ym}-01`,
		end: `${ym}-${String(last).padStart(2, "0")}`,
	};
}

function addMonths(ym: string, delta: number): string {
	const [y, m] = ym.split("-").map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return ymOf(d);
}

// ── Kelompok pengeluaran (bahasa owner, bukan nama akun akuntansi) ──────────

export type ExpenseGroupKey =
	| "bahan"
	| "crew"
	| "transport"
	| "alat"
	| "konsumsi"
	| "operasional"
	| "komisi"
	| "platform"
	| "susut"
	| "bank"
	| "lain";

const EXPENSE_GROUP_LABEL: Record<ExpenseGroupKey, string> = {
	bahan: "Bahan cetak & produksi",
	crew: "Fee & bonus crew",
	transport: "Transport & bensin",
	alat: "Sewa & perawatan alat",
	konsumsi: "Konsumsi & rapat",
	operasional: "Perlengkapan & kantor",
	komisi: "Komisi vendor/relasi",
	platform: "Platform & marketing",
	susut: "Penyusutan & barang rusak",
	bank: "Biaya admin bank",
	lain: "Lain-lain",
};

function expenseGroupFor(code: string): ExpenseGroupKey {
	if (code.startsWith("5-1") || code === "5-411") return "bahan";
	if (code.startsWith("5-20")) return "crew";
	if (code.startsWith("5-21")) return "transport";
	if (code.startsWith("5-22") || code.startsWith("5-23")) return "alat";
	if (code.startsWith("5-24") || code.startsWith("5-28")) return "konsumsi";
	if (
		code.startsWith("5-25") ||
		code.startsWith("5-26") ||
		code.startsWith("5-27")
	)
		return "operasional";
	if (code.startsWith("5-30")) return "komisi";
	if (code.startsWith("5-40") || code.startsWith("5-41")) return "platform";
	if (code.startsWith("5-50") || code.startsWith("5-51")) return "susut";
	if (code === "5-600") return "bank";
	return "lain";
}

// ── Bentuk data ────────────────────────────────────────────────────────────

export type MonthlyRow = {
	ym: string;
	label: string;
	/** Kas+bank di awal bulan (termasuk jurnal saldo awal yang jatuh di bulan ini). */
	opening: number;
	inflow: number;
	outflow: number;
	closing: number;
	revenue: number;
	expense: number;
	/** revenue − expense. "Untung" yang sebenarnya. */
	profitBook: number;
	/** Σ laba bersih event yang di-settle bulan ini. */
	profitSettled: number;
	settledCount: number;
	/** Ada jurnal saldo awal (cutoff) di bulan ini → bulan parsial. */
	hasOpeningEntry: boolean;
};

export type ExpenseGroupRow = {
	key: ExpenseGroupKey;
	label: string;
	amount: number;
	accounts: Array<{ code: string; name: string; amount: number }>;
};

export type MonthlyOverview = {
	/** Bulan yang punya data, ASC (bulan cutoff .. bulan berjalan). */
	months: string[];
	current: MonthlyRow;
	prevYm: string | null;
	nextYm: string | null;
	expenseGroups: ExpenseGroupRow[];
	/** Bagian uang keluar yang jadi biaya bulan itu. */
	outflowForExpense: number;
	/** Sisanya: beli stok, bayar utang, ambil bagi hasil — keluar tapi bukan biaya. */
	outflowNonExpense: number;
	/** 12 bulan terakhir, DESC (terbaru dulu). */
	history: MonthlyRow[];
	cutoffDate: string | null;
	/** Bulan terpilih ada sebelum cutoff → buku belum dimulai. */
	beforeBooks: boolean;
};

type LineRow = {
	entry_id: string;
	account_code: string;
	debit_amount: number | string;
	credit_amount: number | string;
	entry: { entry_date: string } | Array<{ entry_date: string }> | null;
};

export async function getMonthlyOverview(
	supabase: ServerSupabase,
	requestedYm?: string,
): Promise<MonthlyOverview> {
	const [{ data: coaData }, { data: cutoffCfg }, { data: settlementsData }] =
		await Promise.all([
			supabase.from("chart_of_accounts").select("code, name, account_type"),
			supabase
				.from("system_config")
				.select("value")
				.eq("key", "finance_cutoff_date")
				.maybeSingle(),
			supabase
				.from("event_settlements")
				.select("net_profit, closed_at")
				.eq("is_reopened", false),
		]);

	const cutoffDate =
		typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
			? cutoffCfg.value
			: null;

	const coa = new Map(
		(coaData ?? []).map((c) => [
			c.code as string,
			{ name: c.name as string, type: c.account_type as string },
		]),
	);

	const rawLines = await fetchAllJournalLines<LineRow>(
		supabase,
		`entry_id, account_code, debit_amount, credit_amount,
		 entry:journal_entries!journal_lines_entry_id_fkey(entry_date)`,
	);

	// Ringkas per JURNAL dulu, baru per bulan. Netting per jurnal bikin transfer
	// antar rekening sendiri (Dr bank A / Cr bank B) tidak terhitung sebagai
	// "uang masuk" DAN "uang keluar" sekaligus — nettonya nol, memang begitu.
	type EntryAgg = {
		date: string;
		cashDelta: number;
		/** Beban yang didebit di jurnal yang sama — untuk memisah uang keluar
		 *  "buat biaya" dari uang keluar "beli stok / bayar utang / bagi hasil". */
		expenseDelta: number;
		isOpening: boolean;
	};
	const entries = new Map<string, EntryAgg>();
	// Beban & pendapatan per bulan per akun.
	const revenueByMonth = new Map<string, number>();
	const expenseByMonth = new Map<string, number>();
	const expenseByMonthAccount = new Map<string, Map<string, number>>();

	for (const l of rawLines) {
		const e = Array.isArray(l.entry) ? l.entry[0] : l.entry;
		if (!e?.entry_date) continue;
		const date = e.entry_date.slice(0, 10);
		const ym = date.slice(0, 7);
		const code = l.account_code;
		const meta = coa.get(code);
		const debit = Number(l.debit_amount ?? 0);
		const credit = Number(l.credit_amount ?? 0);

		const agg = entries.get(l.entry_id) ?? {
			date,
			cashDelta: 0,
			expenseDelta: 0,
			isOpening: false,
		};
		if (meta && isCashOrBank(code, meta.type)) {
			agg.cashDelta += debit - credit;
		}
		if (meta?.type === "expense") agg.expenseDelta += debit - credit;
		if (code === OPENING_EQUITY_COA) agg.isOpening = true;
		entries.set(l.entry_id, agg);

		if (meta?.type === "revenue") {
			revenueByMonth.set(ym, (revenueByMonth.get(ym) ?? 0) + credit - debit);
		} else if (meta?.type === "expense") {
			const amount = debit - credit;
			expenseByMonth.set(ym, (expenseByMonth.get(ym) ?? 0) + amount);
			const perAccount =
				expenseByMonthAccount.get(ym) ?? new Map<string, number>();
			perAccount.set(code, (perAccount.get(code) ?? 0) + amount);
			expenseByMonthAccount.set(ym, perAccount);
		}
	}

	// Kas: mutasi biasa vs jurnal saldo awal, dipisah per bulan.
	const inflowByMonth = new Map<string, number>();
	const outflowByMonth = new Map<string, number>();
	/** Bagian uang keluar yang benar-benar jadi biaya bulan itu. */
	const expenseCashOutByMonth = new Map<string, number>();
	const openingCashByMonth = new Map<string, number>();
	const openingEntryMonths = new Set<string>();
	// Untuk saldo awal: total mutasi kas sebelum sebuah bulan.
	const cashDeltaByMonth = new Map<string, number>();

	for (const agg of entries.values()) {
		const ym = agg.date.slice(0, 7);
		cashDeltaByMonth.set(ym, (cashDeltaByMonth.get(ym) ?? 0) + agg.cashDelta);
		if (agg.isOpening) {
			openingEntryMonths.add(ym);
			openingCashByMonth.set(
				ym,
				(openingCashByMonth.get(ym) ?? 0) + agg.cashDelta,
			);
			continue;
		}
		if (agg.cashDelta > 0) {
			inflowByMonth.set(ym, (inflowByMonth.get(ym) ?? 0) + agg.cashDelta);
		} else if (agg.cashDelta < 0) {
			const out = -agg.cashDelta;
			outflowByMonth.set(ym, (outflowByMonth.get(ym) ?? 0) + out);
			// Uang keluar untuk biaya = sebesar beban di jurnal yang sama, tapi tak
			// boleh lebih besar dari uang yang benar-benar keluar (mis. jurnal
			// campuran: bayar utang + biaya admin).
			const forExpense = Math.min(out, Math.max(0, agg.expenseDelta));
			expenseCashOutByMonth.set(
				ym,
				(expenseCashOutByMonth.get(ym) ?? 0) + forExpense,
			);
		}
	}

	// Settlement per bulan (laba event yang ditutup).
	const settledByMonth = new Map<string, { total: number; count: number }>();
	for (const s of settlementsData ?? []) {
		if (typeof s.closed_at !== "string") continue;
		const ym = s.closed_at.slice(0, 7);
		const cur = settledByMonth.get(ym) ?? { total: 0, count: 0 };
		cur.total += Number(s.net_profit ?? 0);
		cur.count += 1;
		settledByMonth.set(ym, cur);
	}

	// Daftar bulan: dari bulan cutoff (atau jurnal paling awal) s/d bulan ini.
	const allYms = Array.from(
		new Set([
			...cashDeltaByMonth.keys(),
			...revenueByMonth.keys(),
			...expenseByMonth.keys(),
			...settledByMonth.keys(),
		]),
	).sort();
	const firstYm = cutoffDate
		? cutoffDate.slice(0, 7)
		: (allYms[0] ?? ymOf(new Date()));
	const thisYm = ymOf(new Date());
	const months: string[] = [];
	for (let ym = firstYm; ym <= thisYm; ym = addMonths(ym, 1)) months.push(ym);
	// Jaga-jaga kalau ada jurnal bertanggal masa depan.
	for (const ym of allYms)
		if (!months.includes(ym) && ym >= firstYm) months.push(ym);
	// Buku belum mulai (cutoff di masa depan / belum ada jurnal): tetap sediakan
	// bulan berjalan supaya pemilih bulannya tidak kosong.
	if (months.length === 0) months.push(thisYm);
	months.sort();

	function buildRow(ym: string): MonthlyRow {
		const { start } = monthBounds(ym);
		// Saldo awal = seluruh mutasi kas sebelum bulan ini + kas dari jurnal
		// saldo awal yang jatuh DI bulan ini (cutoff pembukuan).
		let opening = 0;
		for (const [m, delta] of cashDeltaByMonth) {
			if (`${m}-01` < start) opening += delta;
		}
		opening += openingCashByMonth.get(ym) ?? 0;
		const inflow = inflowByMonth.get(ym) ?? 0;
		const outflow = outflowByMonth.get(ym) ?? 0;
		const revenue = revenueByMonth.get(ym) ?? 0;
		const expense = expenseByMonth.get(ym) ?? 0;
		const settled = settledByMonth.get(ym) ?? { total: 0, count: 0 };
		return {
			ym,
			label: monthLabel(ym),
			opening,
			inflow,
			outflow,
			closing: opening + inflow - outflow,
			revenue,
			expense,
			profitBook: revenue - expense,
			profitSettled: settled.total,
			settledCount: settled.count,
			hasOpeningEntry: openingEntryMonths.has(ym),
		};
	}

	const fallbackYm = months.includes(thisYm)
		? thisYm
		: (months[months.length - 1] ?? thisYm);
	const ym =
		requestedYm && /^\d{4}-\d{2}$/.test(requestedYm) ? requestedYm : fallbackYm;
	const current = buildRow(ym);

	// Rincian pengeluaran bulan terpilih, dikelompokkan ke bahasa owner.
	const perAccount = expenseByMonthAccount.get(ym) ?? new Map<string, number>();
	const groupMap = new Map<ExpenseGroupKey, ExpenseGroupRow>();
	for (const [code, amount] of perAccount) {
		if (amount === 0) continue;
		const key = expenseGroupFor(code);
		const row = groupMap.get(key) ?? {
			key,
			label: EXPENSE_GROUP_LABEL[key],
			amount: 0,
			accounts: [],
		};
		row.amount += amount;
		row.accounts.push({
			code,
			name: coa.get(code)?.name ?? code,
			amount,
		});
		groupMap.set(key, row);
	}
	const expenseGroups = Array.from(groupMap.values())
		.map((g) => ({
			...g,
			accounts: g.accounts.sort((a, b) => b.amount - a.amount),
		}))
		.sort((a, b) => b.amount - a.amount);

	const idx = months.indexOf(ym);
	const history = months
		.slice(Math.max(0, months.length - 12))
		.map(buildRow)
		.reverse();

	return {
		months,
		current,
		prevYm: idx > 0 ? months[idx - 1] : null,
		nextYm: idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null,
		expenseGroups,
		outflowForExpense: expenseCashOutByMonth.get(ym) ?? 0,
		outflowNonExpense: Math.max(
			0,
			current.outflow - (expenseCashOutByMonth.get(ym) ?? 0),
		),
		history,
		cutoffDate,
		beforeBooks: Boolean(cutoffDate && ym < cutoffDate.slice(0, 7)),
	};
}
