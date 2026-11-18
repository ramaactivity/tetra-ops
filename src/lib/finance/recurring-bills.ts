import type { SupabaseClient } from "@supabase/supabase-js";
import { todayWIB } from "@/lib/dates";
import { findCategory } from "@/lib/finance/quick-record-categories";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/**
 * Tagihan rutin (owner 18 Nov 2026): kost, wifi, Telkomsel, VPS, domain, bagi
 * hasil owner. SATU sumber untuk halaman Finance › Tagihan rutin, digest
 * Telegram, pesan grup WA, notifikasi lonceng, dan tool Hermes `langganan_app`.
 *
 * "Sudah dibayar" tidak diisi manual: dibaca dari jurnal Catat — kategori
 * (→ akun beban) + kata kunci di keterangan + bulan yang dibayar. Jadi cukup
 * Catat seperti biasa; tagihannya otomatis lunas. `manual_paid_due` hanya untuk
 * tagihan yang dibayar di luar kas Tetra. Bagi hasil owner membaca penarikan.
 */

export type BillCycle = "monthly" | "quarterly" | "yearly";

export type BillRow = {
	id: string;
	name: string;
	next_due: string | null;
	cycle: BillCycle;
	is_enabled: boolean;
	notes: string | null;
	amount: number | null;
	category_id: string | null;
	match_keyword: string | null;
	kind: "bill" | "bagi_hasil";
	manual_paid_due: string | null;
};

/** Jurnal Catat yang mungkin melunasi tagihan. */
export type PaidEntry = {
	ref: string;
	date: string;
	period: string | null; // yyyy-MM
	description: string;
	coa: string | null; // akun beban (baris debit 5-xxx)
};

export type BillStatus = {
	bill: BillRow;
	/** Jatuh tempo terdekat yang BELUM dibayar. */
	due: string;
	/** Bulan periode `due` (yyyy-MM) — dipakai prefill "Untuk bulan" di Catat. */
	period: string;
	/** due − hari ini; negatif = telat. */
	daysLeft: number;
	urgency: "telat" | "segera" | "nanti";
	/** Pembayaran terakhir yang cocok + jatuh tempo yang dilunasinya. */
	lastPaid: { date: string; ref: string | null; due: string } | null;
	remindToday: boolean;
};

// Sebelum jatuh tempo; setelahnya H+1, H+3, lalu SEMINGGU SEKALI selama belum
// dibayar (tidak pernah diam selamanya, tapi juga tidak tiap hari).
const MONTHLY_REMIND = new Set([3, 1, 0, -1, -3]);
const LONG_REMIND = new Set([30, 7, 3, 1, 0, -1, -3]);
const remindOn = (cycle: BillCycle, daysLeft: number) =>
	(cycle === "monthly" ? MONTHLY_REMIND : LONG_REMIND).has(daysLeft) ||
	(daysLeft < 0 && -daysLeft % 7 === 0);
const SEGERA_HARI: Record<BillCycle, number> = {
	monthly: 7,
	quarterly: 14,
	yearly: 30,
};

const ms = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
export const daysBetween = (fromISO: string, toISO: string) =>
	Math.round((ms(toISO) - ms(fromISO)) / 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (dateISO: string, n: number) =>
	iso(new Date(ms(dateISO) + n * 86_400_000));

/** Tanggal `day` di bulan `ym`, dipotong ke akhir bulan (31 → 30 Nov). */
function dayInMonth(ym: string, day: number): string {
	const [y, m] = ym.split("-").map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

function shiftMonths(ym: string, n: number): string {
	const [y, m] = ym.split("-").map(Number);
	const d = new Date(Date.UTC(y, m - 1 + n, 1));
	return iso(d).slice(0, 7);
}

/** Jatuh tempo berikutnya setelah `due` sesuai siklus (hari tetap). */
function nextCycleDue(due: string, cycle: BillCycle, day: number): string {
	const step = cycle === "yearly" ? 12 : cycle === "quarterly" ? 3 : 1;
	return dayInMonth(shiftMonths(due.slice(0, 7), step), day);
}

/** Apakah periode jatuh tempo `due` sudah dibayar? */
export function paidFor(
	bill: BillRow,
	due: string,
	entries: PaidEntry[],
	withdrawalDates: string[],
): { date: string; ref: string | null } | null {
	if (bill.manual_paid_due && bill.manual_paid_due >= due)
		return { date: bill.manual_paid_due, ref: null };
	const month = due.slice(0, 7);
	if (bill.kind === "bagi_hasil") {
		// Satu penarikan mengambil SEMUA jatah yang terkumpul → penarikan kapan
		// pun sejak jatuh tempo ini melunasi periode ini (dan sebelumnya).
		const d = withdrawalDates.filter((w) => w >= due).sort()[0];
		return d ? { date: d, ref: null } : null;
	}
	const kw = bill.match_keyword?.trim().toLowerCase();
	if (!kw) return null;
	const coa = findCategory(bill.category_id)?.coa ?? null;
	const lo = addDays(due, bill.cycle === "monthly" ? -25 : -60);
	const hi = addDays(due, bill.cycle === "monthly" ? 20 : 30);
	const hit = entries.find(
		(e) =>
			e.description.toLowerCase().includes(kw) &&
			(!coa || e.coa === coa) &&
			(e.period ? e.period === month : e.date >= lo && e.date <= hi),
	);
	return hit ? { date: hit.date, ref: hit.ref } : null;
}

/** Status satu tagihan per hari ini (WIB). null = belum ada jadwal. */
export function billStatus(
	bill: BillRow,
	entries: PaidEntry[],
	withdrawalDates: string[],
	today: string,
): BillStatus | null {
	if (!bill.next_due) return null;
	const day = Number(bill.next_due.slice(8, 10));
	// Mulai satu siklus SEBELUM jadwal tersimpan, lalu maju sampai ketemu
	// periode yang belum dibayar — bulan yang terlewat tetap tampil "telat",
	// tidak hilang begitu ganti bulan. Tandai lunas (manual_paid_due) melunasi
	// semua periode sampai tanggal itu.
	let due =
		bill.cycle === "monthly"
			? dayInMonth(shiftMonths(bill.next_due.slice(0, 7), -1), day)
			: bill.next_due;
	let lastPaid: BillStatus["lastPaid"] = null;
	for (let i = 0; i < 48; i++) {
		const paid = paidFor(bill, due, entries, withdrawalDates);
		if (!paid) break;
		lastPaid = { ...paid, due };
		due = nextCycleDue(due, bill.cycle, day);
	}
	const daysLeft = daysBetween(today, due);
	const urgency =
		daysLeft < 0
			? "telat"
			: daysLeft <= SEGERA_HARI[bill.cycle]
				? "segera"
				: "nanti";
	return {
		bill,
		due,
		period: due.slice(0, 7),
		daysLeft,
		urgency,
		lastPaid,
		remindToday: remindOn(bill.cycle, daysLeft),
	};
}

const tglPendek = (isoDate: string) =>
	new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});

