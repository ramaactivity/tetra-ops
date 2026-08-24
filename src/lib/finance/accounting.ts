/**
 * Shared accounting vocabulary + balance math for the Finance/Akuntansi
 * surfaces. One module so the landing, the Bagan Akun, the Buku Besar, and
 * the Laporan all speak the same language: same labels, same sign convention,
 * same way of turning raw journal_lines into account balances.
 *
 * Pure functions + constants only — safe to import from server components and
 * client components alike.
 */

export type AccountType =
	| "asset"
	| "liability"
	| "equity"
	| "revenue"
	| "expense";

/** Indonesian display label per account class. */
export const TYPE_LABEL: Record<string, string> = {
	asset: "Aset",
	liability: "Kewajiban",
	equity: "Ekuitas",
	revenue: "Pendapatan",
	expense: "Beban",
};

/** Plain-language, owner-first one-liner for each class. */
export const TYPE_MEANING: Record<string, string> = {
	asset: "Yang dimiliki bisnis",
	liability: "Yang masih harus dibayar",
	equity: "Modal & laba ditahan",
	revenue: "Uang masuk dari penjualan",
	expense: "Biaya yang keluar",
};

/** Canonical ordering for grouped views (balance-sheet then P&L). */
export const TYPE_ORDER: readonly AccountType[] = [
	"asset",
	"liability",
	"equity",
	"revenue",
	"expense",
];

/** Which side increases the account — asset/expense are debit-normal. */
export function normalSide(accountType: string): "debit" | "credit" {
	return accountType === "asset" || accountType === "expense"
		? "debit"
		: "credit";
}

/**
 * Signed balance for an account given its lifetime debit/credit totals.
 * Positive always means "in the account's normal direction".
 */
export function balanceForType(
	accountType: string,
	debit: number,
	credit: number,
): number {
	return normalSide(accountType) === "debit" ? debit - credit : credit - debit;
}

/**
 * Kas & setara kas — the most liquid slice of assets. Indonesian COA
 * convention used in this seed: 1-1xx = Kas & Bank (1-100 Kas Tunai,
 * 1-11x bank accounts), while 1-2xx = Persediaan, 1-5/6xx = aset tetap.
 */
export function isCashOrBank(code: string, accountType: string): boolean {
	return accountType === "asset" && /^1-1\d{2}$/.test(code);
}

/**
 * Dari mana sebuah jurnal berasal — bahasa awam untuk owner (non-akuntan).
 * DB tetap pakai kode mesin (settlement, owner_withdrawal, dst); ini hanya
 * label tampilan. Tambahkan entri baru di sini saat ada source_type baru,
 * jangan biarkan kode mentah (snake_case) bocor ke UI.
 */
export const SOURCE_LABEL: Record<string, string> = {
	settlement: "Hasil event",
	settlement_reversal: "Pembatalan hasil event",
	purchase: "Pembelian",
	payment: "Pembayaran klien",
	manual: "Catat manual",
	sinking_fund: "Dana cadangan",
	stock_take: "Stok opname",
	depreciation: "Penyusutan aset",
	owner_withdrawal: "Ambil bagi hasil",
	owner_pool_correction: "Koreksi bagi hasil",
	crew_payment: "Bayar fee crew",
	commission_payment: "Bayar komisi",
	commission_payment_reversal: "Pembatalan bayar komisi",
	wastage: "Barang rusak/hilang",
	balance_transfer: "Pindah saldo",
	emoney_recount: "Cocokkan saldo kartu",
};

/**
 * Jenis jurnal (sifat debit/kredit). Pakai istilah bisnis Indonesia yang
 * standar & konsisten dgn Laporan Laba/Rugi (Pendapatan/Beban) — bukan istilah
 * mesin. "Pembalik" diperhalus jadi "Pembatalan".
 */
export const ENTRY_TYPE_LABEL: Record<string, string> = {
	revenue: "Pendapatan",
	expense: "Beban",
	asset_in: "Aset masuk",
	asset_out: "Aset keluar",
	transfer: "Transfer",
	adjustment: "Koreksi",
	reversal: "Pembatalan",
};

// ── Judul transaksi yang enak dibaca ───────────────────────────────────

/** Kata yang dipakai owner untuk tiap tipe pembayaran klien. */
const PAYMENT_TYPE_WORD: Record<string, string> = {
	dp: "DP",
	partial: "Pembayaran sebagian",
	pelunasan: "Pelunasan",
};

/**
 * Rapikan angka kuantitas yang ditulis mesin: "187.0000 pcs" → "187 pcs",
 * "2.5000 pcs" → "2,5 pcs" (koma desimal, sesuai cara baca Indonesia).
 *
 * Dikunci ke TEPAT 4 angka desimal — itu bentuk numeric(_,4) yang ditulis DB.
 * Tanpa batas itu, "Rp1.500.000" ikut tercacah jadi "Rp1,5.000": di teks
 * Indonesia titik juga dipakai sebagai pemisah ribuan. Pola 4-desimal tidak
 * pernah cocok dengan angka ribuan (tiap kelompoknya cuma 3 digit).
 */
