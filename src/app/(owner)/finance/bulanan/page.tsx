import {
	ArrowDownRight,
	ArrowUpRight,
	CalendarRange,
	Landmark,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type * as React from "react";
import { MonthSwitcher } from "@/components/finance/monthly/month-switcher";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { InfoHint } from "@/components/ui/info-hint";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	getMonthlyOverview,
	monthLabel,
	monthLabelShort,
} from "@/lib/finance/monthly-data";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Buku Bulanan — keuangan dipotong per bulan, bahasa owner.
 *
 * Tiga blok yang sengaja dipisah karena menjawab pertanyaan berbeda:
 *   • Alur uang     → "saldo saya awal bulan berapa, akhir bulan berapa?"
 *   • Untung        → "bulan ini untung berapa?" (dua sudut pandang)
 *   • Biaya & riwayat → "duitnya habis ke mana, dan bulan-bulan sebelumnya gimana?"
 *
 * Halaman Ringkasan tetap menjawab "kondisi SAAT INI"; halaman ini per periode.
 */
export default async function FinanceMonthlyPage({
	searchParams,
}: {
	searchParams: Promise<{ bulan?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/finance");
	}

	const { bulan } = await searchParams;
	const supabase = await createClient();
	const data = await getMonthlyOverview(supabase, bulan);
	const m = data.current;

	const labelOf = Object.fromEntries(
		data.months.map((ym) => [ym, monthLabel(ym)]),
	);
	const cashDelta = m.closing - m.opening;

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Buku Bulanan"
				actions={
					<MonthSwitcher
						months={data.months}
						current={m.ym}
						prevYm={data.prevYm}
						nextYm={data.nextYm}
						labelOf={labelOf}
					/>
				}
			/>

			{data.beforeBooks && (
				<p className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-[12.5px] text-amber-800 dark:text-amber-300">
					Bulan ini ada sebelum cutoff pembukuan
					{data.cutoffDate ? ` (${formatDateID(data.cutoffDate)})` : ""} — buku
					yang sekarang belum mencatat apa pun di periode itu.
				</p>
			)}

			{/* ── 1. Alur uang ─────────────────────────────────────────────── */}
			<SectionCard
				title={
					<>
						Alur uang
						<span className="text-muted-foreground font-medium">
							{" "}
							· {m.label}
						</span>
					</>
				}
				titleExtra={
					<InfoHint title="Alur uang">
						Pergerakan uang tunai + semua rekening bank. Saldo awal + uang masuk
						− uang keluar = saldo akhir. Angka ini selalu tutup persis.
					</InfoHint>
				}
				meta={
					<span
						className={cn(
							"tabular text-xs font-semibold",
							cashDelta > 0
								? "text-emerald-600 dark:text-emerald-400"
								: cashDelta < 0
									? "text-rose-600 dark:text-rose-400"
									: "text-muted-foreground",
						)}
					>
						{cashDelta > 0 ? "+" : cashDelta < 0 ? "−" : ""}
						{formatRupiah(Math.abs(cashDelta))} sebulan
					</span>
				}
			>
				<dl className="divide-border-subtle grid divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
					<FlowStat
						label="Saldo awal"
						value={m.opening}
						icon={Landmark}
						hint={
							m.hasOpeningEntry && data.cutoffDate
								? `Saldo awal pembukuan ${formatDateID(data.cutoffDate)}`
								: "Uang di kas + bank di awal bulan"
						}
					/>
					<FlowStat
						label="Uang masuk"
						value={m.inflow}
						sign="+"
						tone="emerald"
						icon={ArrowUpRight}
						hint="Pembayaran klien & pemasukan lain"
					/>
					<FlowStat
						label="Uang keluar"
						value={m.outflow}
						sign="−"
						tone="rose"
						icon={ArrowDownRight}
						hint="Semua uang yang keluar dari kas/bank"
					/>
					<FlowStat
						label="Saldo akhir"
						value={m.closing}
						icon={Landmark}
						strong
						hint="Uang di kas + bank di akhir bulan"
					/>
				</dl>
				{m.outflow > 0 && (
					<p className="border-border-subtle text-muted-foreground border-t px-4 py-2.5 text-[11.5px] leading-relaxed">
						Dari uang keluar{" "}
						<span className="tabular font-medium">
							{formatRupiah(m.outflow)}
						</span>
						:{" "}
						<span className="tabular font-medium text-foreground">
							{formatRupiah(data.outflowForExpense)}
						</span>{" "}
						jadi biaya, sisanya{" "}
						<span className="tabular font-medium text-foreground">
							{formatRupiah(data.outflowNonExpense)}
						</span>{" "}
						untuk beli stok, bayar utang, atau ambil bagi hasil — keluar tapi
						bukan biaya.
					</p>
				)}
			</SectionCard>

			{/* ── 2. Untung ────────────────────────────────────────────────── */}
			<SectionCard
				title={
					<>
						Untung
						<span className="text-muted-foreground font-medium">
							{" "}
							· {m.label}
						</span>
					</>
				}
				titleExtra={
					<InfoHint title="Kenapa untung ≠ saldo naik?">
						Untung = pendapatan − biaya. Saldo bisa naik lebih besar (uang DP
						masuk untuk event bulan depan) atau lebih kecil (uangnya dipakai
						beli stok, bayar utang, atau diambil sebagai bagi hasil).
					</InfoHint>
				}
			>
				<dl className="divide-border-subtle grid divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0">
					<FlowStat
						label="Pendapatan"
						value={m.revenue}
						tone="emerald"
						hint="Diakui saat uang klien diterima"
					/>
					<FlowStat
						label="Pengeluaran"
						value={m.expense}
						tone="rose"
						hint="Semua biaya bulan ini, termasuk pemakaian stok"
					/>
					<FlowStat
						label="Untung bulan ini"
						value={m.profitBook}
						strong
						tone={m.profitBook >= 0 ? "emerald" : "rose"}
						icon={m.profitBook >= 0 ? TrendingUp : TrendingDown}
						hint="Pendapatan − pengeluaran bulan ini"
					/>
					<FlowStat
						label="Laba event ditutup"
						value={m.profitSettled}
						tone={m.profitSettled >= 0 ? "emerald" : "rose"}
						hint={
							m.settledCount > 0
								? `${m.settledCount} event di-settle bulan ini`
								: "Belum ada event di-settle"
						}
					/>
				</dl>
				<p className="border-border-subtle text-muted-foreground border-t px-4 py-2.5 text-[11.5px] leading-relaxed">
					<b className="text-foreground">Untung bulan ini</b> memotret periode:
					semua pemasukan dikurangi semua biaya yang jatuh di {m.label}.{" "}
					<b className="text-foreground">Laba event ditutup</b> memotret
					per-event: untung tiap acara yang bukunya ditutup bulan ini — uangnya
					bisa saja masuk bulan lain. Wajar kalau keduanya beda.
				</p>
			</SectionCard>

			{/* ── 3. Biaya per jenis ───────────────────────────────────────── */}
			<SectionCard
				title={
					<>
						Pengeluaran per jenis
						<span className="text-muted-foreground font-medium">
							{" "}
							· {m.label}
						</span>
					</>
				}
				titleExtra={
					<InfoHint title="Pengeluaran per jenis">
						Semua biaya yang dibukukan bulan ini, dikelompokkan. Termasuk
						pemakaian stok — bahannya mungkin dibeli bulan lalu, tapi biayanya
						dihitung saat dipakai di event.
					</InfoHint>
				}
				meta={
					<span className="tabular text-sm font-semibold text-foreground">
						{formatRupiah(m.expense)}
					</span>
				}
			>
				{data.expenseGroups.length === 0 ? (
					<p className="text-muted-foreground px-4 py-8 text-center text-[13px]">
						Belum ada pengeluaran tercatat di {m.label}.
					</p>
				) : (
					<ul className="divide-border-subtle divide-y">
						{data.expenseGroups.map((g) => {
							const pct = m.expense > 0 ? (g.amount / m.expense) * 100 : 0;
							return (
								<li key={g.key} className="px-4 py-3">
									<div className="flex items-baseline justify-between gap-3">
										<span className="text-[13.5px] font-medium text-foreground">
											{g.label}
										</span>
										<span className="tabular shrink-0 text-[13.5px] font-semibold text-foreground">
											{formatRupiah(g.amount)}
										</span>
									</div>
									<div className="mt-1.5 flex items-center gap-2">
										<div className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
											<div
												className="bg-foreground/70 h-full rounded-full"
												style={{ width: `${Math.max(2, pct)}%` }}
											/>
										</div>
										<span className="tabular text-muted-foreground w-9 shrink-0 text-right text-[11px]">
											{pct.toFixed(0)}%
										</span>
									</div>
									<p className="text-muted-foreground mt-1 text-[11px]">
										{g.accounts
											.slice(0, 3)
											.map((a) => a.name)
											.join(" · ")}
										{g.accounts.length > 3
											? ` · +${g.accounts.length - 3} lainnya`
											: ""}
									</p>
								</li>
							);
						})}
					</ul>
				)}
			</SectionCard>

			{/* ── 4. Riwayat bulanan ───────────────────────────────────────── */}
			<SectionCard
				title="Riwayat bulanan"
				titleExtra={
					<InfoHint title="Riwayat bulanan">
						Ringkasan tiap bulan sejak pembukuan dimulai. Klik satu baris untuk
						membuka bulan itu.
					</InfoHint>
				}
				meta={
					<span className="text-muted-foreground text-xs">
						{data.history.length} bulan terakhir
					</span>
				}
			>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] text-[13px]">
						<thead>
							<tr className="border-border-subtle text-muted-foreground border-b text-left text-[11px] font-semibold uppercase tracking-wide">
								<th className="px-4 py-2.5">Bulan</th>
								<th className="px-4 py-2.5 text-right">Saldo awal</th>
								<th className="px-4 py-2.5 text-right">Masuk</th>
								<th className="px-4 py-2.5 text-right">Keluar</th>
								<th className="px-4 py-2.5 text-right">Saldo akhir</th>
								<th className="px-4 py-2.5 text-right">Untung</th>
							</tr>
						</thead>
						<tbody className="divide-border-subtle divide-y">
							{data.history.map((row) => (
								<tr
									key={row.ym}
									className={cn(
										"transition-colors hover:bg-secondary/50",
										row.ym === m.ym && "bg-secondary/40",
									)}
								>
									<td className="px-4 py-2.5">
										<Link
											href={`/finance/bulanan?bulan=${row.ym}`}
											className="font-medium text-foreground hover:underline"
										>
											{monthLabelShort(row.ym)}
										</Link>
									</td>
									<td className="tabular px-4 py-2.5 text-right text-muted-foreground">
										{formatRupiah(row.opening)}
									</td>
									<td className="tabular px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
										{formatRupiah(row.inflow)}
									</td>
									<td className="tabular px-4 py-2.5 text-right text-rose-600 dark:text-rose-400">
										{formatRupiah(row.outflow)}
									</td>
									<td className="tabular px-4 py-2.5 text-right font-semibold text-foreground">
										{formatRupiah(row.closing)}
									</td>
									<td
										className={cn(
											"tabular px-4 py-2.5 text-right font-medium",
											row.profitBook >= 0
												? "text-emerald-600 dark:text-emerald-400"
												: "text-rose-600 dark:text-rose-400",
										)}
									>
										{formatRupiah(row.profitBook)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</SectionCard>

			<p className="text-muted-foreground flex items-start gap-2 rounded-lg border border-border-default bg-surface-3/40 p-3 text-fluid-caption">
				<CalendarRange className="mt-0.5 size-3.5 shrink-0" aria-hidden />
				<span>
					Semua angka diambil dari buku besar (jurnal), bukan hitungan terpisah
					— jadi selalu cocok dengan Laporan & Akuntansi. Pembukuan dimulai{" "}
					{data.cutoffDate ? formatDateID(data.cutoffDate) : "sejak awal data"}.
					Bulan sebelum itu memang kosong.
				</span>
			</p>
		</Container>
	);
}

/** Kartu bento: judul + meta di dalam header ber-hairline (sama dgn Ringkasan). */
function SectionCard({
	title,
	titleExtra,
	meta,
	children,
}: {
	title: React.ReactNode;
	titleExtra?: React.ReactNode;
	meta?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="border-border-subtle bg-card overflow-hidden rounded-[16px] border shadow-[var(--shadow-level-2)]">
			<div className="border-border-subtle flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b px-4 py-2.5">
				<h2 className="font-heading flex min-w-0 items-center gap-1 text-[15px] font-semibold tracking-tight">
					<span className="truncate">{title}</span>
					{titleExtra}
				</h2>
				{meta}
			</div>
			{children}
		</section>
	);
}

function FlowStat({
	label,
	value,
	sign,
	tone,
	hint,
	icon: Icon,
	strong,
}: {
	label: string;
	value: number;
	sign?: "+" | "−";
	tone?: "emerald" | "rose";
	hint?: string;
	icon?: React.ComponentType<{ className?: string }>;
	strong?: boolean;
}) {
	const toneCls =
		tone === "emerald"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "rose"
				? "text-rose-600 dark:text-rose-400"
				: "text-foreground";
	return (
		<div className="space-y-1 px-4 py-3">
			<dt className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider">
				{Icon && <Icon className="size-3.5" />}
				{label}
			</dt>
			<dd
				className={cn(
					"tabular font-semibold",
					strong ? "text-[19px]" : "text-base",
					toneCls,
				)}
			>
				{sign && value !== 0 ? sign : ""}
				{formatRupiah(value)}
			</dd>
			{hint && <p className="text-muted-foreground text-[10.5px]">{hint}</p>}
		</div>
	);
}
