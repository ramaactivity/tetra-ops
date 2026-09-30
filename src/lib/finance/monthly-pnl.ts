import "server-only";

import { fetchAllJournalLines } from "@/lib/finance/balance-guard";
import {
	EXPENSE_GROUP_LABEL,
	type ExpenseGroupKey,
	expenseGroupFor,
} from "@/lib/finance/monthly-data";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Untung-rugi SATU BULAN versi "per event" (akrual) — jawaban untuk "bulan ini
 * sebenarnya untung berapa?".
 *
 * Buku besar mengakui pendapatan saat uang DITERIMA (cash basis): DP event
 * Oktober yang dibayar di September ikut jadi pendapatan September. Itu benar
 * untuk arus kas, tapi menyesatkan untuk untung — biaya event Oktober baru
 * keluar di Oktober. Di sini pendapatan & biaya dipasangkan per EVENT:
 *
 *   Pendapatan event bulan ini (event_date di bulan ini, sudah settle)
 *   − bahan & crew/jalan/komisi (dari settlement)
 *   − biaya lain yang dicatat terpisah untuk event itu (Catat + pilih event)
 *   = untung dari event
 *   − biaya bulanan yang tidak terkait event (kost, platform, expo, stok hilang…)
 *   + pemasukan lain yang tidak terkait event
 *   = untung bersih bulan ini
 *
 * Event yang belum di-settle BELUM dihitung (angkanya belum final) — disebut
 * terpisah supaya tidak dikira hilang.
 */

export type PnlEvent = {
	projectId: string;
	name: string;
	date: string;
	revenue: number;
	hpp: number;
	opex: number;
	extra: number;
	profit: number;
};

export type OverheadGroup = {
	key: ExpenseGroupKey;
	label: string;
	amount: number;
};

export type MonthlyPnl = {
	ym: string;
	events: PnlEvent[];
	/** Event bulan ini yang belum di-settle — belum masuk hitungan. */
	pending: Array<{
		projectId: string;
		name: string;
		date: string;
		grandTotal: number;
	}>;
	revenue: number;
	hpp: number;
	opex: number;
	/** Biaya lain event (bersih: keluar − masuk) yang dicatat di luar settle. */
	eventExtra: number;
	eventProfit: number;
	overhead: number;
	overheadGroups: OverheadGroup[];
	otherIncome: number;
	net: number;
	/** Uang dari klien yang MASUK bulan ini, dipilah menurut bulan eventnya. */
	clientCash: { sameMonth: number; futureEvents: number; pastEvents: number };
};

type Rel<T> = T | T[] | null;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Line = {
	account_code: string;
	debit_amount: number | string;
	credit_amount: number | string;
	entry: Rel<{
		entry_date: string;
		source_type: string;
		source_event_id: string | null;
		event: Rel<{ event_date: string }>;
	}>;
};

const LINE_COLS = `account_code, debit_amount, credit_amount,
	entry:journal_entries!journal_lines_entry_id_fkey!inner(
		entry_date, source_type, source_event_id,
		event:events!journal_entries_source_event_id_fkey(event_date)
	)`;

