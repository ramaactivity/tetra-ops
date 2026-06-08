import { redirect } from "next/navigation";
import { AccountingTabs } from "@/components/finance/accounting/accounting-tabs";
import {
	BaganAkunTable,
	type CoaRow,
} from "@/components/finance/accounting/bagan-akun-table";
import { FinancialPosition } from "@/components/finance/accounting/financial-position";
import {
	type JournalEntryRow,
	JurnalTable,
} from "@/components/finance/accounting/jurnal-table";
import {
	type CoaOption,
	NewJournalEntryButton,
} from "@/components/finance/accounting/new-journal-entry-button";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	aggregateBalances,
	type CoaMeta,
	type LineForBalance,
	summarizePosition,
} from "@/lib/finance/accounting";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Tab = "accounts" | "journal";

export default async function AccountingPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/finance");
	}

	const { tab: tabRaw, from, to } = await searchParams;
	const tab: Tab = tabRaw === "journal" ? "journal" : "accounts";

	const supabase = await createClient();

	// Chart of accounts, all journal lines (for live balances), and recent
	// journal entries (Jurnal tab) are independent — fetch in parallel (one
	// round-trip instead of three sequential ones).
	let journalEntriesQuery = supabase
		.from("journal_entries")
		.select(
			`id, ref_id, entry_date, entry_type, description, source_type,
			 source_id, total_amount, is_reversed, reversed_at, created_at,
			 created_by_user:users!journal_entries_created_by_fkey(full_name),
			 lines:journal_lines(
				 id, account_code, debit_amount, credit_amount, description, line_order,
				 account:chart_of_accounts!journal_lines_account_code_fkey(name)
			 )`,
		)
		.order("entry_date", { ascending: false })
		.order("created_at", { ascending: false })
		.limit(200);
	if (from) journalEntriesQuery = journalEntriesQuery.gte("entry_date", from);
	if (to) journalEntriesQuery = journalEntriesQuery.lte("entry_date", to);

	const [{ data: coa }, { data: lineData }, { data: rawEntries }] =
		await Promise.all([
			// Chart of accounts (all, incl. inactive — Bagan Akun toggles visibility).
			supabase
				.from("chart_of_accounts")
				.select("code, name, account_type, parent_code, description, is_active")
				.order("code"),
			// Every journal line, all-time, for live balances. Reversed entries and
			// their pembalik counter-entries both stay in and net to zero.
			supabase
				.from("journal_lines")
				.select("account_code, debit_amount, credit_amount"),
			journalEntriesQuery,
		]);
	const coaBase = (coa ?? []) as Array<{
		code: string;
		name: string;
		account_type: string;
		parent_code: string | null;
		description: string | null;
		is_active: boolean;
	}>;
	const allLines: LineForBalance[] = (
		(lineData ?? []) as Array<{
			account_code: string;
			debit_amount: number | string;
			credit_amount: number | string;
		}>
	).map((l) => ({
		account_code: l.account_code,
		debit_amount: Number(l.debit_amount),
		credit_amount: Number(l.credit_amount),
	}));

	const coaMeta: CoaMeta[] = coaBase.map((c) => ({
		code: c.code,
		name: c.name,
		account_type: c.account_type,
	}));
	const aggregates = aggregateBalances(coaMeta, allLines);
	const position = summarizePosition(aggregates);

	const balanceByCode = new Map(aggregates.map((a) => [a.code, a]));
	const coaRows: CoaRow[] = coaBase.map((c) => {
		const agg = balanceByCode.get(c.code);
		return {
			...c,
			debit: agg?.debit ?? 0,
			credit: agg?.credit ?? 0,
			balance: agg?.balance ?? 0,
		};
	});

	// Recent journal entries (with lines) for the Jurnal tab — already fetched
	// above in the parallel batch (rawEntries).
	let journalRows: JournalEntryRow[] = [];
	journalRows = (
		(rawEntries ?? []) as Array<{
			id: string;
			ref_id: string;
			entry_date: string;
			entry_type: string;
			description: string;
			source_type: string;
			source_id: string | null;
			total_amount: number | string;
			is_reversed: boolean;
			reversed_at: string | null;
			created_at: string;
			created_by_user:
				| { full_name: string | null }
				| { full_name: string | null }[]
				| null;
			lines: Array<{
				id: string;
				account_code: string;
				debit_amount: number | string;
				credit_amount: number | string;
				description: string | null;
				line_order: number;
				account: { name: string } | { name: string }[] | null;
			}>;
		}>
	).map((r) => {
		const usr = Array.isArray(r.created_by_user)
			? r.created_by_user[0]
			: r.created_by_user;
		const lines = (r.lines ?? [])
			.map((l) => {
				const acc = Array.isArray(l.account) ? l.account[0] : l.account;
				return {
					id: l.id,
					account_code: l.account_code,
					account_name: acc?.name ?? null,
					debit_amount: Number(l.debit_amount),
					credit_amount: Number(l.credit_amount),
					description: l.description,
					line_order: l.line_order,
				};
			})
			.sort((a, b) => a.line_order - b.line_order);
		return {
			id: r.id,
			ref_id: r.ref_id,
			entry_date: r.entry_date,
			entry_type: r.entry_type,
			description: r.description,
			source_type: r.source_type,
			source_id: r.source_id,
			total_amount: Number(r.total_amount),
			is_reversed: r.is_reversed,
			reversed_at: r.reversed_at,
			created_at: r.created_at,
			created_by_name: usr?.full_name ?? null,
			lines,
		};
	});

	// Active, postable accounts for the manual-entry dialog (skip header rows).
	const coaOptions: CoaOption[] = coaRows
		.filter((r) => r.is_active && r.code.includes("-"))
		.map((r) => ({
			code: r.code,
			name: r.name,
			account_type: r.account_type,
		}));

	const asOfLabel = formatDateID(new Date().toISOString());

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Akuntansi"
				description="Pusat keuangan bisnis. Sebagian besar jurnal ter-posting otomatis dari settlement, pembelian, dan stock opname — tinggal dibaca, ditelusuri, dan dikoreksi bila perlu."
				actions={<NewJournalEntryButton coa={coaOptions} />}
			/>

			<FinancialPosition position={position} asOfLabel={asOfLabel} />

			<div className="space-y-4">
				<AccountingTabs current={tab} />
				{tab === "accounts" ? (
					<BaganAkunTable rows={coaRows} />
				) : (
					<JurnalTable rows={journalRows} defaultFrom={from} defaultTo={to} />
				)}
			</div>
		</Container>
	);
}
