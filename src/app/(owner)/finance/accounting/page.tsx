import { BookOpen, FileText, Layers } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { AccountingTabs } from "@/components/finance/accounting/accounting-tabs";
import {
	BaganAkunTable,
	type CoaRow,
} from "@/components/finance/accounting/bagan-akun-table";
import {
	JurnalTable,
	type JournalEntryRow,
} from "@/components/finance/accounting/jurnal-table";
import {
	type CoaOption,
	NewJournalEntryButton,
} from "@/components/finance/accounting/new-journal-entry-button";
import { getCurrentUser } from "@/lib/auth/get-user";
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
	const tab: Tab =
		tabRaw === "journal" ? "journal" : "accounts";

	const supabase = await createClient();

	// Always fetch COA for the tab counts + Bagan Akun rendering
	const { data: coa } = await supabase
		.from("chart_of_accounts")
		.select(
			"code, name, account_type, parent_code, description, is_active",
		)
		.order("code");
	const coaRows: CoaRow[] = (coa ?? []) as CoaRow[];

	// Journal entries — fetch when tab is journal OR for KPI top-strip stats
	let journalRows: JournalEntryRow[] = [];
	if (tab === "journal" || true) {
		let q = supabase
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
		if (from) q = q.gte("entry_date", from);
		if (to) q = q.lte("entry_date", to);
		const { data: rawEntries } = await q;
		journalRows = ((rawEntries ?? []) as Array<{
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
		}>).map((r) => {
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
	}

	// Active COA options for the manual entry dialog (skip header rows)
	const coaOptions: CoaOption[] = coaRows
		.filter((r) => r.is_active && r.code.includes("-"))
		.map((r) => ({
			code: r.code,
			name: r.name,
			account_type: r.account_type,
		}));

	const totalCoa = coaRows.length;
	const activeCoa = coaRows.filter((c) => c.is_active).length;
	const totalJournals = journalRows.length;
	const monthJournals = journalRows.filter((j) => {
		const d = new Date(j.entry_date);
		const n = new Date();
		return (
			d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
		);
	}).length;
	const reversedJournals = journalRows.filter((j) => j.is_reversed).length;

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Akuntansi"
				description="Bagan Akun, Jurnal Umum. Auto-jurnal aktif — settlement, pembelian, opname otomatis ter-post."
				actions={<NewJournalEntryButton coa={coaOptions} />}
			/>

			<KpiRow className="lg:grid-cols-3">
				<KpiCard
					label="Akun Aktif"
					value={activeCoa.toLocaleString("id-ID")}
					hint={`${totalCoa - activeCoa} nonaktif · ${totalCoa} total`}
					icon={Layers}
					accent="primary"
				/>
				<KpiCard
					label="Jurnal Bulan Ini"
					value={monthJournals.toLocaleString("id-ID")}
					hint={`${totalJournals} dari 200 terakhir`}
					icon={BookOpen}
					accent="sky"
				/>
				<KpiCard
					label="Reversed"
					value={reversedJournals.toLocaleString("id-ID")}
					hint="entry yang sudah dibalik"
					icon={FileText}
					accent={reversedJournals > 0 ? "amber" : "default"}
				/>
			</KpiRow>

			<AccountingTabs current={tab} />

			{tab === "accounts" ? (
				<BaganAkunTable rows={coaRows} />
			) : (
				<JurnalTable rows={journalRows} defaultFrom={from} defaultTo={to} />
			)}
		</Container>
	);
}
