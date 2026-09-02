import {
	AlertCircle,
	ArrowDownRight,
	ArrowUpRight,
	ChevronRight,
	PiggyBank,
	Receipt,
	TrendingDown,
	TrendingUp,
	Wallet,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { CatatLauncher } from "@/components/finance/catat/catat-launcher";
import { PatunganDialog } from "@/components/finance/patungan-dialog";
import {
	type Owner,
	WithdrawalButton,
} from "@/components/finance/withdrawal-button";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/ui/info-hint";
import { getCurrentUser } from "@/lib/auth/get-user";
import { fetchAllJournalLines } from "@/lib/finance/balance-guard";
import { loadCashAccounts } from "@/lib/finance/cash-accounts";
import { loadCatatData } from "@/lib/finance/quick-record-data";
import {
	listCrewLiabilityGaps,
	listUnpaidCrew,
} from "@/lib/finance/unpaid-crew";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function startOfMonth(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const ID_MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

export default async function FinancePage({
	searchParams,
}: {
	searchParams: Promise<{
		catat?: string;
		amount?: string;
		cat?: string;
		note?: string;
		ev?: string;
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
	const monthLabel = `${ID_MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;

	const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
	const lmStart = startOfMonth(lastMonth);
	const lmEnd = lastDayOfMonth(
		lastMonth.getFullYear(),
		lastMonth.getMonth() + 1,
	);

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
		{ data: revenueLmData },
		{ data: settlementsMtdData },
		{ data: settlementsLmData },
		{ data: outstandingData },
		{ data: paymentByBankData },
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
		supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", lmStart)
			.lte("payment_date", lmEnd),
		supabase
			.from("event_settlements")
			.select(
				"net_profit, revenue_net, hpp_total, opex_total, sinking_total, owner_pool_total, is_loss",
			)
			.eq("is_reopened", false)
			.gte("closed_at", `${ymStart}T00:00:00Z`)
			.lte("closed_at", `${ymEnd}T23:59:59Z`),
		supabase
			.from("event_settlements")
			.select("net_profit")
			.eq("is_reopened", false)
			.gte("closed_at", `${lmStart}T00:00:00Z`)
			.lte("closed_at", `${lmEnd}T23:59:59Z`),
		// Outstanding receivables — SUM in Postgres instead of fetch-all + JS
		// reduce. See get_outstanding_total migration.
		supabase.rpc("get_outstanding_total"),
		supabase
			.from("payments")
			.select("amount, bank_account_id")
			.eq("is_reversed", false)
			.gte("payment_date", revStart)
			.lte("payment_date", ymEnd),
		supabase
			.from("bank_accounts")
			.select(
				"id, account_name, bank_name, account_holder, coa_code, is_active",
			)
			.eq("is_active", true)
			.order("account_name", { ascending: true }),
		supabase
			.from("sinking_funds")
			.select("id, name, target_balance")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		supabase
			.from("event_settlements")
			.select(
				`id, net_profit, revenue_net, opex_total, hpp_total, is_loss, closed_at,
				event:events!inner(id, project_id, client_name, event_date)`,
			)
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
	const revenueLm = (revenueLmData ?? []).reduce(
		(s, r) => s + (r.amount ?? 0),
		0,
	);
	const revenueDelta =
		revenueLm > 0 ? ((revenueMtd - revenueLm) / revenueLm) * 100 : null;

	const settlementsMtd = (settlementsMtdData ?? []) as Array<{
		net_profit: number;
		revenue_net: number;
		hpp_total: number;
		opex_total: number;
		sinking_total: number;
		owner_pool_total: number;
		is_loss: boolean;
	}>;
	const netProfitMtd = settlementsMtd.reduce(
		(s, r) => s + (r.net_profit ?? 0),
		0,
	);
	const revenueNetMtd = settlementsMtd.reduce(
		(s, r) => s + (r.revenue_net ?? 0),
		0,
	);
	const hppMtd = settlementsMtd.reduce((s, r) => s + (r.hpp_total ?? 0), 0);
	const opexMtd = settlementsMtd.reduce((s, r) => s + (r.opex_total ?? 0), 0);
	const sinkingMtd = settlementsMtd.reduce(
		(s, r) => s + (r.sinking_total ?? 0),
		0,
	);
	const ownerPoolMtd = settlementsMtd.reduce(
		(s, r) => s + (r.owner_pool_total ?? 0),
		0,
	);
	const lossCount = settlementsMtd.filter((s) => s.is_loss).length;

	const netProfitLm = (
		(settlementsLmData ?? []) as Array<{ net_profit: number }>
	).reduce((s, r) => s + (r.net_profit ?? 0), 0);
	const profitDelta =
		netProfitLm !== 0
			? ((netProfitMtd - netProfitLm) / Math.abs(netProfitLm)) * 100
			: null;
	const marginMtd =
		revenueNetMtd > 0 ? (netProfitMtd / revenueNetMtd) * 100 : 0;

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

	const inflowByBank = new Map<string, number>();
	for (const p of (paymentByBankData ?? []) as Array<{
		amount: number;
		bank_account_id: string;
	}>) {
		const key = p.bank_account_id;
		inflowByBank.set(key, (inflowByBank.get(key) ?? 0) + (p.amount ?? 0));
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
		name: string;
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

	// Mode Simpel — 6 angka inti dalam bahasa awam (owner non-akuntan).
	const simpleStats: Array<{
		label: string;
		value: number;
		hint: string;
		tone?: "good" | "warn";
		/** Angka pendamping di bawah nilai utama. */
		sub?: { label: string; value: number; tone?: "good" | "warn" };
	}> = [
		{
			label: "Uang di bank",
			value: cashGl,
			hint:
				potongan.length > 0
					? `Total uang tunai + saldo semua rekening & kartu saat ini. Di dalamnya masih ada ${potongan.join(", ")} — yang sudah ada pemiliknya. Sisanya itulah yang bebas dipakai.`
					: "Total uang tunai + saldo semua rekening bank saat ini, menurut pembukuan.",
			sub:
				potongan.length > 0
					? {
							label: "Bebas dipakai",
							value: uangBebas,
							tone: uangBebas >= 0 ? "good" : "warn",
						}
					: undefined,
		},
		{
			label: "Uang masuk bulan ini",
			value: revenueMtd,
			hint: "Total pembayaran klien (DP + pelunasan) yang diterima bulan ini.",
		},
		{
			label: "Untung bulan ini",
			value: netProfitMtd,
			hint: "Pendapatan dikurangi semua biaya, dari event yang sudah di-settle bulan ini.",
			tone: netProfitMtd >= 0 ? "good" : "warn",
		},
		{
			label: "Belum dibayar klien",
			value: outstanding,
			hint: "Sisa tagihan event yang masih berjalan — uang yang belum masuk.",
			tone: outstanding > 0 ? "warn" : undefined,
		},
		{
			label: "Saya utang",
			value: utangGl,
			hint: "Utang ke supplier + fee crew yang belum dibayar.",
			tone: utangGl > 0 ? "warn" : undefined,
		},
		{
			label: "Dana cadangan",
			value: totalSinking,
			hint: "Uang yang disisihkan tiap event untuk ganti alat, perawatan, darurat, dll. Sudah dikeluarkan dari angka 'Bebas dipakai'.",
		},
	];

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Finance"
				description={`Ringkasan keuangan bisnismu · ${monthLabel}`}
			/>

			<CatatLauncher
				data={catatData}
				autoOpen={catat === "1"}
				prefill={catatPrefill}
			/>

			{/* Mode Simpel — angka inti yang owner butuh, bahasa awam + penjelasan */}
			<div className="rounded-2xl border border-border-subtle bg-card p-4 sm:p-5">
				<div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
					{simpleStats.map((s) => (
						<div key={s.label}>
							<div className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
								<span>{s.label}</span>
								<InfoHint title={s.label}>{s.hint}</InfoHint>
							</div>
							<div
								className={cn(
									"mt-0.5 truncate text-[17px] font-semibold tabular sm:text-lg",
									s.tone === "good" && "text-emerald-700",
									s.tone === "warn" && "text-amber-700",
								)}
							>
								{formatRupiah(s.value)}
							</div>
							{s.sub ? (
								<div className="mt-0.5 flex items-baseline gap-1 text-[12px]">
									<span className="text-muted-foreground">{s.sub.label}</span>
									<span
										className={cn(
											"tabular font-semibold",
											s.sub.tone === "good" && "text-emerald-700",
											s.sub.tone === "warn" && "text-amber-700",
										)}
									>
										{formatRupiah(s.sub.value)}
									</span>
								</div>
							) : null}
						</div>
					))}
				</div>
				<div className="border-border-subtle mt-4 border-t pt-3">
					<Link
						href="/finance/bulanan"
						className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
					>
						Lihat saldo awal/akhir & untung per bulan →
					</Link>
				</div>
			</div>

			<KpiRow>
				<KpiCard
					label="Revenue MTD (cash)"
					value={formatRupiah(revenueMtd)}
					hint={
						revenueDelta !== null
							? `Uang diterima · ${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(1)}% vs ${ID_MONTH_NAMES[lastMonth.getMonth()]}`
							: "Uang diterima bulan ini (cash basis). P&L pakai revenue settled (accrual)."
					}
					icon={Wallet2}
					accent={
						revenueDelta !== null && revenueDelta < 0 ? "amber" : "emerald"
					}
				/>
				<KpiCard
					label="Net Profit MTD"
					value={formatRupiah(netProfitMtd)}
					hint={
						profitDelta !== null
							? `${profitDelta >= 0 ? "+" : ""}${profitDelta.toFixed(1)}% vs ${ID_MONTH_NAMES[lastMonth.getMonth()]}${lossCount > 0 ? ` · ${lossCount} loss` : ""}`
							: marginMtd
								? `Margin ${marginMtd.toFixed(1)}%`
								: "Belum ada settlement"
					}
					icon={netProfitMtd >= 0 ? TrendingUp : TrendingDown}
					accent={
						netProfitMtd < 0 ? "rose" : marginMtd > 25 ? "emerald" : "primary"
					}
				/>
				<KpiCard
					label="Outstanding"
					value={formatRupiah(outstanding)}
					hint="Piutang event live (excl. archive)"
					icon={AlertCircle}
					accent={
						outstanding >= 15_000_000
							? "rose"
							: outstanding >= 5_000_000
								? "amber"
								: "sky"
					}
				/>
				<KpiCard
					label="Sinking Total"
					value={formatRupiah(totalSinking)}
					hint={`${funds.length} fund${funds.length !== 1 ? "s" : ""} aktif`}
					icon={PiggyBank}
					accent="primary"
				/>
			</KpiRow>

			<SectionCard
				title={
					<>
						Profit breakdown
						<span className="text-muted-foreground font-medium">
							{" "}
							· {monthLabel}
						</span>
					</>
				}
				meta={
					<span className="text-muted-foreground tabular text-xs">
						{settlementsMtd.length} settled event
						{settlementsMtd.length !== 1 ? "s" : ""}
					</span>
				}
			>
				<dl className="divide-border grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5 lg:divide-y-0">
					<BreakdownStat
						label="Revenue net"
						value={revenueNetMtd}
						tone="emerald"
						sign="+"
					/>
					<BreakdownStat label="HPP" value={hppMtd} tone="rose" sign="−" />
					<BreakdownStat label="OpEx" value={opexMtd} tone="rose" sign="−" />
					<BreakdownStat
						label="Sinking"
						value={sinkingMtd}
						tone="amber"
						sign="−"
						hint="Disisihin"
					/>
					<BreakdownStat
						label="Bagi hasil owner"
						value={ownerPoolMtd}
						tone="primary"
						hint="Jatah owner"
					/>
				</dl>
			</SectionCard>

			<SectionCard
				title={
					<>
						Hutang ke crew
						<span className="text-muted-foreground font-medium">
							{" "}
							· belum dibayar
						</span>
					</>
				}
				titleExtra={
					<InfoHint title="Hutang ke crew">
						Fee + reimbursement crew dari event yang sudah di-settle tapi belum
						kamu klik "Bayar". Angka ini = saldo akun Hutang Crew (2-100) di
						pembukuan. Klik tiap baris untuk membayar.
					</InfoHint>
				}
				meta={
					<span
						className={cn(
							"tabular text-sm font-semibold",
							unpaidCrewTotal > 0 ? "text-amber-700" : "text-muted-foreground",
						)}
					>
						{formatRupiah(unpaidCrewTotal)}
					</span>
				}
			>
				{Math.abs(unpaidCrewTotal - hutangCrewGl) > 0 && (
					<div className="border-border-subtle bg-rose-100/50 border-b px-4 py-2.5 text-[11px] leading-relaxed text-rose-700">
						<p>
							⚠ Daftar di bawah ({formatRupiah(unpaidCrewTotal)}) beda{" "}
							{formatRupiah(Math.abs(unpaidCrewTotal - hutangCrewGl))} dari
							saldo buku Hutang Crew 2-100 ({formatRupiah(hutangCrewGl)}).
						</p>
						{crewGaps.length > 0 ? (
							<>
								<p className="mt-1">
									Penyebabnya talangan crew yang tidak pernah tertaut ke crew
									mana pun — jadi tidak bisa dibayar lewat tombol Bayar:
								</p>
								<ul className="mt-1 space-y-0.5">
									{crewGaps.map((g) => (
										<li key={g.projectId}>
											<Link
												href={`/operations/${g.projectId}/rekap`}
												className="underline underline-offset-2 hover:text-rose-900"
											>
												{g.clientName}
											</Link>{" "}
											— dibukukan {formatRupiah(g.booked)}, bisa dibayar{" "}
											{formatRupiah(g.payable)} →{" "}
											<strong>
												{g.gap > 0 ? "kurang" : "lebih"}{" "}
												{formatRupiah(Math.abs(g.gap))}
											</strong>
										</li>
									))}
								</ul>
								<p className="mt-1 text-rose-700/80">
									Kalau crew sudah menerima uangnya di luar aplikasi, buat
									jurnal koreksi di Akuntansi. Kalau belum, isi kolom talangan
									di rekap event tsb lalu bayar seperti biasa.
								</p>
							</>
						) : (
							<p className="mt-1">
								Tidak ketemu event penyebabnya — kemungkinan ada jurnal manual
								di 2-100, cek di Akuntansi.
							</p>
						)}
					</div>
				)}
				{unpaidCrew.length === 0 ? (
					<EmptyState
						icon={Wallet}
						title="Semua fee crew sudah dibayar"
						hint="Tidak ada utang fee crew yang menunggu pembayaran."
					/>
				) : (
					<div className="divide-border">
						{unpaidCrew.map((r) => (
							<Link
								key={r.id}
								href={`/operations/${r.event?.project_id}/rekap`}
								className="press-down border-border-default hover:bg-muted/40 flex items-center justify-between gap-3 border-b px-4 py-3 transition-colors last:border-b-0"
							>
								<div className="min-w-0 flex-1 space-y-0.5">
									<p className="text-foreground truncate text-sm font-medium">
										{r.crewName}
									</p>
									<p className="text-muted-foreground tabular text-xs">
										{r.event?.client_name}
										{r.event?.event_date
											? ` · ${formatDateID(r.event.event_date)}`
											: ""}
									</p>
								</div>
								<div className="text-right">
									<p className="tabular text-sm font-semibold text-amber-700">
										{formatRupiah(r.amount)}
									</p>
									<p className="text-muted-foreground text-[10px]">Bayar →</p>
								</div>
							</Link>
						))}
					</div>
				)}
			</SectionCard>

			<div className="grid gap-3 lg:grid-cols-2">
				<SectionCard
					title="Cash inflow per rekening"
					meta={<HeaderLink href="/finance/bank-accounts">Kelola</HeaderLink>}
				>
					{banks.length === 0 ? (
						<EmptyState
							icon={Wallet}
							title="Belum ada bank account"
							hint="Tambah di /finance/bank-accounts"
						/>
					) : (
						<div className="divide-border">
							{banks.map((b) => {
								const inflow = inflowByBank.get(b.id) ?? 0;
								const saldo = b.coa_code
									? saldoByCoa.get(b.coa_code)
									: undefined;
								return (
									<div
										key={b.id}
										className="border-border-default flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
									>
										<div className="min-w-0 flex-1 space-y-0.5">
											<p className="text-foreground truncate text-sm font-medium">
												{b.account_name}
											</p>
											<p className="text-muted-foreground tabular text-xs">
												{b.bank_name}
												{b.account_holder ? ` · ${b.account_holder}` : ""}
											</p>
										</div>
										<div className="text-right">
											<p
												className={`tabular text-sm font-semibold ${
													saldo !== undefined && saldo < 0
														? "text-rose-600 dark:text-rose-400"
														: "text-foreground"
												}`}
											>
												{saldo === undefined ? "—" : formatRupiah(saldo)}
											</p>
											<p className="text-muted-foreground text-[10px]">
												saldo
												{inflow > 0 ? (
													<>
														{" · "}
														<span className="tabular text-emerald-600 dark:text-emerald-400">
															+{formatRupiah(inflow)}
														</span>{" "}
														bulan ini
													</>
												) : null}
											</p>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</SectionCard>

				<SectionCard
					title="Sinking funds"
					meta={<HeaderLink href="/finance/sinking-funds">Detail</HeaderLink>}
				>
					{funds.length === 0 ? (
						<EmptyState
							icon={PiggyBank}
							title="Belum ada sinking fund"
							hint="Bikin di /finance/sinking-funds"
						/>
					) : (
						<div className="divide-border">
							{funds.map((f) => {
								const balance = balanceById.get(f.id) ?? 0;
								const target = f.target_balance ?? 0;
								const pct =
									target > 0 ? Math.min(100, (balance / target) * 100) : null;
								return (
									<Link
										key={f.id}
										href={`/finance/sinking-funds/${f.id}/movements`}
										className="press-down border-border-default hover:bg-muted/40 flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0"
									>
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex items-center justify-between gap-2">
												<p className="text-foreground truncate text-sm font-medium">
													{f.name}
												</p>
												<p className="tabular text-foreground text-sm font-semibold">
													{formatRupiah(balance)}
												</p>
											</div>
											{pct !== null && (
												<div className="space-y-0.5">
													<div className="bg-muted h-1.5 overflow-hidden rounded-full">
														<div
															className="bg-primary h-full transition-all"
															style={{ width: `${pct}%` }}
														/>
													</div>
													<p className="text-muted-foreground tabular text-[10px]">
														{pct.toFixed(0)}% dari target {formatRupiah(target)}
													</p>
												</div>
											)}
										</div>
										<ChevronRight className="text-muted-foreground/60 h-4 w-4" />
									</Link>
								);
							})}
						</div>
					)}
				</SectionCard>
			</div>

			{isSuperAdmin && ownerBreakdown.length > 0 && (
				<SectionCard
					title="Bagi hasil owner"
					titleExtra={
						<InfoHint title="Bagi hasil owner">
							Jatah keuntungan tiap owner dari event yang sudah selesai
							(Rp50.000 per event). Jatah dari event bulan ini baru bisa diambil
							bulan depan — jadi "Bisa diambil" hanya menghitung bulan-bulan
							yang sudah lewat, dikurangi yang sudah ditarik.
						</InfoHint>
					}
					meta={
						<div className="flex items-center gap-3">
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
							<HeaderLink href="/settings/crew">Atur porsi</HeaderLink>
						</div>
					}
				>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="bg-card border-b border-border-subtle">
								<tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
									<th className="px-4 py-2.5 text-left font-medium">Owner</th>
									<th className="px-4 py-2.5 text-right font-medium">Porsi</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Total didapat
									</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Sudah diambil
									</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Bisa diambil
									</th>
								</tr>
							</thead>
							<tbody className="divide-border divide-y">
								{ownerBreakdown.map((o) => (
									<tr key={o.id}>
										<td className="px-4 py-2.5">
											<div className="flex items-center gap-2">
												<span className="text-foreground text-sm font-medium">
													{o.full_name}
												</span>
												<Badge
													variant="outline"
													className="text-[10px] uppercase"
												>
													{o.role === "super_admin" ? "super" : o.role}
												</Badge>
											</div>
										</td>
										<td className="text-muted-foreground tabular px-4 py-2.5 text-right text-xs">
											{o.share_pct !== null ? `${o.share_pct}%` : "—"}
										</td>
										<td className="text-foreground tabular px-4 py-2.5 text-right">
											{o.earned > 0 ? formatRupiah(o.earned) : "—"}
										</td>
										<td className="text-muted-foreground tabular px-4 py-2.5 text-right">
											{o.withdrawn > 0 ? formatRupiah(o.withdrawn) : "—"}
											{o.patungan > 0 && (
												<span className="block text-[10.5px]">
													patungan {formatRupiah(o.patungan)}
												</span>
											)}
										</td>
										<td className="text-foreground tabular px-4 py-2.5 text-right font-semibold">
											<span
												className={
													o.available > 0
														? "text-emerald-600 dark:text-emerald-400"
														: o.available < 0
															? "text-rose-600 dark:text-rose-400"
															: "text-muted-foreground"
												}
											>
												{formatRupiah(o.available)}
											</span>
											{o.pending > 0 && (
												<span className="text-muted-foreground block text-[10.5px] font-normal">
													+{formatRupiah(o.pending)} bulan ini
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</SectionCard>
			)}

			<SectionCard
				title="Settlement terakhir"
				meta={
					<HeaderLink href="/operations?status=completed">
						Lihat semua
					</HeaderLink>
				}
			>
				{recentSettlements.length === 0 ? (
					<EmptyState
						icon={Receipt}
						title="Belum ada settlement"
						hint="Settle event pertama via /operations/[id]/settle"
					/>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead className="bg-card border-b border-border-subtle">
								<tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
									<th className="px-4 py-2.5 text-left font-medium">Event</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Revenue
									</th>
									<th className="px-4 py-2.5 text-right font-medium">HPP</th>
									<th className="px-4 py-2.5 text-right font-medium">OpEx</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Net Profit
									</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Settled
									</th>
								</tr>
							</thead>
							<tbody className="divide-border divide-y">
								{recentSettlements.map((s) => {
									if (!s.event) return null;
									return (
										<tr key={s.id} className="hover:bg-muted/20">
											<td className="px-4 py-2.5">
												<Link
													href={`/operations/${s.event.project_id}`}
													className="text-primary text-sm font-medium hover:underline"
												>
													{s.event.client_name}
												</Link>
												<p className="text-muted-foreground tabular text-[10px]">
													{s.event.project_id} ·{" "}
													{formatDateID(s.event.event_date)}
												</p>
											</td>
											<td className="text-foreground tabular px-4 py-2.5 text-right">
												{formatRupiah(s.revenue_net)}
											</td>
											<td className="text-muted-foreground tabular px-4 py-2.5 text-right">
												{formatRupiah(s.hpp_total)}
											</td>
											<td className="text-muted-foreground tabular px-4 py-2.5 text-right">
												{formatRupiah(s.opex_total)}
											</td>
											<td
												className={`tabular px-4 py-2.5 text-right font-semibold ${
													s.is_loss
														? "text-rose-600 dark:text-rose-400"
														: "text-emerald-600 dark:text-emerald-400"
												}`}
											>
												<span className="inline-flex items-center gap-1">
													{s.is_loss ? (
														<ArrowDownRight className="h-3 w-3" />
													) : (
														<ArrowUpRight className="h-3 w-3" />
													)}
													{formatRupiah(s.net_profit)}
												</span>
											</td>
											<td className="text-muted-foreground tabular px-4 py-2.5 text-right">
												{formatDateID(s.closed_at.slice(0, 10))}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</SectionCard>
		</Container>
	);
}

/**
 * SectionCard — bento section: judul + meta/aksi hidup DI DALAM card sebagai
 * header ber-hairline, bukan teks mengambang di atas card. Konten (list/tabel)
 * full-bleed di bawahnya.
 */
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

function HeaderLink({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
		>
			{children} →
		</Link>
	);
}

function BreakdownStat({
	label,
	value,
	tone,
	sign,
	hint,
}: {
	label: string;
	value: number;
	tone: "primary" | "emerald" | "amber" | "rose" | "muted";
	sign?: "+" | "−";
	hint?: string;
}) {
	const cls =
		tone === "primary"
			? "text-primary"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: tone === "rose"
					? "text-rose-600 dark:text-rose-400"
					: tone === "amber"
						? "text-amber-600 dark:text-amber-400"
						: "text-muted-foreground";
	return (
		<div className="space-y-1 px-4 py-3">
			<dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
				{label}
			</dt>
			<dd className={`tabular text-base font-semibold ${cls}`}>
				{sign && value > 0 ? sign : ""}
				{formatRupiah(value)}
			</dd>
			{hint && <p className="text-muted-foreground text-[10px]">{hint}</p>}
		</div>
	);
}

function EmptyState({
	icon: Icon,
	title,
	hint,
}: {
	icon: typeof Receipt;
	title: string;
	hint: string;
}) {
	return (
		<div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
			<Icon className="text-muted-foreground h-7 w-7" />
			<div className="space-y-0.5">
				<p className="text-foreground text-sm font-medium">{title}</p>
				<p className="text-muted-foreground text-xs">{hint}</p>
			</div>
		</div>
	);
}
