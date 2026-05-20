import { ArrowDownLeft, ArrowUpRight, Calendar, Wallet2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerDateFilter } from "@/components/finance/accounting/ledger-date-filter";
import {
	LedgerTable,
	type LedgerRow,
} from "@/components/finance/accounting/ledger-table";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABEL: Record<string, string> = {
	asset: "Aset",
	liability: "Kewajiban",
	equity: "Ekuitas",
	revenue: "Pendapatan",
	expense: "Beban",
};

const TYPE_TONE: Record<string, string> = {
	asset:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	liability:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	equity: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	revenue:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	expense: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

/**
 * Determine which side increases the account balance.
 *   asset, expense → debit normal (debit increases)
 *   liability, equity, revenue → credit normal (credit increases)
 */
function balanceForType(
	accountType: string,
	debit: number,
	credit: number,
): number {
	if (accountType === "asset" || accountType === "expense") {
		return debit - credit;
	}
	return credit - debit;
}

export default async function LedgerPage({
	params,
	searchParams,
}: {
	params: Promise<{ code: string }>;
	searchParams: Promise<{ from?: string; to?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/finance");
	}

	const { code } = await params;
	const { from, to } = await searchParams;

	const supabase = await createClient();

	const { data: account } = await supabase
		.from("chart_of_accounts")
		.select("code, name, account_type, description, is_active")
		.eq("code", code)
		.maybeSingle();
	if (!account) notFound();

	// Fetch all journal_lines for this account, joined with entry header.
	// We need entry_date, ref_id, description, source_type, is_reversed
	// to display each row contextually.
	let q = supabase
		.from("journal_lines")
		.select(
			`id, account_code, debit_amount, credit_amount, description, line_order,
			 entry:journal_entries!journal_lines_entry_id_fkey(
				 id, ref_id, entry_date, entry_type, description, source_type, source_id, is_reversed
			 )`,
		)
		.eq("account_code", code)
		.order("line_order", { ascending: true });
	const { data: rawLines } = await q;

	type RawLine = {
		id: string;
		account_code: string;
		debit_amount: number | string;
		credit_amount: number | string;
		description: string | null;
		line_order: number;
		entry:
			| {
					id: string;
					ref_id: string;
					entry_date: string;
					entry_type: string;
					description: string;
					source_type: string;
					source_id: string | null;
					is_reversed: boolean;
			  }
			| {
					id: string;
					ref_id: string;
					entry_date: string;
					entry_type: string;
					description: string;
					source_type: string;
					source_id: string | null;
					is_reversed: boolean;
			  }[]
			| null;
	};

	// Flatten + apply date filter at JS level (filter on FK column via Supabase is awkward)
	const all = ((rawLines ?? []) as RawLine[])
		.map((l) => {
			const e = Array.isArray(l.entry) ? l.entry[0] : l.entry;
			if (!e) return null;
			return {
				line_id: l.id,
				entry_id: e.id,
				ref_id: e.ref_id,
				entry_date: e.entry_date,
				entry_type: e.entry_type,
				source_type: e.source_type,
				source_id: e.source_id,
				is_reversed: e.is_reversed,
				entry_description: e.description,
				line_description: l.description,
				debit_amount: Number(l.debit_amount),
				credit_amount: Number(l.credit_amount),
			};
		})
		.filter(
			(
				v,
			): v is {
				line_id: string;
				entry_id: string;
				ref_id: string;
				entry_date: string;
				entry_type: string;
				source_type: string;
				source_id: string | null;
				is_reversed: boolean;
				entry_description: string;
				line_description: string | null;
				debit_amount: number;
				credit_amount: number;
			} => v !== null,
		)
		// chronological for running balance
		.sort((a, b) => {
			const cmp = a.entry_date.localeCompare(b.entry_date);
			if (cmp !== 0) return cmp;
			return a.ref_id.localeCompare(b.ref_id);
		});

	// Apply date filter
	const filtered = all.filter((l) => {
		if (from && l.entry_date < from) return false;
		if (to && l.entry_date > to) return false;
		return true;
	});

	// Compute running balance per row using filtered rows
	const rows: LedgerRow[] = [];
	let balance = 0;
	// If we're filtering by from, compute opening balance from rows BEFORE from
	if (from) {
		for (const l of all) {
			if (l.entry_date >= from) break;
			balance += balanceForType(
				account.account_type as string,
				l.debit_amount,
				l.credit_amount,
			);
		}
	}
	for (const l of filtered) {
		const delta = balanceForType(
			account.account_type as string,
			l.debit_amount,
			l.credit_amount,
		);
		balance += delta;
		rows.push({
			...l,
			running_balance: balance,
		});
	}

	const totalDebit = filtered.reduce((s, l) => s + l.debit_amount, 0);
	const totalCredit = filtered.reduce((s, l) => s + l.credit_amount, 0);
	const endingBalance = balance;
	// Opening balance = balance before all filtered rows
	const openingBalance =
		filtered.length > 0 ? rows[0].running_balance - balanceForType(
			account.account_type as string,
			rows[0].debit_amount,
			rows[0].credit_amount,
		) : balance;

	const normalSide =
		account.account_type === "asset" || account.account_type === "expense"
			? "debit"
			: "credit";

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title={
					<span className="flex flex-wrap items-baseline gap-2">
						<span className="tabular text-muted-foreground">
							{account.code}
						</span>
						<span>{account.name}</span>
					</span>
				}
				backHref="/finance/accounting"
				backLabel="Akuntansi"
				description={
					<span className="flex flex-wrap items-center gap-2">
						<Badge
							variant="outline"
							className={
								TYPE_TONE[account.account_type as string] ?? ""
							}
						>
							{TYPE_LABEL[account.account_type as string] ?? account.account_type}
						</Badge>
						<Badge
							variant="outline"
							className={`h-5 px-1.5 text-[10px] uppercase ${
								normalSide === "debit"
									? "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300"
									: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
							}`}
						>
							normal {normalSide}
						</Badge>
						{account.description && (
							<span className="text-muted-foreground">
								{account.description}
							</span>
						)}
					</span>
				}
			/>

			<KpiRow className="lg:grid-cols-4">
				<KpiCard
					label="Saldo Akhir"
					value={`Rp ${endingBalance.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint={
						from || to
							? `dari ${rows.length} entry di periode`
							: `dari ${rows.length} entry total`
					}
					icon={Wallet2}
					accent={
						endingBalance > 0
							? "emerald"
							: endingBalance < 0
								? "rose"
								: "default"
					}
				/>
				{(from || to) && (
					<KpiCard
						label="Saldo Awal"
						value={`Rp ${openingBalance.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
						hint={from ? `per ${from}` : "sebelum periode"}
						icon={Calendar}
					/>
				)}
				<KpiCard
					label="Total Debit"
					value={`Rp ${totalDebit.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint={`${rows.filter((r) => r.debit_amount > 0).length} lines`}
					icon={ArrowDownLeft}
					accent="sky"
				/>
				<KpiCard
					label="Total Credit"
					value={`Rp ${totalCredit.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint={`${rows.filter((r) => r.credit_amount > 0).length} lines`}
					icon={ArrowUpRight}
					accent="amber"
				/>
			</KpiRow>

			<LedgerDateFilter defaultFrom={from} defaultTo={to} />

			{rows.length === 0 ? (
				<EmptyState
					icon={Wallet2}
					title="Belum ada movement"
					description={
						from || to
							? "Tidak ada journal_lines yang touch akun ini di periode terpilih."
							: "Akun ini belum pernah dipakai di jurnal manapun."
					}
				/>
			) : (
				<LedgerTable
					rows={rows}
					accountType={account.account_type as string}
				/>
			)}
		</Container>
	);
}