/** Kalimat status singkat (dipakai web, Telegram, WA). */
export function dueLabel(
	s: Pick<BillStatus, "daysLeft" | "due"> & { bill?: Pick<BillRow, "kind"> },
): string {
	const tgl = tglPendek(s.due);
	// Bagi hasil bukan utang ke pihak luar — "belum diambil", bukan "telat".
	if (s.bill?.kind === "bagi_hasil" && s.daysLeft < 0)
		return `belum diambil sejak ${tgl}`;
	if (s.daysLeft < 0) return `telat ${-s.daysLeft} hari (jatuh tempo ${tgl})`;
	if (s.daysLeft === 0) return `jatuh tempo HARI INI (${tgl})`;
	if (s.daysLeft === 1) return `jatuh tempo besok (${tgl})`;
	if (s.daysLeft > 45)
		return `jatuh tempo ${new Date(`${s.due}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
	return `jatuh tempo ${s.daysLeft} hari lagi (${tgl})`;
}

/** Baris pengingat untuk grup (teks polos; pemanggil yang meng-escape). */
export function reminderLine(s: BillStatus): string {
	const nominal = s.bill.amount
		? ` · ±Rp${s.bill.amount.toLocaleString("id-ID")}`
		: "";
	return `${s.bill.name} — ${dueLabel(s)}${nominal}`;
}

/** Muat semua tagihan + statusnya. Error tidak ditelan (fail loud). */
export async function loadBillStatuses(
	supabase: SupabaseClient,
	today = todayWIB(),
): Promise<{ active: BillStatus[]; inactive: BillRow[] }> {
	const since = addDays(today, -450);
	const [billsRes, entryRows, wdRes] = await Promise.all([
		supabase
			.from("telegram_renewals")
			.select(
				"id, name, next_due, cycle, is_enabled, notes, amount, category_id, match_keyword, kind, manual_paid_due",
			)
			.order("next_due", { ascending: true, nullsFirst: false }),
		fetchAllRows<{
			ref_id: string;
			entry_date: string;
			period_month: string | null;
			description: string | null;
			lines: Array<{ account_code: string; debit_amount: number | string }>;
		}>(
			(from, to) =>
				supabase
					.from("journal_entries")
					.select(
						"ref_id, entry_date, period_month, description, lines:journal_lines(account_code, debit_amount)",
					)
					.gte("entry_date", since)
					.eq("is_reversed", false)
					.in("source_type", ["manual", "owner_patungan"])
					.order("entry_date", { ascending: false })
					.range(from, to),
			"jurnal tagihan rutin",
		),
		supabase
			.from("owner_earnings")
			.select("created_at")
			.eq("earning_type", "withdrawal")
			.gte("created_at", `${addDays(today, -120)}T00:00:00Z`),
	]);
	if (billsRes.error)
		throw new Error(`Gagal membaca tagihan rutin: ${billsRes.error.message}`);
	if (wdRes.error)
		throw new Error(`Gagal membaca bagi hasil: ${wdRes.error.message}`);

	const entries: PaidEntry[] = entryRows.map((r) => ({
		ref: r.ref_id,
		date: r.entry_date,
		period: r.period_month ? r.period_month.slice(0, 7) : null,
		description: r.description ?? "",
		coa:
			(r.lines ?? []).find(
				(l) => l.account_code.startsWith("5-") && Number(l.debit_amount) > 0,
			)?.account_code ?? null,
	}));
	// Tanggal penarikan versi WIB (created_at = UTC).
	const withdrawalDates = (wdRes.data ?? []).map((w) =>
		iso(new Date(new Date(w.created_at as string).getTime() + 7 * 3_600_000)),
	);

	const bills = (billsRes.data ?? []) as BillRow[];
	const active = bills
		.filter((b) => b.is_enabled)
		.map((b) => billStatus(b, entries, withdrawalDates, today))
		.filter((s): s is BillStatus => s !== null)
		.sort((a, b) => a.daysLeft - b.daysLeft);
	return { active, inactive: bills.filter((b) => !b.is_enabled) };
}
