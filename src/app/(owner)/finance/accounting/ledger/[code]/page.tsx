import { Wallet2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { LedgerDateFilter } from "@/components/finance/accounting/ledger-date-filter";
import {
	type LedgerRow,
	LedgerTable,
} from "@/components/finance/accounting/ledger-table";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	balanceForType,
	normalSide,
	TYPE_LABEL,
} from "@/lib/finance/accounting";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

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

	const accountType = account.account_type as string;

	// All journal_lines for this account, joined to entry header for context.
	const { data: rawLines } = await supabase
		.from("journal_lines")
		.select(
			`id, account_code, debit_amount, credit_amount, description, line_order,
			 entry:journal_entries!journal_lines_entry_id_fkey(
				 id, ref_id, entry_date, entry_type, description, source_type, source_id, is_reversed
			 )`,
		)
		.eq("account_code", code)
		.order("line_order", { ascending: true });

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

	type FlatLine = {
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
	};

	const all: FlatLine[] = ((rawLines ?? []) as RawLine[])
		.map((l): FlatLine | null => {
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
		.filter((v): v is FlatLine => v !== null)
		.sort((a, b) => {
			const cmp = a.entry_date.localeCompare(b.entry_date);
			return cmp !== 0 ? cmp : a.ref_id.localeCompare(b.ref_id);
		});

	const filtered = all.filter((l) => {
		if (from && l.entry_date < from) return false;
		if (to && l.entry_date > to) return false;
		return true;
	});

	// Running balance, with opening balance from rows before the `from` date.
	const rows: LedgerRow[] = [];
	let balance = 0;
	if (from) {
		for (const l of all) {
			if (l.entry_date >= from) break;
			balance += balanceForType(accountType, l.debit_amount, l.credit_amount);
		}
	}
	const openingBalance = balance;
	for (const l of filtered) {
		balance += balanceForType(accountType, l.debit_amount, l.credit_amount);
		rows.push({ ...l, running_balance: balance });
	}

	const totalDebit = filtered.reduce((s, l) => s + l.debit_amount, 0);
	const totalCredit = filtered.reduce((s, l) => s + l.credit_amount, 0);
	const endingBalance = balance;
	const side = normalSide(accountType);
	const periodLabel = from || to ? "di periode" : "sepanjang waktu";

	return (
		<Container size="xl" className="space-y-3">
			<PageHeader
				title={
					<span className="flex flex-wrap items-baseline gap-2.5">
						<span className="tabular text-muted-foreground">
							{account.code}
						</span>
						<span>{account.name}</span>
					</span>
				}
				backHref="/finance/accounting"
				backLabel="Akuntansi"
				description={
					<span className="flex flex-wrap items-center gap-2 text-[12px]">
						<span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-muted-foreground">
							{TYPE_LABEL[accountType] ?? accountType}
						</span>
						<span className="text-muted-foreground/50">·</span>
						<span className="text-muted-foreground">normal {side}</span>
						{account.description && (
							<>
								<span className="text-muted-foreground/50">·</span>
								<span className="text-muted-foreground">
									{account.description}
								</span>
							</>
						)}
					</span>
				}
			/>

			{/* Saldo summary — ending balance dominant, flows secondary */}
			<section className="overflow-hidden rounded-lg border border-border-default bg-card shadow-[var(--shadow-level-2)]">
				<div className="grid gap-5 px-5 py-5 sm:grid-cols-[1.3fr_2fr] sm:items-center">
					<div>
						<div className="eyebrow mb-1.5">Saldo akhir {periodLabel}</div>
						<div
							className={cn(
								"tabular display-tight text-[30px] font-semibold leading-[1.05] sm:text-[36px]",
								endingBalance < 0 ? "text-destructive" : "text-foreground",
							)}
						>
							{formatRupiah(endingBalance)}
						</div>
						<p className="mt-1.5 text-[12px] text-muted-foreground">
							dari {rows.length} pergerakan {periodLabel}.
						</p>
					</div>
					<dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle sm:border-l sm:border-y-0 sm:border-r-0 sm:border-border-subtle sm:bg-transparent">
						{(from || to) && <Stat label="Saldo awal" value={openingBalance} />}
						<Stat label="Total debit" value={totalDebit} muted />
						<Stat label="Total kredit" value={totalCredit} muted />
					</dl>
				</div>
			</section>

			<LedgerDateFilter defaultFrom={from} defaultTo={to} />

			{rows.length === 0 ? (
				<EmptyState
					icon={Wallet2}
					title="Belum ada pergerakan"
					description={
						from || to
							? "Tidak ada jurnal yang menyentuh akun ini di periode terpilih."
							: "Akun ini belum pernah dipakai di jurnal manapun."
					}
				/>
			) : (
				<LedgerTable rows={rows} accountType={accountType} />
			)}
		</Container>
	);
}

function Stat({
	label,
	value,
	muted,
}: {
	label: string;
	value: number;
	muted?: boolean;
}) {
	return (
		<div className="bg-card p-3 sm:bg-transparent sm:p-0 sm:pl-5">
			<dt className="eyebrow mb-1">{label}</dt>
			<dd
				className={cn(
					"tabular text-[15px] font-semibold sm:text-[16px]",
					value < 0
						? "text-destructive"
						: muted
							? "text-foreground"
							: "text-foreground",
				)}
			>
				{formatRupiah(value)}
			</dd>
		</div>
	);
}
