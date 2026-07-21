import { redirect } from "next/navigation";
import { BalanceSheetTable } from "@/components/finance/reports/balance-sheet-table";
import { ProfitLossTable } from "@/components/finance/reports/profit-loss-table";
import { ReportDateFilter } from "@/components/finance/reports/report-date-filter";
import { ReportsTabs } from "@/components/finance/reports/reports-tabs";
import {
	type AccountAggregate,
	type CoaMeta,
	TrialBalanceTable,
} from "@/components/finance/reports/trial-balance-table";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { InfoHint } from "@/components/ui/info-hint";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { fetchAllJournalLines } from "@/lib/finance/balance-guard";

type Tab = "trial" | "pnl" | "neraca";

export default async function FinanceReportsPage({
	searchParams,
}: {
	searchParams: Promise<{
		report?: string;
		from?: string;
		to?: string;
		asOf?: string;
	}>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/finance");
	}

	const params = await searchParams;
	const tab: Tab =
		params.report === "pnl"
			? "pnl"
			: params.report === "neraca"
				? "neraca"
				: "trial";
	const from = params.from;
	const to = params.to;
	const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);

	const supabase = await createClient();

	// Fetch once: all COA + all non-reversed journal_lines joined to entries
	const [{ data: coaData }, { data: linesData }] = await Promise.all([
		supabase
			.from("chart_of_accounts")
			.select("code, name, account_type")
			.eq("is_active", true)
			.order("code"),
		fetchAllJournalLines(
			supabase,
			`account_code, debit_amount, credit_amount,
				 entry:journal_entries!journal_lines_entry_id_fkey(entry_date, is_reversed)`,
		).then((d) => ({ data: d })),
	]);

	const accounts: CoaMeta[] = (coaData ?? []).map((c) => ({
		code: c.code as string,
		name: c.name as string,
		account_type: c.account_type as string,
	}));

	type RawLine = {
		account_code: string;
		debit_amount: number | string;
		credit_amount: number | string;
		entry:
			| { entry_date: string; is_reversed: boolean }
			| { entry_date: string; is_reversed: boolean }[]
			| null;
	};
	const allLines = ((linesData ?? []) as RawLine[])
		.map((l) => {
			const e = Array.isArray(l.entry) ? l.entry[0] : l.entry;
			if (!e) return null;
			return {
				account_code: l.account_code,
				debit_amount: Number(l.debit_amount),
				credit_amount: Number(l.credit_amount),
				entry_date: e.entry_date,
				is_reversed: e.is_reversed,
			};
		})
		// Keep BOTH a reversed entry and its 'reversal' counter — they net to
		// zero, exactly like the per-account ledger drill-down does. (Skipping
		// only the is_reversed original would leave the counter behind → phantom
		// negative balance, and would disagree with the ledger page.)
		.filter(
			(
				v,
			): v is {
				account_code: string;
				debit_amount: number;
				credit_amount: number;
				entry_date: string;
				is_reversed: boolean;
			} => v !== null,
		);

	// Range filter logic differs per report:
	//  - Trial balance: movements within [from, to] (or all if no filter)
	//  - P&L: revenue/expense movements within [from, to]
	//  - Neraca: cumulative balance up to and including asOf
	function withinRange(lineDate: string, _from?: string, _to?: string) {
		if (_from && lineDate < _from) return false;
		if (_to && lineDate > _to) return false;
		return true;
	}
	function uptoDate(lineDate: string, asOfDate: string) {
		return lineDate <= asOfDate;
	}

	function aggregate(filterFn: (d: string) => boolean): AccountAggregate[] {
		const totals = new Map<string, { debit: number; credit: number }>();
		for (const l of allLines) {
			if (!filterFn(l.entry_date)) continue;
			const cur = totals.get(l.account_code) ?? { debit: 0, credit: 0 };
			cur.debit += l.debit_amount;
			cur.credit += l.credit_amount;
			totals.set(l.account_code, cur);
		}
		return accounts
			.filter((a) => totals.has(a.code))
			.map((a) => {
				const t = totals.get(a.code)!;
				const debit = t.debit;
				const credit = t.credit;
				// Balance sign convention follows account type:
				//   asset/expense → debit-credit
				//   liability/equity/revenue → credit-debit
				const balance =
					a.account_type === "asset" || a.account_type === "expense"
						? debit - credit
						: credit - debit;
				return {
					code: a.code,
					name: a.name,
					account_type: a.account_type,
					debit,
					credit,
					balance,
				};
			})
			.sort((x, y) => x.code.localeCompare(y.code));
	}

	const trialAggregates = aggregate((d) => withinRange(d, from, to));
	const pnlAggregates = aggregate((d) => withinRange(d, from, to)).filter(
		(a) => a.account_type === "revenue" || a.account_type === "expense",
	);
	const neracaAggregates = aggregate((d) => uptoDate(d, asOf));

	// For Neraca: also compute retained earnings = revenue - expense (all-time up to asOf)
	// because revenue/expense accounts don't directly show on balance sheet.
	const revenueTotal = neracaAggregates
		.filter((a) => a.account_type === "revenue")
		.reduce((s, a) => s + a.balance, 0);
	const expenseTotal = neracaAggregates
		.filter((a) => a.account_type === "expense")
		.reduce((s, a) => s + a.balance, 0);
	const retainedEarnings = revenueTotal - expenseTotal;

	// Judul + penjelasan per report — dirender sebagai header card toolbar,
	// bukan teks mengambang di atas card (konsep bento).
	const reportMeta: Record<
		Tab,
		{ title: string; hintTitle: string; hint: string; desc: string }
	> = {
		trial: {
			title: "Neraca Saldo",
			hintTitle: "Neraca Saldo (Trial Balance)",
			hint: "Daftar semua akun + saldonya. Total Debit harus sama dengan total Kredit — bukti pembukuan seimbang & tak ada salah catat.",
			desc: "Pengecekan keseimbangan pembukuan",
		},
		pnl: {
			title: "Laba / Rugi",
			hintTitle: "Laba / Rugi",
			hint: "Pendapatan dikurangi semua biaya (bahan, fee crew, operasional) = untung atau rugi pada periode ini.",
			desc: "Untung/rugi periode terpilih",
		},
		neraca: {
			title: "Neraca",
			hintTitle: "Neraca (Balance Sheet)",
			hint: "Potret posisi keuangan pada satu tanggal: yang dimiliki (aset) = yang masih harus dibayar (kewajiban) + milik owner (modal).",
			desc: "Posisi keuangan pada tanggal tertentu",
		},
	};
	const meta = reportMeta[tab];

	return (
		<Container size="xl" className="space-y-3">
			{/* Tab switcher teleport ke topbar (slot #topbar-actions) */}
			<SectionHeader
				title="Laporan Keuangan"
				actions={<ReportsTabs current={tab} />}
			/>

			<section className="border-border-subtle bg-card overflow-hidden rounded-[16px] border shadow-[var(--shadow-level-2)]">
				<div className="border-border-subtle flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b px-4 py-2.5">
					<h2 className="font-heading flex min-w-0 items-center gap-1 text-[15px] font-semibold tracking-tight">
						<span className="truncate">{meta.title}</span>
						<InfoHint title={meta.hintTitle}>{meta.hint}</InfoHint>
					</h2>
					<span className="text-muted-foreground text-xs">{meta.desc}</span>
				</div>
				<div className="px-4 py-3">
					<ReportDateFilter
						mode={tab === "neraca" ? "as-of" : "range"}
						defaultFrom={from}
						defaultTo={to}
						defaultAsOf={asOf}
					/>
				</div>
			</section>

			{tab === "trial" && (
				<TrialBalanceTable rows={trialAggregates} from={from} to={to} />
			)}
			{tab === "pnl" && (
				<ProfitLossTable rows={pnlAggregates} from={from} to={to} />
			)}
			{tab === "neraca" && (
				<BalanceSheetTable
					rows={neracaAggregates}
					retainedEarnings={retainedEarnings}
					asOf={asOf}
				/>
			)}
		</Container>
	);
}
