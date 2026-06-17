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
import {
	type Owner,
	WithdrawalButton,
} from "@/components/finance/withdrawal-button";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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

export default async function FinancePage() {
	const me = await getCurrentUser();
	const isSuperAdmin = me?.profile.role === "super_admin";
	const supabase = await createClient();

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
			.gte("payment_date", ymStart)
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
			.gte("payment_date", ymStart)
			.lte("payment_date", ymEnd),
		supabase
			.from("bank_accounts")
			.select("id, account_name, bank_name, account_holder, coa_code, is_active")
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
					.select("owner_user_id, amount, earning_type")
			: Promise.resolve({ data: [] }),
		isSuperAdmin
			? supabase
					.from("users")
					.select("id, full_name, role, share_pct")
					.in("role", ["super_admin", "owner"])
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
	}>;

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

	let ownerBreakdown: Array<{
		id: string;
		full_name: string;
		role: string;
		share_pct: number | null;
		earned: number;
		withdrawn: number;
		balance: number;
	}> = [];
	if (isSuperAdmin) {
		const earningsByOwner = new Map<
			string,
			{ earned: number; withdrawn: number }
		>();
		for (const e of (ownerEarningsData ?? []) as Array<{
			owner_user_id: string;
			amount: number;
			earning_type: string;
		}>) {
			const cur = earningsByOwner.get(e.owner_user_id) ?? {
				earned: 0,
				withdrawn: 0,
			};
			if (e.earning_type === "withdrawal" || e.amount < 0) {
				cur.withdrawn += Math.abs(e.amount);
			} else {
				cur.earned += e.amount;
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
			const e = earningsByOwner.get(o.id) ?? { earned: 0, withdrawn: 0 };
			return {
				...o,
				earned: e.earned,
				withdrawn: e.withdrawn,
				balance: e.earned - e.withdrawn,
			};
		});
	}

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				title="Finance"
				description={`Cash flow, profit, sinking funds, dan owner pool · ${monthLabel}`}
			/>

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

			<section className="space-y-3">
				<div className="flex items-baseline justify-between px-5">
					<h2 className="text-base font-semibold tracking-tight">
						Profit breakdown · {monthLabel}
					</h2>
					<span className="text-muted-foreground tabular text-xs">
						{settlementsMtd.length} settled event
						{settlementsMtd.length !== 1 ? "s" : ""}
					</span>
				</div>
				<div className="border-border-subtle bg-card overflow-hidden rounded-[16px] border shadow-[var(--shadow-level-2)]">
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
							label="Owner pool"
							value={ownerPoolMtd}
							tone="primary"
							hint="Untuk distribusi"
						/>
					</dl>
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				<section className="space-y-3">
					<div className="flex items-baseline justify-between px-5">
						<h2 className="text-base font-semibold tracking-tight">
							Cash inflow per rekening
						</h2>
						<Link
							href="/finance/bank-accounts"
							className="text-muted-foreground hover:text-foreground text-xs"
						>
							Kelola →
						</Link>
					</div>
					{banks.length === 0 ? (
						<EmptyCard
							icon={Wallet}
							title="Belum ada bank account"
							hint="Tambah di /finance/bank-accounts"
						/>
					) : (
						<div className="border-border-subtle bg-card divide-border overflow-hidden rounded-[16px] border shadow-[var(--shadow-level-2)]">
							{banks.map((b) => {
								const inflow = inflowByBank.get(b.id) ?? 0;
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
													inflow > 0
														? "text-emerald-600 dark:text-emerald-400"
														: "text-muted-foreground"
												}`}
											>
												{inflow > 0 ? "+" : ""}
												{formatRupiah(inflow)}
											</p>
											<p className="text-muted-foreground text-[10px]">
												MTD inflow
											</p>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>

				<section className="space-y-3">
					<div className="flex items-baseline justify-between px-5">
						<h2 className="text-base font-semibold tracking-tight">
							Sinking funds
						</h2>
						<Link
							href="/finance/sinking-funds"
							className="text-muted-foreground hover:text-foreground text-xs"
						>
							Detail →
						</Link>
					</div>
					{funds.length === 0 ? (
						<EmptyCard
							icon={PiggyBank}
							title="Belum ada sinking fund"
							hint="Bikin di /finance/sinking-funds"
						/>
					) : (
						<div className="border-border-subtle bg-card divide-border overflow-hidden rounded-[16px] border shadow-[var(--shadow-level-2)]">
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
				</section>
			</div>

			{isSuperAdmin && ownerBreakdown.length > 0 && (
				<section className="space-y-3">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h2 className="text-base font-semibold tracking-tight">
							Owner pool & earnings
						</h2>
						<div className="flex items-center gap-2">
							<WithdrawalButton
								owners={ownerBreakdown.map<Owner>((o) => ({
									id: o.id,
									full_name: o.full_name,
									role: o.role,
									balance: o.balance,
								}))}
								banks={banks.map((b) => ({
									id: b.id,
									label: b.account_name,
								}))}
							/>
							<Link
								href="/settings/crew"
								className="text-muted-foreground hover:text-foreground text-xs"
							>
								Investor share →
							</Link>
						</div>
					</div>
					<div className="border-border-subtle bg-card overflow-x-auto rounded-[16px] border shadow-[var(--shadow-level-2)]">
						<table className="w-full text-sm">
							<thead className="bg-muted/40">
								<tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
									<th className="px-4 py-2.5 text-left font-medium">Owner</th>
									<th className="px-4 py-2.5 text-right font-medium">Share</th>
									<th className="px-4 py-2.5 text-right font-medium">Earned</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Withdrawn
									</th>
									<th className="px-4 py-2.5 text-right font-medium">
										Balance
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
										</td>
										<td className="text-foreground tabular px-4 py-2.5 text-right font-semibold">
											<span
												className={
													o.balance > 0
														? "text-emerald-600 dark:text-emerald-400"
														: o.balance < 0
															? "text-rose-600 dark:text-rose-400"
															: "text-muted-foreground"
												}
											>
												{formatRupiah(o.balance)}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}

			<section className="space-y-3">
				<div className="flex items-baseline justify-between px-5">
					<h2 className="text-base font-semibold tracking-tight">
						Settlement terakhir
					</h2>
					<Link
						href="/operations?status=completed"
						className="text-muted-foreground hover:text-foreground text-xs"
					>
						Lihat semua →
					</Link>
				</div>
				{recentSettlements.length === 0 ? (
					<EmptyCard
						icon={Receipt}
						title="Belum ada settlement"
						hint="Settle event pertama via /operations/[id]/settle"
					/>
				) : (
					<div className="border-border-subtle bg-card overflow-hidden rounded-[16px] border shadow-[var(--shadow-level-2)]">
						<table className="w-full text-xs">
							<thead className="bg-muted/40">
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
			</section>
		</Container>
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

function EmptyCard({
	icon: Icon,
	title,
	hint,
}: {
	icon: typeof Receipt;
	title: string;
	hint: string;
}) {
	return (
		<div className="border-border-subtle bg-card flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
			<Icon className="text-muted-foreground h-7 w-7" />
			<div className="space-y-0.5">
				<p className="text-foreground text-sm font-medium">{title}</p>
				<p className="text-muted-foreground text-xs">{hint}</p>
			</div>
		</div>
	);
}
