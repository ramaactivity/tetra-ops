import {
	CheckCircle2,
	HandCoins,
	PiggyBank,
	Receipt,
	Users,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { CatatLauncher } from "@/components/finance/catat/catat-launcher";
import {
	AmountRow,
	SubGroup,
	SummaryTile,
} from "@/components/finance/money-ui";
import { MonthSwitcher } from "@/components/finance/monthly/month-switcher";
import { MonthlyReport } from "@/components/finance/monthly-report";
import { PatunganDialog } from "@/components/finance/patungan-dialog";
import {
	SinkingBreakdown,
	type SinkingFundRow,
} from "@/components/finance/sinking-breakdown";
import {
	type Owner,
	WithdrawalButton,
} from "@/components/finance/withdrawal-button";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	RekapCard,
	SectionHeader as SectionHeader2,
} from "@/components/rekap/rekap-ui";
import { getCurrentUser } from "@/lib/auth/get-user";
import { fetchAllJournalLines } from "@/lib/finance/balance-guard";
import { loadCashAccounts } from "@/lib/finance/cash-accounts";
import {
	getMonthlyOverview,
	monthLabel as monthLabelLong,
	ymOf,
} from "@/lib/finance/monthly-data";
import { getEventExtras, getMonthlyPnl } from "@/lib/finance/monthly-pnl";
import { loadCatatData } from "@/lib/finance/quick-record-data";
import {
	listCrewLiabilityGaps,
	listUnpaidCrew,
} from "@/lib/finance/unpaid-crew";
import { formatDateID, formatRupiah, formatSignedRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function startOfMonth(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function FinancePage({
	searchParams,
}: {
	searchParams: Promise<{
		catat?: string;
		amount?: string;
		cat?: string;
		note?: string;
		ev?: string;
		bulan?: string;
	}>;
}) {
	const me = await getCurrentUser();
	const isSuperAdmin = me?.profile.role === "super_admin";
	const supabase = await createClient();
	const {
		catat,
		amount: catatAmount,
		cat: catatCategory,
		note: catatNote,
		ev: catatEventId,
		bulan,
	} = await searchParams;
	const catatData = await loadCatatData();

	// Prefill "Catat transaksi" dari deep-link (tombol Catat di rekap owner untuk
	// biaya event yang dibayar owner). Nilai divalidasi di sini; categoryId yang
	// tak dikenal diabaikan oleh QuickRecordCore.
	const catatPrefillAmount = Math.max(0, Math.round(Number(catatAmount) || 0));
	const catatPrefill =
		catat === "1" && (catatPrefillAmount > 0 || catatCategory || catatNote)
			? {
					direction: "keluar" as const,
					amount: catatPrefillAmount,
					categoryId: catatCategory,
					note: catatNote?.slice(0, 300),
					eventId: catatEventId,
				}
			: undefined;

	const today = new Date();
	const ymStart = startOfMonth(today);
	const ymEnd = lastDayOfMonth(today.getFullYear(), today.getMonth() + 1);

	// Cash-basis: exclude payments received BEFORE the finance cutoff — that cash
	// is already baked into the opening balances, so counting it again as this
	// month's revenue/inflow would double-show. Effective start = max(month-start,
	// cutoff). Keeps the dashboard's cash tiles consistent with the clean books.
	const { data: cutoffCfg } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "finance_cutoff_date")
		.maybeSingle();
	const cutoffDate =
		typeof cutoffCfg?.value === "string" && cutoffCfg.value.length > 0
			? cutoffCfg.value
			: null;
	const revStart = cutoffDate && cutoffDate > ymStart ? cutoffDate : ymStart;

	const [
		{ data: revenueMtdData },
		{ data: outstandingData },
		{ data: bankAccountsData },
		{ data: sinkingFundsData },
		{ data: recentSettlementsData },
		{ data: ownerEarningsData },
		{ data: ownersListData },
	] = await Promise.all([
		supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", revStart)
			.lte("payment_date", ymEnd),
		// Outstanding receivables — SUM in Postgres instead of fetch-all + JS
		// reduce. See get_outstanding_total migration.
		supabase.rpc("get_outstanding_total"),
		supabase
			.from("bank_accounts")
			.select(
				"id, account_name, bank_name, account_holder, coa_code, is_active",
			)
			.eq("is_active", true)
			.order("account_name", { ascending: true }),
		supabase
			.from("sinking_funds")
			.select(
				"id, code, name, description, allocation_type, allocation_value, target_balance",
			)
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		supabase
			.from("event_settlements")
			.select(
				`id, net_profit, revenue_net, opex_total, hpp_total, is_loss, closed_at,
				event:events!inner(id, project_id, client_name, event_date)`,
			)
			.eq("is_reopened", false)
			.order("closed_at", { ascending: false })
			.limit(10),
		isSuperAdmin
			? supabase
					.from("owner_earnings")
					.select("owner_user_id, amount, earning_type, period_month")
			: Promise.resolve({ data: [] }),
		isSuperAdmin
			? supabase
					.from("users")
					.select("id, full_name, role, share_pct")
					// Hanya role 'owner' — super_admin dikecualikan dari pembagian
					// bagi hasil (selalu Rp0), jadi tak perlu tampil di daftar.
					.eq("role", "owner")
					.eq("is_active", true)
					.order("full_name", { ascending: true })
			: Promise.resolve({ data: [] }),
	]);

	const revenueMtd = (revenueMtdData ?? []).reduce(
		(s, r) => s + (r.amount ?? 0),
		0,
	);
	const outstanding = (outstandingData as number | null) ?? 0;

	// Mode Simpel — angka inti dari Buku Besar: uang di bank (1-1xx) & total utang
	// (2-100 Hutang Crew + 2-101 Hutang Vendor + 2-102/2-103 Hutang Komisi).
	const glRows = await fetchAllJournalLines<{
		account_code: string;
		debit_amount: number;
		credit_amount: number;
	}>(supabase, "account_code, debit_amount, credit_amount", (q) =>
		q.or(
			"account_code.like.1-1%,account_code.eq.2-100,account_code.eq.2-101,account_code.eq.2-102,account_code.eq.2-103,account_code.eq.2-300",
		),
	);
	let cashGl = 0;
	let utangGl = 0;
	let hutangCrewGl = 0; // saldo 2-100 saja — sumber kebenaran utang ke crew
	// Bagi hasil owner yang sudah disisihkan tapi belum diambil. Bukan "utang"
	// dalam bahasa owner (itu ke pihak luar), tapi tetap uang yang sudah ada
	// pemiliknya — jadi tidak boleh ikut dihitung sebagai uang yang bebas dipakai.
	let bagiHasilGl = 0;
	for (const l of (glRows ?? []) as Array<{
		account_code: string;
		debit_amount: number;
		credit_amount: number;
	}>) {
		const net = Number(l.debit_amount) - Number(l.credit_amount);
		if (l.account_code.startsWith("1-1")) {
			cashGl += net; // aset: debit-normal
		} else if (l.account_code === "2-300") {
			bagiHasilGl += -net; // kewajiban: credit-normal
		} else {
			utangGl += -net;
		}
		if (l.account_code === "2-100") hutangCrewGl += -net;
	}

	const banks = (bankAccountsData ?? []) as Array<{
		id: string;
		account_name: string;
		bank_name: string;
		account_holder: string | null;
		coa_code: string | null;
	}>;
	// Saldo tiap rekening menurut buku besar. Sebelumnya daftar ini cuma
	// menampilkan uang masuk bulan ini, jadi uang KELUAR (bayar crew, beli
	// alat, koreksi) tidak pernah terlihat di sini sama sekali.
	const saldoByCoa = new Map(
		(await loadCashAccounts(supabase)).map((a) => [a.code, a.balance]),
	);

	const funds = (sinkingFundsData ?? []) as Array<{
		id: string;
		code: string;
		name: string;
		description: string | null;
		allocation_type: "percentage" | "flat" | null;
		allocation_value: number | null;
		target_balance: number | null;
	}>;
	// All sinking-fund balances in one grouped query instead of an RPC per
	// fund. See get_sinking_fund_balances migration.
	const { data: fundBalanceRows } = await supabase.rpc(
		"get_sinking_fund_balances",
	);
	const balanceById = new Map(
		(
			(fundBalanceRows ?? []) as Array<{ fund_id: string; balance: number }>
		).map((b) => [b.fund_id, Number(b.balance)]),
	);
	// Sum only over the funds this page surfaces (active set), matching prior
	// behaviour even though the RPC returns every fund.
	const totalSinking = funds.reduce(
		(s, f) => s + (balanceById.get(f.id) ?? 0),
		0,
	);
	const sinkingRows: SinkingFundRow[] = funds.map((f) => ({
		id: f.id,
		code: f.code,
		name: f.name,
		description: f.description,
		allocationType: f.allocation_type,
		allocationValue: f.allocation_value,
		targetBalance: f.target_balance,
		balance: balanceById.get(f.id) ?? 0,
	}));

	const recentSettlements = (
		(recentSettlementsData ?? []) as Array<{
			id: string;
			net_profit: number;
			revenue_net: number;
			opex_total: number;
			hpp_total: number;
			is_loss: boolean;
			closed_at: string;
			event:
				| {
						id: string;
						project_id: string;
						client_name: string;
						event_date: string;
				  }
				| Array<{
						id: string;
						project_id: string;
						client_name: string;
						event_date: string;
				  }>
				| null;
		}>
	).map((s) => ({
		...s,
		event: Array.isArray(s.event) ? s.event[0] : s.event,
	}));

	// Hutang Crew belum dibayar — aturannya di listUnpaidCrew() supaya bot
	// Telegram (/crew) memakai definisi yang sama persis dengan halaman ini.
	const { rows: unpaidCrew, total: unpaidCrewTotal } = await listUnpaidCrew(
		supabase,
		cutoffDate,
	);
	// Kalau saldo buku beda dari daftar, ini yang menjelaskan bedanya per event
	// — dulu banner-nya cuma menebak "mungkin ada jurnal manual".
	const crewGaps =
		Math.abs(unpaidCrewTotal - hutangCrewGl) > 0
			? await listCrewLiabilityGaps(supabase)
			: [];

	let ownerBreakdown: Array<{
		id: string;
		full_name: string;
		role: string;
		share_pct: number | null;
		earned: number;
		withdrawn: number;
		balance: number;
		/** Yang benar-benar boleh dicairkan sekarang (bulan berjalan belum ikut). */
		available: number;
		/** Jatah dari event bulan berjalan — baru bisa diambil bulan depan. */
		pending: number;
		/** Dipotong untuk patungan beban bersama (kost dll). */
		patungan: number;
		/** Bagi hasil tertunda (event kurang untung) — dilunasi event berikutnya. */
		arrears: number;
	}> = [];
	if (isSuperAdmin) {
		// Aturan bagi hasil: jatah dari event bulan M baru boleh ditarik mulai
		// bulan M+1. period_month diisi otomatis dari tanggal EVENT (lihat
		// 20260806_owner_pool_period.sql), jadi event 31 Jul yang baru di-settle
		// 2 Agu tetap terhitung jatah Juli.
		const currentMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
		const earningsByOwner = new Map<
			string,
			{
				earned: number;
				withdrawn: number;
				available: number;
				pending: number;
				patungan: number;
			}
		>();
		for (const e of (ownerEarningsData ?? []) as Array<{
			owner_user_id: string;
			amount: number;
			earning_type: string;
			period_month: string | null;
		}>) {
			const cur = earningsByOwner.get(e.owner_user_id) ?? {
				earned: 0,
				withdrawn: 0,
				available: 0,
				pending: 0,
				patungan: 0,
			};
			// Patungan (dipotong dari bagi hasil untuk beban bersama) dipisah dari
			// "sudah diambil" — uangnya tidak pernah sampai ke owner.
			if (e.earning_type === "contribution") {
				cur.patungan += Math.abs(e.amount);
				cur.available += e.amount;
				earningsByOwner.set(e.owner_user_id, cur);
				continue;
			}
			const isWithdrawal = e.earning_type === "withdrawal" || e.amount < 0;
			if (isWithdrawal) {
				cur.withdrawn += Math.abs(e.amount);
				// Penarikan selalu mengurangi yang bisa diambil, periode apa pun.
				cur.available += e.amount;
			} else {
				cur.earned += e.amount;
				const period = e.period_month ?? currentMonthStart;
				if (period < currentMonthStart) cur.available += e.amount;
				else cur.pending += e.amount;
			}
			earningsByOwner.set(e.owner_user_id, cur);
		}
		// Tunggakan bagi hasil yang belum lunas (subsidi silang antar event).
		const { data: arrearsData } = await supabase
			.from("owner_pool_arrears")
			.select("owner_user_id, remaining")
			.is("voided_at", null)
			.gt("remaining", 0);
		const arrearsByOwner = new Map<string, number>();
		for (const a of arrearsData ?? [])
			arrearsByOwner.set(
				a.owner_user_id as string,
				(arrearsByOwner.get(a.owner_user_id as string) ?? 0) +
					Number(a.remaining ?? 0),
			);
		ownerBreakdown = (
			(ownersListData ?? []) as Array<{
				id: string;
				full_name: string;
				role: string;
				share_pct: number | null;
			}>
		).map((o) => {
			const e = earningsByOwner.get(o.id) ?? {
				earned: 0,
				withdrawn: 0,
				available: 0,
				pending: 0,
				patungan: 0,
			};
			return {
				...o,
				earned: e.earned,
				withdrawn: e.withdrawn,
				balance: e.earned - e.withdrawn,
				available: e.available,
				pending: e.pending,
				patungan: e.patungan,
				arrears: arrearsByOwner.get(o.id) ?? 0,
			};
		});
	}

	// "Uang di bank" itu angka kotor: di dalamnya ada dana cadangan yang sudah
	// disisihkan, bagi hasil owner yang tinggal diambil, dan utang yang tinggal
	// dibayar. Owner yang melihat 16 juta lalu belanja 15 juta akan kaget saat
	// owner menarik bagi hasilnya. Angka inilah yang benar-benar bebas dipakai.
	const uangBebas = cashGl - totalSinking - bagiHasilGl - utangGl;
	const potongan = [
		totalSinking > 0 ? `dana cadangan ${formatRupiah(totalSinking)}` : null,
		bagiHasilGl > 0 ? `bagi hasil owner ${formatRupiah(bagiHasilGl)}` : null,
		utangGl > 0 ? `utang ${formatRupiah(utangGl)}` : null,
	].filter(Boolean);

	// Laporan bulanan (untung-rugi per event + arus kas) — bulan via ?bulan=.
	const thisYm = ymOf(today);
	const reportYm = bulan && /^\d{4}-\d{2}$/.test(bulan) ? bulan : thisYm;
	const [overview, pnl, pnlNow] = await Promise.all([
		getMonthlyOverview(supabase, reportYm),
		getMonthlyPnl(supabase, reportYm),
		reportYm === thisYm ? null : getMonthlyPnl(supabase, thisYm),
	]);
	const untungBulanIni = (pnlNow ?? pnl).net;

	const extrasByEvent = await getEventExtras(
		supabase,
		recentSettlements.flatMap((s) => (s.event ? [s.event.id] : [])),
	);
	const bebasHint =
		potongan.length > 0
			? `Sudah dikurangi ${potongan.join(", ")}.`
			: "Tidak ada yang perlu disisihkan.";

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Finance"
				description="Ringkasan keuangan bisnismu — dibaca dari atas ke bawah."
			/>

			<CatatLauncher
				data={catatData}
				autoOpen={catat === "1"}
				prefill={catatPrefill}
			/>

			{/* 1. Posisi uang sekarang */}
			<RekapCard className="space-y-4">
				<SectionHeader2
					icon={Wallet}
					title="Posisi uang sekarang"
					description="Uang yang ada, yang masih ditunggu, dan yang sudah ada pemiliknya."
				/>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					<SummaryTile
						label="Uang di rekening"
						hint="tunai + semua rekening & kartu"
						value={cashGl}
						tone="neutral"
					>
						<p className="mt-2 border-t border-border-subtle pt-2 text-[12.5px]">
							<span className="text-muted-foreground">Bebas dipakai </span>
							<span
								data-nominal
								className={cn(
									"tabular font-semibold",
									uangBebas >= 0 ? "text-emerald-700" : "text-rose-600",
								)}
							>
								{formatSignedRupiah(uangBebas)}
							</span>
							<span className="block text-[11.5px] leading-snug text-muted-foreground">
								{bebasHint}
							</span>
						</p>
					</SummaryTile>
					<SummaryTile
						label="Belum dibayar klien"
						hint="sisa tagihan event yang masih berjalan"
						value={outstanding}
						tone="neutral"
					/>
					<SummaryTile
						label={untungBulanIni < 0 ? "Rugi bulan ini" : "Untung bulan ini"}
						hint={`${monthLabelLong(thisYm)} · rinciannya di laporan bawah`}
						value={untungBulanIni}
						tone={untungBulanIni < 0 ? "loss" : "profit"}
					/>
				</div>

				<div className="grid gap-3 sm:grid-cols-3">
					<Fact
						label="Uang masuk bulan ini"
						value={revenueMtd}
						hint="DP + pelunasan dari klien"
					/>
					<Fact
						label="Utang"
						value={utangGl}
						hint="ke supplier, crew & komisi"
						warn={utangGl > 0}
					/>
					<Fact
						label="Dana cadangan"
						value={totalSinking}
						hint="disisihkan untuk alat, perawatan & darurat"
					/>
				</div>

				<SubGroup
					group={{
						title: "Uangnya ada di mana",
						hint: "saldo tiap rekening menurut pembukuan",
						defaultOpen: false,
						lines: banks.map((b) => ({
							label: b.account_name,
							note: b.bank_name,
							value: b.coa_code ? (saldoByCoa.get(b.coa_code) ?? 0) : 0,
						})),
						empty: "Belum ada rekening",
					}}
				/>
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					<TextLink href="/finance/bank-accounts">Kelola rekening</TextLink>
					<TextLink href="/finance/bulanan">
						Saldo awal/akhir per bulan
					</TextLink>
				</div>
			</RekapCard>

			{/* 2. Laporan bulanan */}
			<MonthlyReport
				pnl={pnl}
				cash={{
					opening: overview.current.opening,
					inflow: overview.current.inflow,
					outflow: overview.current.outflow,
					closing: overview.current.closing,
					outflowForExpense: overview.outflowForExpense,
					outflowNonExpense: overview.outflowNonExpense,
				}}
				monthLabel={monthLabelLong(reportYm)}
				freeCash={uangBebas}
				switcher={
					<MonthSwitcher
						months={overview.months}
						current={reportYm}
						prevYm={overview.prevYm}
						nextYm={overview.nextYm}
						labelOf={Object.fromEntries(
							overview.months.map((m) => [m, monthLabelLong(m)]),
						)}
					/>
				}
			/>

			{/* 3. Event terakhir ditutup */}
			<RekapCard className="space-y-3">
				<div className="flex items-start justify-between gap-3">
					<SectionHeader2
						icon={Receipt}
						title="Event terakhir ditutup"
						description="Untung akhir tiap event — sama dengan angka di halaman rekapnya."
					/>
					<TextLink href="/operations?status=completed">Lihat semua</TextLink>
				</div>
				{recentSettlements.length === 0 ? (
					<p className="text-[12.5px] text-muted-foreground">
						Belum ada event yang di-settle.
					</p>
				) : (
					<ul className="divide-y divide-border-subtle rounded-2xl border border-border-subtle">
						{recentSettlements.map((s) => {
							if (!s.event) return null;
							const extra = extrasByEvent.get(s.event.id) ?? 0;
							const profit = s.net_profit - extra;
							const biaya = s.hpp_total + s.opex_total + extra;
							return (
								<li key={s.id}>
									<Link
										href={`/operations/${s.event.project_id}/rekap`}
										className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
									>
										<span className="min-w-0">
											<span className="block truncate text-[13.5px] font-medium text-foreground">
												{s.event.client_name}
											</span>
											<span className="block text-[12px] text-muted-foreground">
												{formatDateID(s.event.event_date)} · masuk{" "}
												<span data-nominal className="tabular">
													{formatRupiah(s.revenue_net)}
												</span>{" "}
												· biaya{" "}
												<span data-nominal className="tabular">
													{formatRupiah(Math.round(biaya))}
												</span>
											</span>
										</span>
										<span className="shrink-0 text-right">
											<span
												data-nominal
												className={cn(
													"tabular block text-[14px] font-semibold",
													profit < 0 ? "text-rose-600" : "text-emerald-700",
												)}
											>
												{formatSignedRupiah(profit)}
											</span>
											<span className="tabular text-[11.5px] text-muted-foreground">
												{s.revenue_net > 0
													? `${Math.round((profit / s.revenue_net) * 100)}% untung`
													: "—"}
											</span>
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</RekapCard>

			{/* 4. Dana cadangan & utang crew */}
			<div className="grid gap-3 lg:grid-cols-3">
				<RekapCard className="space-y-4 lg:col-span-2">
					<SectionHeader2
						icon={PiggyBank}
						title="Dana cadangan"
						description="Uang yang disisihkan tiap event — sudah tidak dihitung sebagai uang bebas."
					/>
					{sinkingRows.length === 0 ? (
						<p className="text-[12.5px] text-muted-foreground">
							Belum ada dana cadangan.{" "}
							<TextLink href="/finance/sinking-funds">Buat</TextLink>
						</p>
					) : (
						<SinkingBreakdown funds={sinkingRows} total={totalSinking} />
					)}
				</RekapCard>

				<RekapCard className="space-y-3">
					<SectionHeader2
						icon={Users}
						title="Utang ke crew"
						description="Fee & talangan crew yang belum dibayar."
						badge={
							<span
								data-nominal
								className={cn(
									"tabular text-[14px] font-semibold",
									unpaidCrewTotal > 0
										? "text-amber-700"
										: "text-muted-foreground",
								)}
							>
								{formatRupiah(unpaidCrewTotal)}
							</span>
						}
					/>
					{Math.abs(unpaidCrewTotal - hutangCrewGl) > 0 && (
						<div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] leading-snug text-rose-800">
							<p>
								Daftar ({formatRupiah(unpaidCrewTotal)}) beda{" "}
								{formatRupiah(Math.abs(unpaidCrewTotal - hutangCrewGl))} dari
								saldo buku Hutang Crew ({formatRupiah(hutangCrewGl)}).
							</p>
							{crewGaps.length > 0 ? (
								<ul className="space-y-0.5">
									{crewGaps.map((g) => (
										<li key={g.projectId}>
											<Link
												href={`/operations/${g.projectId}/rekap`}
												className="underline underline-offset-2"
											>
												{g.clientName}
											</Link>{" "}
											— {g.gap > 0 ? "kurang" : "lebih"}{" "}
											{formatRupiah(Math.abs(g.gap))}
										</li>
									))}
								</ul>
							) : (
								<p>
									Kemungkinan ada jurnal manual di Hutang Crew — cek Akuntansi.
								</p>
							)}
						</div>
					)}
					{unpaidCrew.length === 0 ? (
						<p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-900">
							<CheckCircle2 className="size-4 shrink-0" aria-hidden />
							Semua fee crew sudah dibayar.
						</p>
					) : (
						<ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
							{unpaidCrew.map((r) => (
								<li key={r.id}>
									<Link
										href={`/operations/${r.event?.project_id}/rekap`}
										className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/50"
									>
										<span className="min-w-0">
											<span className="block truncate text-[13px] font-medium text-foreground">
												{r.crewName}
											</span>
											<span className="block truncate text-[11.5px] text-muted-foreground">
												{r.event?.client_name}
												{r.event?.event_date
													? ` · ${formatDateID(r.event.event_date)}`
													: ""}
											</span>
										</span>
										<span
											data-nominal
											className="tabular shrink-0 text-[13px] font-semibold text-amber-700"
										>
											{formatRupiah(r.amount)} →
										</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</RekapCard>
			</div>

			{/* 5. Bagi hasil owner */}
			{isSuperAdmin && ownerBreakdown.length > 0 && (
				<RekapCard className="space-y-3">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<SectionHeader2
							icon={HandCoins}
							title="Bagi hasil owner"
							description="Rp50.000 per event per owner. Jatah bulan ini baru bisa diambil bulan depan; kalau untung event kurang, jatahnya tertunda dan dibayar dari event berikutnya."
						/>
						<div className="flex flex-wrap items-center gap-2">
							<WithdrawalButton
								owners={ownerBreakdown.map<Owner>((o) => ({
									id: o.id,
									full_name: o.full_name,
									role: o.role,
									balance: o.available,
									pending: o.pending,
								}))}
								banks={banks.map((b) => ({
									id: b.id,
									label: b.account_name,
								}))}
							/>
							<PatunganDialog ownerCount={ownerBreakdown.length} />
						</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{ownerBreakdown.map((o) => (
							<div
								key={o.id}
								className="space-y-2 rounded-2xl border border-border-subtle p-4"
							>
								<div className="flex items-baseline justify-between gap-3">
									<span className="truncate text-[14px] font-semibold text-foreground">
										{o.full_name}
									</span>
									<span className="text-[12px] text-muted-foreground">
										Bisa diambil
									</span>
								</div>
								<p
									data-nominal
									className={cn(
										"tabular text-right text-[22px] font-bold leading-none tracking-[-0.02em]",
										o.available > 0
											? "text-emerald-700"
											: o.available < 0
												? "text-rose-600"
												: "text-muted-foreground",
									)}
								>
									{formatSignedRupiah(o.available)}
								</p>
								<div className="space-y-1 border-t border-border-subtle pt-2">
									<AmountRow label="Total didapat" value={o.earned} small />
									{o.pending > 0 && (
										<AmountRow
											label="Dari event bulan ini"
											note="bisa diambil bulan depan"
											value={o.pending}
											small
										/>
									)}
									{o.arrears > 0 && (
										<AmountRow
											label="Tertunda"
											note="dibayar dari event berikutnya"
											value={o.arrears}
											small
										/>
									)}
									<AmountRow label="Sudah diambil" value={-o.withdrawn} small />
									{o.patungan > 0 && (
										<AmountRow
											label="Dipotong patungan"
											value={-o.patungan}
											small
										/>
									)}
								</div>
							</div>
						))}
					</div>
					<TextLink href="/settings/crew">Atur porsi</TextLink>
				</RekapCard>
			)}
		</Container>
	);
}

function Fact({
	label,
	value,
	hint,
	warn,
}: {
	label: string;
	value: number;
	hint: string;
	warn?: boolean;
}) {
	return (
		<div className="rounded-xl bg-secondary/50 px-3 py-2.5">
			<p className="text-[12px] text-muted-foreground">{label}</p>
			<p
				data-nominal
				className={cn(
					"tabular mt-0.5 text-[16px] font-semibold",
					warn ? "text-amber-700" : "text-foreground",
				)}
			>
				{formatRupiah(Math.round(value))}
			</p>
			<p className="text-[11.5px] leading-snug text-muted-foreground">{hint}</p>
		</div>
	);
}

function TextLink({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			className="shrink-0 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
		>
			{children} →
		</Link>
	);
}
