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
import { CatatLauncher } from "@/components/finance/catat/catat-launcher";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	aggregateBalances,
	type CoaMeta,
	type LineForBalance,
	summarizePosition,
} from "@/lib/finance/accounting";
import { fetchAllJournalLines } from "@/lib/finance/balance-guard";
import { loadCatatData } from "@/lib/finance/quick-record-data";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Tab = "accounts" | "journal";

export default async function AccountingPage({
	searchParams,
}: {
	searchParams: Promise<{
		tab?: string;
		from?: string;
		to?: string;
		/** ref_id jurnal yang mau disorot (deep-link dari Riwayat payment dll). */
		entry?: string;
	}>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/finance");
	}

	const { tab: tabRaw, from, to, entry: focusRef } = await searchParams;
	// Default = Jurnal: yang dicari owner saat membuka Akuntansi hampir selalu
	// "transaksi apa saja yang masuk", bukan daftar akun. Bagan Akun jadi
	// tampilan referensi yang dibuka saat dibutuhkan (?tab=accounts).
	//
	// Deep-link ke satu entry juga selalu berarti Jurnal — kalau tidak, link
	// dari Riwayat payment mendarat di Bagan Akun dan sorotan tak pernah
	// terlihat. `?tab=journal` dari link lama tetap valid (tetap Jurnal).
	const tab: Tab = tabRaw === "accounts" && !focusRef ? "accounts" : "journal";

	const supabase = await createClient();

	// Embed event pakai hint nama constraint eksplisit — embed ambigu di
	// PostgREST diam-diam mengembalikan null, bukan error.
	const JOURNAL_SELECT = `id, ref_id, entry_date, entry_type, description, source_type,
		 source_id, total_amount, is_reversed, reversed_at, created_at,
		 created_by_user:users!journal_entries_created_by_fkey(full_name),
		 source_event:events!journal_entries_source_event_id_fkey(client_name, project_id),
		 lines:journal_lines(
			 id, account_code, debit_amount, credit_amount, description, line_order,
			 account:chart_of_accounts!journal_lines_account_code_fkey(name)
		 )`;

	// Chart of accounts, all journal lines (for live balances), and recent
	// journal entries (Jurnal tab) are independent — fetch in parallel (one
	// round-trip instead of three sequential ones).
	let journalEntriesQuery = supabase
		.from("journal_entries")
		.select(JOURNAL_SELECT)
		.order("entry_date", { ascending: false })
		.order("created_at", { ascending: false })
		.limit(200);
	if (from) journalEntriesQuery = journalEntriesQuery.gte("entry_date", from);
	if (to) journalEntriesQuery = journalEntriesQuery.lte("entry_date", to);

	const [{ data: coa }, lineData, { data: listEntries }, { data: focusEntry }] =
		await Promise.all([
			// Chart of accounts (all, incl. inactive — Bagan Akun toggles visibility).
			supabase
				.from("chart_of_accounts")
				.select("code, name, account_type, parent_code, description, is_active")
				.order("code"),
			// Every journal line, all-time, for live balances. Reversed entries and
			// their pembalik counter-entries both stay in and net to zero.
			// Paginated: satu select polos diam-diam terpotong di db-max-rows
			// (1000) dan saldo Bagan Akun jadi salah tanpa peringatan.
			fetchAllJournalLines<{
				account_code: string;
				debit_amount: number | string;
				credit_amount: number | string;
			}>(supabase, "account_code, debit_amount, credit_amount"),
			journalEntriesQuery,
			// Deep-link: entry yang disorot mungkin di luar 200 terbaru atau di
			// luar rentang tanggal aktif. Ambil terpisah lalu gabungkan, supaya
			// link dari Riwayat payment tidak pernah mendarat di daftar kosong.
			focusRef
				? supabase
						.from("journal_entries")
						.select(JOURNAL_SELECT)
						.eq("ref_id", focusRef)
						.limit(1)
				: Promise.resolve({ data: null }),
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
	// above in the parallel batch. Entry yang di-deep-link disisipkan di depan
	// kalau belum ikut terbawa daftar (dedupe by id).
	const listRows = (listEntries ?? []) as Array<{ id: string }>;
	const extraFocus = ((focusEntry ?? []) as Array<{ id: string }>).filter(
		(f) => !listRows.some((r) => r.id === f.id),
	);
	const rawEntries = [...extraFocus, ...listRows];

	let journalRows: JournalEntryRow[] = [];
	journalRows = (
		rawEntries as Array<{
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
			source_event:
				| { client_name: string | null; project_id: string | null }
				| { client_name: string | null; project_id: string | null }[]
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
		const ev = Array.isArray(r.source_event)
			? r.source_event[0]
			: r.source_event;
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
			proof_url: null as string | null,
			event_name: ev?.client_name ?? null,
			event_project_id: ev?.project_id ?? null,
			payment_type: null as string | null,
			lines,
		};
	});

	// Resolve "bukti transaksi" per entry: a manually-attached nota keyed by
	// ref_id (covers Catat transaksi receipts + Jurnal "Upload bukti"), plus the
	// proof living on the originating record for system entries (keyed by
	// source_id via v_nota_sistem). Manual attachment wins when both exist.
	if (journalRows.length > 0) {
		const refIds = journalRows.map((r) => r.ref_id);
		const sourceIds = journalRows
			.map((r) => r.source_id)
			.filter((v): v is string => !!v);
		const [{ data: manualNotas }, sourceNotasRes] = await Promise.all([
			supabase
				.from("manual_notas")
				.select("entry_ref_id, drive_url, created_at")
				.in("entry_ref_id", refIds)
				.order("created_at", { ascending: false }),
			sourceIds.length > 0
				? supabase
						.from("v_nota_sistem")
						.select("source_id, drive_url")
						.in("source_id", sourceIds)
				: Promise.resolve({
						data: [] as Array<{ source_id: string; drive_url: string | null }>,
					}),
		]);
		const proofByRef = new Map<string, string>();
		for (const n of (manualNotas ?? []) as Array<{
			entry_ref_id: string | null;
			drive_url: string | null;
		}>) {
			// ordered newest-first → first seen per ref is the latest.
			if (n.entry_ref_id && n.drive_url && !proofByRef.has(n.entry_ref_id))
				proofByRef.set(n.entry_ref_id, n.drive_url);
		}
		const proofBySource = new Map<string, string>();
		for (const n of (sourceNotasRes.data ?? []) as Array<{
			source_id: string | null;
			drive_url: string | null;
		}>) {
			if (n.source_id && n.drive_url && !proofBySource.has(n.source_id))
				proofBySource.set(n.source_id, n.drive_url);
		}
		for (const row of journalRows) {
			row.proof_url =
				proofByRef.get(row.ref_id) ??
				(row.source_id ? (proofBySource.get(row.source_id) ?? null) : null);
		}

		// Tipe pembayaran (DP / sebagian / pelunasan) untuk judul yang enak
		// dibaca. source_id kolom generik tanpa FK (menunjuk banyak tabel), jadi
		// tidak bisa di-embed — harus query terpisah.
		const paymentSourceIds = journalRows
			.filter((r) => r.source_type === "payment" && r.source_id)
			.map((r) => r.source_id as string);
		if (paymentSourceIds.length > 0) {
			const { data: payTypes } = await supabase
				.from("payments")
				.select("id, payment_type")
				.in("id", paymentSourceIds);
			const typeById = new Map(
				(payTypes ?? []).map((p) => [p.id as string, p.payment_type as string]),
			);
			for (const row of journalRows) {
				if (row.source_id) {
					row.payment_type = typeById.get(row.source_id) ?? null;
				}
			}
		}
	}

	// Active, postable accounts for the manual-entry dialog (skip header rows).
	const coaOptions: CoaOption[] = coaRows
		.filter((r) => r.is_active && r.code.includes("-"))
		.map((r) => ({
			code: r.code,
			name: r.name,
			account_type: r.account_type,
		}));

	const asOfLabel = formatDateID(new Date().toISOString());
	const catatData = await loadCatatData();

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Akuntansi"
				description="Pusat keuangan bisnis. Sebagian besar jurnal ter-posting otomatis dari settlement, pembelian, dan stock opname — tinggal dibaca, ditelusuri, dan dikoreksi bila perlu."
				actions={<NewJournalEntryButton coa={coaOptions} />}
			/>

			<CatatLauncher data={catatData} />

			<FinancialPosition position={position} asOfLabel={asOfLabel} />

			<div className="space-y-4">
				<AccountingTabs current={tab} />
				{tab === "accounts" ? (
					<BaganAkunTable rows={coaRows} />
				) : (
					<JurnalTable
						rows={journalRows}
						defaultFrom={from}
						defaultTo={to}
						focusRef={focusRef}
					/>
				)}
			</div>
		</Container>
	);
}