export async function getMonthlyPnl(
	supabase: ServerSupabase,
	ym: string,
): Promise<MonthlyPnl> {
	const [y, m] = ym.split("-").map(Number);
	const start = `${ym}-01`;
	const end = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

	const { data: evRows } = await supabase
		.from("events")
		.select(
			`id, project_id, client_name, event_date, grand_total,
			 settlement:event_settlements(revenue_net, hpp_total, opex_total, net_profit, is_reopened)`,
		)
		.gte("event_date", start)
		.lte("event_date", end)
		.neq("status", "cancelled")
		.is("deleted_at", null)
		.order("event_date");

	type SettleRow = {
		revenue_net: number;
		hpp_total: number;
		opex_total: number;
		is_reopened: boolean;
	};
	const settled = new Map<string, PnlEvent>();
	const pending: MonthlyPnl["pending"] = [];
	for (const e of evRows ?? []) {
		// UNIQUE FK → PostgREST mengembalikan objek, bukan array.
		const s = one(e.settlement as Rel<SettleRow>);
		if (s && !s.is_reopened) {
			settled.set(e.id as string, {
				projectId: e.project_id as string,
				name: e.client_name as string,
				date: e.event_date as string,
				revenue: Number(s.revenue_net ?? 0),
				hpp: Number(s.hpp_total ?? 0),
				opex: Number(s.opex_total ?? 0),
				extra: 0,
				profit: 0,
			});
		} else {
			pending.push({
				projectId: e.project_id as string,
				name: e.client_name as string,
				date: e.event_date as string,
				grandTotal: Number(e.grand_total ?? 0),
			});
		}
	}

	const settledIds = [...settled.keys()];
	const [monthLines, extraLines, { data: coaRows }] = await Promise.all([
		fetchAllJournalLines<Line>(supabase, LINE_COLS, (q) =>
			q.gte("entry.entry_date", start).lte("entry.entry_date", end),
		),
		settledIds.length > 0
			? fetchAllJournalLines<Line>(supabase, LINE_COLS, (q) =>
					q.in("entry.source_event_id", settledIds),
				)
			: Promise.resolve([] as Line[]),
		supabase.from("chart_of_accounts").select("code, account_type"),
	]);
	const typeOf = new Map(
		(coaRows ?? []).map((c) => [c.code as string, c.account_type as string]),
	);
	const isCash = (code: string) =>
		typeOf.get(code) === "asset" && /^1-1\d{2}$/.test(code);

	// Biaya/pemasukan lain yang ditautkan ke event bulan ini (tanggal catat bebas).
	for (const l of extraLines) {
		const e = one(l.entry);
		if (!e?.source_event_id) continue;
		if (e.source_type === "settlement" || e.source_type === "payment") continue;
		const ev = settled.get(e.source_event_id);
		if (!ev) continue;
		const t = typeOf.get(l.account_code);
		const d = Number(l.debit_amount) - Number(l.credit_amount);
		if (t === "expense" || t === "revenue") ev.extra += d;
	}

	let overhead = 0;
	let otherIncome = 0;
	const groups = new Map<ExpenseGroupKey, number>();
	const clientCash = { sameMonth: 0, futureEvents: 0, pastEvents: 0 };
	for (const l of monthLines) {
		const e = one(l.entry);
		if (!e) continue;
		const code = l.account_code;
		const t = typeOf.get(code);
		const d = Number(l.debit_amount) - Number(l.credit_amount);

		if (e.source_type === "payment") {
			if (isCash(code)) {
				const evMonth = one(e.event)?.event_date?.slice(0, 7) ?? ym;
				const k =
					evMonth === ym
						? "sameMonth"
						: evMonth > ym
							? "futureEvents"
							: "pastEvents";
				clientCash[k] += d;
			}
			continue;
		}
		// Settlement & apa pun yang tertaut ke event sudah dihitung per event.
		if (e.source_type === "settlement" || e.source_event_id) continue;
		if (t === "expense") {
			overhead += d;
			const g = expenseGroupFor(code);
			groups.set(g, (groups.get(g) ?? 0) + d);
		} else if (t === "revenue") {
			otherIncome -= d;
		}
	}

	const events = [...settled.values()].map((e) => ({
		...e,
		profit: e.revenue - e.hpp - e.opex - e.extra,
	}));
	const sum = (k: "revenue" | "hpp" | "opex" | "extra" | "profit") =>
		events.reduce((s, e) => s + e[k], 0);
	const eventProfit = sum("profit");

	return {
		ym,
		events,
		pending,
		revenue: sum("revenue"),
		hpp: sum("hpp"),
		opex: sum("opex"),
		eventExtra: sum("extra"),
		eventProfit,
		overhead,
		overheadGroups: [...groups.entries()]
			.filter(([, v]) => Math.round(v) !== 0)
			.map(([key, amount]) => ({
				key,
				label: EXPENSE_GROUP_LABEL[key],
				amount,
			}))
			.sort((a, b) => b.amount - a.amount),
		otherIncome,
		net: eventProfit - overhead + otherIncome,
		clientCash,
	};
}