function tidyQuantities(text: string): string {
	return text.replace(
		/(\d+)\.(\d{4})\b/g,
		(_whole, intPart: string, frac: string) => {
			const trimmed = frac.replace(/0+$/, "");
			return trimmed ? `${intPart},${trimmed}` : intPart;
		},
	);
}

export type EntryTitleInput = {
	source_type: string;
	description: string;
	event_name: string | null;
	/** Tipe pembayaran klien (dp/partial/pelunasan), kalau entry-nya payment. */
	payment_type?: string | null;
};

/**
 * Judul satu baris jurnal dalam bahasa manusia.
 *
 * Deskripsi mentah dari DB kadang berbicara dalam kode mesin — "Pembayaran
 * klien PAY-20260804-0104" tidak memberi tahu siapa yang bayar dan berapa
 * jenis pembayarannya. Fungsi ini menyusun kalimat yang bisa dibaca sekali
 * lihat; deskripsi aslinya TIDAK dibuang (tetap ditampilkan sebagai baris
 * kecil dan tetap bisa dicari), jadi jejak auditnya utuh.
 */
export function humanEntryTitle(entry: EntryTitleInput): string {
	if (entry.source_type === "payment" && entry.event_name) {
		const word = entry.payment_type
			? (PAYMENT_TYPE_WORD[entry.payment_type] ?? "Pembayaran")
			: "Pembayaran";
		return `${word} dari ${entry.event_name}`;
	}
	if (entry.source_type === "wastage" || entry.source_type === "stock_take") {
		return tidyQuantities(entry.description);
	}
	return entry.description;
}

export type CoaMeta = {
	code: string;
	name: string;
	account_type: string;
};

export type LineForBalance = {
	account_code: string;
	debit_amount: number;
	credit_amount: number;
};

export type AccountAggregate = {
	code: string;
	name: string;
	account_type: string;
	debit: number;
	credit: number;
	balance: number;
};

/**
 * Fold journal_lines into per-account debit/credit/balance totals.
 *
 * Note on reversals: pass ALL lines, including those on reversed entries and
 * their pembalik counter-entries. They net to zero, exactly like the ledger
 * drill-down — skipping only the reversed original would orphan the counter
 * and produce a phantom balance.
 */
export function aggregateBalances(
	accounts: CoaMeta[],
	lines: LineForBalance[],
): AccountAggregate[] {
	const totals = new Map<string, { debit: number; credit: number }>();
	for (const l of lines) {
		const cur = totals.get(l.account_code) ?? { debit: 0, credit: 0 };
		cur.debit += l.debit_amount;
		cur.credit += l.credit_amount;
		totals.set(l.account_code, cur);
	}
	return accounts
		.map((a) => {
			const t = totals.get(a.code) ?? { debit: 0, credit: 0 };
			return {
				code: a.code,
				name: a.name,
				account_type: a.account_type,
				debit: t.debit,
				credit: t.credit,
				balance: balanceForType(a.account_type, t.debit, t.credit),
			};
		})
		.sort((x, y) => x.code.localeCompare(y.code));
}

export type PositionSummary = {
	assets: number;
	liabilities: number;
	equityBooked: number;
	revenue: number;
	expense: number;
	netIncome: number;
	/** Booked equity + net income (laba berjalan). */
	equity: number;
	cash: number;
	totalDebit: number;
	totalCredit: number;
	/** assets − (liabilities + equity); ~0 when the books balance. */
	equationDiff: number;
	/** Trial-balance identity: total debit === total credit. */
	booksBalanced: boolean;
};

/**
 * Roll account aggregates up into the financial-position snapshot the owner
 * reads first: total assets, the cash slice, and the accounting equation
 * (Aset = Kewajiban + Ekuitas, with net income folded into equity).
 */
export function summarizePosition(
	aggregates: AccountAggregate[],
): PositionSummary {
	let assets = 0;
	let liabilities = 0;
	let equityBooked = 0;
	let revenue = 0;
	let expense = 0;
	let cash = 0;
	let totalDebit = 0;
	let totalCredit = 0;

	for (const a of aggregates) {
		totalDebit += a.debit;
		totalCredit += a.credit;
		switch (a.account_type) {
			case "asset":
				assets += a.balance;
				if (isCashOrBank(a.code, a.account_type)) cash += a.balance;
				break;
			case "liability":
				liabilities += a.balance;
				break;
			case "equity":
				equityBooked += a.balance;
				break;
			case "revenue":
				revenue += a.balance;
				break;
			case "expense":
				expense += a.balance;
				break;
		}
	}

	const netIncome = revenue - expense;
	const equity = equityBooked + netIncome;

	return {
		assets,
		liabilities,
		equityBooked,
		revenue,
		expense,
		netIncome,
		equity,
		cash,
		totalDebit,
		totalCredit,
		equationDiff: assets - (liabilities + equity),
		booksBalanced: totalDebit === totalCredit,
	};
}
