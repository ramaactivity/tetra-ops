import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CashBalanceChart } from "@/components/finance/cash-balance-chart";
import {
	CashBookTable,
	type CashBookTableRow,
} from "@/components/finance/cash-book-table";
import { DateRangeFilter } from "@/components/finance/date-range-filter";
import { MonthSwitcher } from "@/components/finance/monthly/month-switcher";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { InfoHint } from "@/components/ui/info-hint";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	humanEntryTitle,
	isCashOrBank,
	SOURCE_LABEL,
} from "@/lib/finance/accounting";
import { fetchAllJournalLines } from "@/lib/finance/balance-guard";
import { buildCashBook, type CashBookLine } from "@/lib/finance/cash-book";
import { monthLabel, ymOf } from "@/lib/finance/monthly-data";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Buku Kas — mutasi per kas/rekening dengan saldo berjalan, per bulan atau
 * rentang tanggal bebas.
 * Semua baris diambil dari jurnal (kas/bank 1-1xx), jadi tidak ada input
 * terpisah: tiap pembayaran, pembelian, fee crew, dll otomatis muncul.
 */
export default async function BukuKasPage({
	searchParams,
}: {
	searchParams: Promise<{
		akun?: string;
		bulan?: string;
		dari?: string;
		sampai?: string;
	}>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/finance");
	}

	const { akun, bulan, dari, sampai } = await searchParams;
	const supabase = await createClient();

	type RawLine = {
		entry_id: string;
		account_code: string;
		debit_amount: number | string;
		credit_amount: number | string;
		entry:
			| { entry_date: string; ref_id: string }
			| Array<{ entry_date: string; ref_id: string }>
			| null;
	};

	const [{ data: coaData }, { data: cutoffCfg }, rawLines] = await Promise.all([
		supabase
			.from("chart_of_accounts")
			.select("code, name, account_type, is_active")
			.order("code"),
		supabase
			.from("system_config")
			.select("value")
			.eq("key", "finance_cutoff_date")
			.maybeSingle(),
		fetchAllJournalLines<RawLine>(
			supabase,
			`entry_id, account_code, debit_amount, credit_amount,
			 entry:journal_entries!journal_lines_entry_id_fkey(entry_date, ref_id)`,
		),
	]);

	const coaName = new Map(
		(coaData ?? []).map((c) => [c.code as string, c.name as string]),
	);

	const lines: CashBookLine[] = [];
	const usedCodes = new Set<string>();
	for (const l of rawLines) {
		const e = Array.isArray(l.entry) ? l.entry[0] : l.entry;
		if (!e?.entry_date) continue;
		usedCodes.add(l.account_code);
		lines.push({
			entryId: l.entry_id,
			refId: e.ref_id,
			date: e.entry_date.slice(0, 10),
			code: l.account_code,
			debit: Number(l.debit_amount ?? 0),
			credit: Number(l.credit_amount ?? 0),
		});
	}

	// Tab akun: semua kas/bank yang aktif atau pernah dipakai.
	const cashAccounts = (coaData ?? [])
		.filter(
			(c) =>
				isCashOrBank(c.code as string, c.account_type as string) &&
				(c.is_active || usedCodes.has(c.code as string)),
		)
		.map((c) => ({ code: c.code as string, name: c.name as string }));
	const selected = cashAccounts.find((a) => a.code === akun) ?? null;
	const scope = new Set(
		selected ? [selected.code] : cashAccounts.map((a) => a.code),
	);

	// Daftar bulan: bulan cutoff (atau jurnal pertama) s/d bulan ini.
	const cutoffDate =
		typeof cutoffCfg?.value === "string" && cutoffCfg.value
			? cutoffCfg.value
			: null;
	const thisYm = ymOf(new Date());
	const firstYm =
		cutoffDate?.slice(0, 7) ??
		lines.reduce(
			(m, l) => (l.date.slice(0, 7) < m ? l.date.slice(0, 7) : m),
			thisYm,
		);
	const months: string[] = [];
	for (let ym = firstYm; ym <= thisYm; ) {
		months.push(ym);
		const [y, m] = ym.split("-").map(Number);
		ym = ymOf(new Date(y, m, 1));
	}
	if (months.length === 0) months.push(thisYm);
	const wantYm = bulan ?? dari?.slice(0, 7);
	const ym = wantYm && months.includes(wantYm) ? wantYm : thisYm;
	const idx = months.indexOf(ym);
	const [y, m] = ym.split("-").map(Number);
	// Rentang bebas (?dari&sampai) mengalahkan pilihan bulan.
	const isDate = (v?: string): v is string =>
		!!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
	const custom = isDate(dari) && isDate(sampai) && dari <= sampai;
	const from = custom ? dari : `${ym}-01`;
	const to = custom
		? sampai
		: `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
	const periodLabel = custom
		? `${formatDateID(from)} – ${formatDateID(to)}`
		: monthLabel(ym);
	// Grafik berhenti di hari ini kalau periodenya masih berjalan.
	const today = new Date().toLocaleDateString("en-CA", {
		timeZone: "Asia/Jakarta",
	});
	const chartTo = today >= from && today < to ? today : to;

	const book = buildCashBook(lines, scope, from, to);

	// Detail jurnal (uraian, sumber, event) hanya untuk baris bulan ini.
	type EntryMeta = {
		id: string;
		description: string;
		source_type: string;
		is_reversed: boolean;
		source_event:
			| { client_name: string; project_id: string }
			| Array<{ client_name: string; project_id: string }>
			| null;
	};
	const ids = book.rows.map((r) => r.entryId);
	const metaById = new Map<string, EntryMeta>();
	for (let i = 0; i < ids.length; i += 100) {
		const { data } = await supabase
			.from("journal_entries")
			.select(
				`id, description, source_type, is_reversed,
				 source_event:events!journal_entries_source_event_id_fkey(client_name, project_id)`,
			)
			.in("id", ids.slice(i, i + 100));
		for (const r of (data ?? []) as EntryMeta[]) metaById.set(r.id, r);
	}

	const rows: CashBookTableRow[] = book.rows.map((r) => {
		const meta = metaById.get(r.entryId);
		const ev = Array.isArray(meta?.source_event)
			? meta?.source_event[0]
			: meta?.source_event;
		return {
			...r,
			title: meta
				? humanEntryTitle({
						source_type: meta.source_type,
						description: meta.description,
						event_name: ev?.client_name ?? null,
					})
				: "Transaksi",
			sourceLabel: r.isTransfer
				? "Pindah antar rekening"
				: meta
					? (SOURCE_LABEL[meta.source_type] ?? meta.source_type)
					: "",
			isReversed: meta?.is_reversed ?? false,
			projectId: ev?.project_id ?? null,
			eventName: ev?.client_name ?? null,
			contra: r.contraCodes.map((code) => ({
				code,
				name: coaName.get(code) ?? code,
			})),
		};
	});

	const scopeLabel = selected?.name ?? "Semua Kas & Bank";
	const change = book.closing - book.opening;
	const tabHref = (code: string | null) =>
		`/finance/buku-kas?${new URLSearchParams({
			...(code ? { akun: code } : {}),
			...(custom ? { dari: from, sampai: to } : { bulan: ym }),
		})}`;

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title={
					<span className="flex items-center gap-1">
						Buku Kas
						<InfoHint title="Cara membaca Buku Kas">
							Tiap baris = satu transaksi yang menyentuh kas/rekening ini. Kolom
							Saldo menunjukkan sisa uang SETELAH transaksi itu. Semua terisi
							otomatis dari pembayaran klien, pembelian, fee crew, pindah saldo,
							dan catat manual — tidak perlu diketik ulang.
						</InfoHint>
					</span>
				}
				actions={
					<MonthSwitcher
						months={months}
						current={ym}
						prevYm={idx > 0 ? months[idx - 1] : null}
						nextYm={idx < months.length - 1 ? months[idx + 1] : null}
						labelOf={Object.fromEntries(months.map((m) => [m, monthLabel(m)]))}
					/>
				}
			/>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<nav
					aria-label="Pilih kas atau rekening"
					className="hide-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
				>
					{[{ code: null, name: "Semua Kas & Bank" }, ...cashAccounts].map(
						(a) => {
							const active = (a.code ?? null) === (selected?.code ?? null);
							return (
								<Link
									key={a.code ?? "all"}
									href={tabHref(a.code)}
									aria-current={active ? "page" : undefined}
									className={cn(
										"press inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
										active
											? "border-transparent bg-primary text-primary-foreground"
											: "border-border-default bg-card text-foreground/70 hover:bg-secondary hover:text-foreground",
									)}
								>
									{a.name}
								</Link>
							);
						},
					)}
				</nav>
				<DateRangeFilter from={from} to={to} active={custom} />
			</div>

			<dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard
					label="Saldo awal"
					value={formatRupiah(book.opening)}
					icon={Landmark}
					tone={book.opening < 0 ? "negative" : "default"}
					hint={`per ${formatDateID(from)}`}
				/>
				<StatCard
					label="Uang masuk"
					value={`+ ${formatRupiah(book.totalMasuk)}`}
					icon={ArrowDownLeft}
					tone="positive"
					hint={`${book.countMasuk} transaksi`}
				/>
				<StatCard
					label="Uang keluar"
					value={`− ${formatRupiah(book.totalKeluar)}`}
					icon={ArrowUpRight}
					tone="negative"
					hint={`${book.countKeluar} transaksi`}
				/>
				<StatCard
					label="Saldo akhir"
					value={formatRupiah(book.closing)}
					icon={Wallet}
					tone={book.closing < 0 ? "negative" : "default"}
					delta={
						change !== 0
							? {
									value: `${change > 0 ? "naik" : "turun"} ${formatRupiah(Math.abs(change))}`,
									tone: change > 0 ? "positive" : "negative",
								}
							: undefined
					}
					hint={`per ${formatDateID(to)}`}
				/>
			</dl>

			<CashBalanceChart
				rows={book.rows}
				opening={book.opening}
				from={from}
				to={chartTo}
			/>

			<CashBookTable
				key={`${selected?.code ?? "all"}-${from}-${to}`}
				rows={rows}
				opening={book.opening}
				openingDate={from}
				closing={book.closing}
				totalMasuk={book.totalMasuk}
				totalKeluar={book.totalKeluar}
				fileName={`buku-kas_${selected?.code ?? "semua"}_${from}_${to}.csv`}
				scopeLabel={`${scopeLabel} · ${periodLabel}`}
			/>
		</Container>
	);
}
