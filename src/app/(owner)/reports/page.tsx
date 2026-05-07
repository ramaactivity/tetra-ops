import {
	BarChart3,
	CalendarRange,
	ChevronLeft,
	ChevronRight,
	Coins,
	Receipt,
	TrendingDown,
	TrendingUp,
	Users,
	UsersRound,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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

const ID_MONTH_NAMES_FULL = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function startOfMonthFromYM(year: number, month: number): string {
	return `${year}-${String(month).padStart(2, "0")}-01`;
}

function parseMonthParam(s: string | undefined): {
	year: number;
	month: number;
	ym: string;
} {
	const today = new Date();
	if (s && /^\d{4}-\d{2}$/.test(s)) {
		const [y, m] = s.split("-").map(Number);
		return { year: y, month: m, ym: s };
	}
	const y = today.getFullYear();
	const m = today.getMonth() + 1;
	return {
		year: y,
		month: m,
		ym: `${y}-${String(m).padStart(2, "0")}`,
	};
}

function shiftMonth(ym: string, delta: number): string {
	const [y, m] = ym.split("-").map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Tab = "pnl" | "crew" | "owner";

export default async function ReportsPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; month?: string }>;
}) {
	const params = await searchParams;
	const tab: Tab =
		params.tab === "crew" ? "crew" : params.tab === "owner" ? "owner" : "pnl";
	const { year, month, ym } = parseMonthParam(params.month);
	const ymStart = startOfMonthFromYM(year, month);
	const ymEnd = lastDayOfMonth(year, month);
	const monthLabel = `${ID_MONTH_NAMES_FULL[month - 1]} ${year}`;

	const me = await getCurrentUser();
	const isSuperAdmin = me?.profile.role === "super_admin";

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-fluid-h1 font-semibold tracking-tight">Reports</h1>
					<p className="text-muted-foreground text-sm">
						Monthly P&amp;L, crew performance, owner statement.
					</p>
				</div>
				<MonthSwitcher ym={ym} tab={tab} />
			</div>

			<div className="border-border-default flex gap-1 border-b">
				<TabLink
					href={`/reports?tab=pnl&month=${ym}`}
					label="Monthly P&L"
					icon={BarChart3}
					active={tab === "pnl"}
				/>
				<TabLink
					href={`/reports?tab=crew&month=${ym}`}
					label="Crew Performance"
					icon={UsersRound}
					active={tab === "crew"}
				/>
				{isSuperAdmin && (
					<TabLink
						href={`/reports?tab=owner&month=${ym}`}
						label="Owner Statement"
						icon={Coins}
						active={tab === "owner"}
					/>
				)}
			</div>

			{tab === "pnl" && (
				<PnlSection ymStart={ymStart} ymEnd={ymEnd} monthLabel={monthLabel} />
			)}
			{tab === "crew" && (
				<CrewSection ymStart={ymStart} ymEnd={ymEnd} monthLabel={monthLabel} />
			)}
			{tab === "owner" && isSuperAdmin && (
				<OwnerSection ymStart={ymStart} ymEnd={ymEnd} monthLabel={monthLabel} />
			)}
			{tab === "owner" && !isSuperAdmin && (
				<div className="border-destructive/30 bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Owner statement hanya untuk super_admin.
					</p>
				</div>
			)}
		</div>
	);
}

function MonthSwitcher({ ym, tab }: { ym: string; tab: Tab }) {
	const prev = shiftMonth(ym, -1);
	const next = shiftMonth(ym, +1);
	const [year, month] = ym.split("-").map(Number);
	return (
		<div className="border-border-default bg-surface-2 flex items-center gap-1 rounded-md border p-0.5">
			<Link
				href={`/reports?tab=${tab}&month=${prev}`}
				aria-label="Previous month"
				className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded"
			>
				<ChevronLeft className="h-4 w-4" />
			</Link>
			<div className="text-foreground tabular flex h-8 items-center gap-1.5 px-3 text-sm font-medium">
				<CalendarRange className="text-muted-foreground h-3.5 w-3.5" />
				{ID_MONTH_NAMES[month - 1]} {year}
			</div>
			<Link
				href={`/reports?tab=${tab}&month=${next}`}
				aria-label="Next month"
				className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded"
			>
				<ChevronRight className="h-4 w-4" />
			</Link>
		</div>
	);
}

function TabLink({
	href,
	label,
	icon: Icon,
	active,
}: {
	href: string;
	label: string;
	icon: typeof BarChart3;
	active: boolean;
}) {
	return (
		<Link
			href={href}
			className={`relative inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
				active
					? "text-foreground"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			<Icon className="h-4 w-4" />
			{label}
			{active && (
				<span className="bg-primary absolute inset-x-0 bottom-0 h-0.5" />
			)}
		</Link>
	);
}

// ─── P&L Section ──────────────────────────────────────────────────────────

async function PnlSection({
	ymStart,
	ymEnd,
	monthLabel,
}: {
	ymStart: string;
	ymEnd: string;
	monthLabel: string;
}) {
	const supabase = await createClient();

	const [
		{ data: settlements },
		{ data: revenueData },
		{ data: bookingsByChannel },
	] = await Promise.all([
		supabase
			.from("event_settlements")
			.select(
				`net_profit, revenue_net, hpp_total, opex_total, sinking_total,
				owner_pool_total, fee_lead, fee_asisten, fee_crew_c, fee_extra,
				transport_bbm, sewa_alat, perawatan, konsumsi,
				komisi_vendor, komisi_relasi, komisi_sales_direct,
				is_loss, closed_at,
				event:events!inner(id, project_id, client_name, channel, event_date)`,
			)
			.eq("is_reopened", false)
			.gte("closed_at", `${ymStart}T00:00:00Z`)
			.lte("closed_at", `${ymEnd}T23:59:59Z`)
			.order("closed_at", { ascending: false }),
		supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", ymStart)
			.lte("payment_date", ymEnd),
		supabase
			.from("events")
			.select("id, channel")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd),
	]);

	type SettlementRow = {
		net_profit: number;
		revenue_net: number;
		hpp_total: number;
		opex_total: number;
		sinking_total: number;
		owner_pool_total: number;
		fee_lead: number;
		fee_asisten: number;
		fee_crew_c: number;
		fee_extra: number;
		transport_bbm: number;
		sewa_alat: number;
		perawatan: number;
		konsumsi: number;
		komisi_vendor: number;
		komisi_relasi: number;
		komisi_sales_direct: number;
		is_loss: boolean;
		closed_at: string;
		event:
			| {
					id: string;
					project_id: string;
					client_name: string;
					channel: string;
					event_date: string;
				}
			| Array<{
					id: string;
					project_id: string;
					client_name: string;
					channel: string;
					event_date: string;
				}>
			| null;
	};
	const rows = (settlements ?? []) as SettlementRow[];
	const sum = (k: keyof SettlementRow) =>
		rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);

	const revenue = sum("revenue_net");
	const hpp = sum("hpp_total");
	const opex = sum("opex_total");
	const sinking = sum("sinking_total");
	const ownerPool = sum("owner_pool_total");
	const netProfit = sum("net_profit");
	const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
	const lossCount = rows.filter((r) => r.is_loss).length;
	const settlementCount = rows.length;

	const cashIn = (revenueData ?? []).reduce(
		(s, r) => s + (r.amount ?? 0),
		0,
	);

	const opexBreakdown = {
		fee_crew:
			sum("fee_lead") + sum("fee_asisten") + sum("fee_crew_c") + sum("fee_extra"),
		transport: sum("transport_bbm"),
		sewa_alat: sum("sewa_alat"),
		perawatan: sum("perawatan"),
		konsumsi: sum("konsumsi"),
		komisi:
			sum("komisi_vendor") + sum("komisi_relasi") + sum("komisi_sales_direct"),
	};

	const channelBreakdown = ((bookingsByChannel ?? []) as Array<{
		channel: string;
	}>).reduce<Record<string, number>>((acc, e) => {
		acc[e.channel] = (acc[e.channel] ?? 0) + 1;
		return acc;
	}, {});
	const totalChannelEvents = Object.values(channelBreakdown).reduce(
		(s, c) => s + c,
		0,
	);

	return (
		<div className="space-y-6">
			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Cash In"
					value={formatRupiah(cashIn)}
					hint="Sum payment masuk bulan ini"
					icon={Wallet2}
					tone="emerald"
				/>
				<KpiCard
					label="Revenue (settled)"
					value={formatRupiah(revenue)}
					hint={`${settlementCount} event settled`}
					icon={Receipt}
					tone="primary"
				/>
				<KpiCard
					label="Net Profit"
					value={formatRupiah(netProfit)}
					hint={`Margin ${margin.toFixed(1)}%${lossCount > 0 ? ` · ${lossCount} loss` : ""}`}
					icon={netProfit >= 0 ? TrendingUp : TrendingDown}
					tone={netProfit < 0 ? "rose" : margin > 25 ? "emerald" : "amber"}
				/>
				<KpiCard
					label="Owner Pool"
					value={formatRupiah(ownerPool)}
					hint="Tersedia buat distribusi"
					icon={Coins}
					tone="primary"
				/>
			</dl>

			<section className="space-y-3">
				<h2 className="text-base font-semibold tracking-tight">
					Profit &amp; Loss · {monthLabel}
				</h2>
				<div className="border-border-default bg-surface-2 overflow-hidden rounded-xl border">
					<dl>
						<PnlRow
							label="Revenue Net"
							value={revenue}
							sign="+"
							tone="emerald"
							strong
						/>
						<PnlRow label="HPP (Cost of Goods Sold)" value={-hpp} indent />
						<PnlRow label="Gross Profit" value={revenue - hpp} strong muted />
						<PnlRow label="OpEx" value={-opex} sign="−" />
						<PnlSubRow label="Fee crew" value={opexBreakdown.fee_crew} />
						<PnlSubRow label="Transport / BBM" value={opexBreakdown.transport} />
						<PnlSubRow label="Sewa alat" value={opexBreakdown.sewa_alat} />
						<PnlSubRow label="Perawatan" value={opexBreakdown.perawatan} />
						<PnlSubRow label="Konsumsi" value={opexBreakdown.konsumsi} />
						<PnlSubRow label="Komisi" value={opexBreakdown.komisi} />
						<PnlRow
							label="Operating Profit"
							value={revenue - hpp - opex}
							strong
							muted
						/>
						<PnlRow label="Sinking funds" value={-sinking} indent />
						<PnlRow label="Owner pool" value={-ownerPool} indent />
						<PnlRow
							label="Net Profit (Operating Cash Kept)"
							value={netProfit}
							strong
							grand
							tone={netProfit < 0 ? "rose" : "emerald"}
						/>
					</dl>
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				<section className="space-y-3">
					<h2 className="text-base font-semibold tracking-tight">
						Bookings per channel
					</h2>
					{Object.keys(channelBreakdown).length === 0 ? (
						<EmptyMini text="Belum ada event di bulan ini." />
					) : (
						<div className="border-border-default bg-surface-2 divide-border overflow-hidden rounded-xl border">
							{Object.entries(channelBreakdown)
								.sort((a, b) => b[1] - a[1])
								.map(([channel, count]) => (
									<div
										key={channel}
										className="border-border-default flex items-center justify-between border-b px-4 py-3 last:border-b-0"
									>
										<div className="space-y-0.5">
											<p className="text-foreground text-sm font-medium capitalize">
												{channel}
											</p>
											<p className="text-muted-foreground text-xs">
												{((count / totalChannelEvents) * 100).toFixed(0)}% dari
												total
											</p>
										</div>
										<p className="text-foreground tabular text-lg font-semibold">
											{count}
										</p>
									</div>
								))}
						</div>
					)}
				</section>

				<section className="space-y-3">
					<h2 className="text-base font-semibold tracking-tight">
						Settled events ({settlementCount})
					</h2>
					{rows.length === 0 ? (
						<EmptyMini text="Belum ada settlement bulan ini." />
					) : (
						<div className="border-border-default bg-surface-2 max-h-96 overflow-auto rounded-xl border">
							{rows.map((r) => {
								const ev = Array.isArray(r.event) ? r.event[0] : r.event;
								if (!ev) return null;
								return (
									<Link
										key={ev.id}
										href={`/operations/${ev.project_id}`}
										className="border-border-default hover:bg-muted/40 flex items-center justify-between gap-3 border-b px-4 py-3 transition-colors last:border-b-0"
									>
										<div className="min-w-0 flex-1 space-y-0.5">
											<p className="text-foreground truncate text-sm font-medium">
												{ev.client_name}
											</p>
											<p className="text-muted-foreground tabular text-[10px]">
												{ev.project_id} · {ev.event_date}
											</p>
										</div>
										<p
											className={`tabular text-sm font-semibold ${
												r.is_loss
													? "text-rose-600 dark:text-rose-400"
													: "text-emerald-600 dark:text-emerald-400"
											}`}
										>
											{r.is_loss ? "− " : "+ "}
											{formatRupiah(Math.abs(r.net_profit))}
										</p>
									</Link>
								);
							})}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

function PnlRow({
	label,
	value,
	sign,
	tone,
	indent,
	strong,
	muted,
	grand,
}: {
	label: string;
	value: number;
	sign?: "+" | "−";
	tone?: "emerald" | "rose";
	indent?: boolean;
	strong?: boolean;
	muted?: boolean;
	grand?: boolean;
}) {
	const valueCls =
		tone === "emerald"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "rose"
				? "text-rose-600 dark:text-rose-400"
				: muted
					? "text-muted-foreground"
					: "text-foreground";
	const labelCls = strong
		? "text-foreground font-semibold"
		: indent
			? "text-muted-foreground pl-6"
			: muted
				? "text-foreground/60"
				: "text-foreground";
	return (
		<div
			className={`border-border-default flex items-center justify-between border-b px-4 last:border-b-0 ${
				grand
					? "bg-muted/40 border-foreground/30 border-t-2 py-4"
					: strong || muted
						? "bg-muted/20 py-3"
						: "py-2.5"
			}`}
		>
			<dt className={`text-sm ${labelCls}`}>{label}</dt>
			<dd
				className={`tabular ${
					grand ? "text-lg font-bold" : strong ? "font-semibold" : "text-sm"
				} ${valueCls}`}
			>
				{sign && Math.abs(value) > 0 ? sign : value < 0 ? "−" : ""}
				{formatRupiah(Math.abs(value))}
			</dd>
		</div>
	);
}

function PnlSubRow({ label, value }: { label: string; value: number }) {
	return (
		<div className="border-border-default flex items-center justify-between border-b px-4 py-1.5 last:border-b-0">
			<dt className="text-muted-foreground/80 pl-10 text-xs">{label}</dt>
			<dd className="text-muted-foreground tabular text-xs">
				{formatRupiah(value)}
			</dd>
		</div>
	);
}

// ─── Crew Section ─────────────────────────────────────────────────────────

async function CrewSection({
	ymStart,
	ymEnd,
	monthLabel,
}: {
	ymStart: string;
	ymEnd: string;
	monthLabel: string;
}) {
	const supabase = await createClient();
	const [{ data: assignments }, { data: rekapList }, { data: crewList }] =
		await Promise.all([
			supabase
				.from("crew_assignments")
				.select(
					`user_id, role_in_event, fee_amount, bonus_amount, is_paid,
				event:events!inner(id, project_id, client_name, event_date)`,
				)
				.gte("event.event_date", ymStart)
				.lte("event.event_date", ymEnd),
			supabase
				.from("crew_rekap")
				.select("event_id, submitted_by, is_approved"),
			supabase
				.from("users")
				.select("id, full_name, nickname, tier")
				.eq("role", "crew")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("full_name", { ascending: true }),
		]);

	type Row = {
		user_id: string;
		role_in_event: string;
		fee_amount: number;
		bonus_amount: number;
		is_paid: boolean;
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
	};
	const rows = ((assignments ?? []) as Row[]).filter((a) => a.event);

	const stats = new Map<
		string,
		{
			eventCount: number;
			totalFee: number;
			paidFee: number;
			leadCount: number;
			asistenCount: number;
			eventIds: Set<string>;
		}
	>();
	for (const r of rows) {
		const ev = Array.isArray(r.event) ? r.event[0] : r.event;
		if (!ev) continue;
		const cur = stats.get(r.user_id) ?? {
			eventCount: 0,
			totalFee: 0,
			paidFee: 0,
			leadCount: 0,
			asistenCount: 0,
			eventIds: new Set<string>(),
		};
		const fee = (r.fee_amount ?? 0) + (r.bonus_amount ?? 0);
		cur.eventCount += 1;
		cur.totalFee += fee;
		if (r.is_paid) cur.paidFee += fee;
		if (r.role_in_event === "lead") cur.leadCount += 1;
		if (r.role_in_event === "asisten") cur.asistenCount += 1;
		cur.eventIds.add(ev.id);
		stats.set(r.user_id, cur);
	}

	const rekapByEventId = new Map<string, { is_approved: boolean | null }>();
	for (const r of (rekapList ?? []) as Array<{
		event_id: string;
		is_approved: boolean | null;
	}>) {
		rekapByEventId.set(r.event_id, { is_approved: r.is_approved });
	}

	const crew = (crewList ?? []) as Array<{
		id: string;
		full_name: string;
		nickname: string | null;
		tier: "senior" | "junior" | null;
	}>;

	const enriched = crew
		.map((c) => {
			const s = stats.get(c.id);
			if (!s) {
				return {
					...c,
					eventCount: 0,
					totalFee: 0,
					paidFee: 0,
					unpaidFee: 0,
					leadCount: 0,
					asistenCount: 0,
					rekapCount: 0,
					rekapApproved: 0,
				};
			}
			let rekapCount = 0;
			let rekapApproved = 0;
			for (const eid of s.eventIds) {
				const r = rekapByEventId.get(eid);
				if (r) {
					rekapCount += 1;
					if (r.is_approved === true) rekapApproved += 1;
				}
			}
			return {
				...c,
				eventCount: s.eventCount,
				totalFee: s.totalFee,
				paidFee: s.paidFee,
				unpaidFee: s.totalFee - s.paidFee,
				leadCount: s.leadCount,
				asistenCount: s.asistenCount,
				rekapCount,
				rekapApproved,
			};
		})
		.sort((a, b) => b.totalFee - a.totalFee);

	const totalEvents = enriched.reduce((s, e) => s + e.eventCount, 0);
	const totalFee = enriched.reduce((s, e) => s + e.totalFee, 0);
	const totalUnpaid = enriched.reduce((s, e) => s + e.unpaidFee, 0);
	const activeCrew = enriched.filter((e) => e.eventCount > 0).length;

	return (
		<div className="space-y-6">
			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Total events"
					value={totalEvents.toLocaleString("id-ID")}
					hint={`${activeCrew} crew aktif bulan ini`}
					icon={UsersRound}
					tone="primary"
				/>
				<KpiCard
					label="Total fee crew"
					value={formatRupiah(totalFee)}
					hint="Termasuk bonus"
					icon={Coins}
					tone="emerald"
				/>
				<KpiCard
					label="Outstanding fee"
					value={formatRupiah(totalUnpaid)}
					hint="Belum dibayar"
					icon={Wallet2}
					tone={totalUnpaid > 5_000_000 ? "amber" : "muted"}
				/>
				<KpiCard
					label="Crew terdaftar"
					value={crew.length.toString()}
					hint={`${activeCrew} aktif · ${crew.length - activeCrew} idle`}
					icon={Users}
					tone="muted"
				/>
			</dl>

			<section className="space-y-3">
				<h2 className="text-base font-semibold tracking-tight">
					Crew performance · {monthLabel}
				</h2>
				{enriched.length === 0 ? (
					<EmptyMini text="Belum ada crew aktif." />
				) : (
					<div className="border-border-default bg-surface-2 overflow-x-auto rounded-xl border">
						<table className="w-full text-sm">
							<thead className="bg-muted/40">
								<tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
									<th className="px-4 py-3 text-left font-medium">Crew</th>
									<th className="px-4 py-3 text-left font-medium">Tier</th>
									<th className="px-4 py-3 text-right font-medium">Events</th>
									<th className="px-4 py-3 text-right font-medium">
										Lead / Asisten
									</th>
									<th className="px-4 py-3 text-right font-medium">
										Rekap submit
									</th>
									<th className="px-4 py-3 text-right font-medium">
										Fee earned
									</th>
									<th className="px-4 py-3 text-right font-medium">Paid</th>
									<th className="px-4 py-3 text-right font-medium">
										Outstanding
									</th>
								</tr>
							</thead>
							<tbody className="divide-border divide-y">
								{enriched.map((e) => {
									const submissionRate =
										e.eventCount > 0
											? (e.rekapCount / e.eventCount) * 100
											: 0;
									return (
										<tr
											key={e.id}
											className={`hover:bg-muted/20 ${
												e.eventCount === 0 ? "opacity-60" : ""
											}`}
										>
											<td className="px-4 py-3">
												<p className="text-foreground text-sm font-medium">
													{e.full_name}
												</p>
												{e.nickname && (
													<p className="text-muted-foreground text-xs">
														{e.nickname}
													</p>
												)}
											</td>
											<td className="px-4 py-3">
												{e.tier ? (
													<Badge
														variant="outline"
														className="text-[10px] uppercase"
													>
														{e.tier}
													</Badge>
												) : (
													<span className="text-muted-foreground text-xs">
														—
													</span>
												)}
											</td>
											<td className="text-foreground tabular px-4 py-3 text-right font-semibold">
												{e.eventCount}
											</td>
											<td className="text-muted-foreground tabular px-4 py-3 text-right text-xs">
												{e.leadCount} / {e.asistenCount}
											</td>
											<td className="px-4 py-3 text-right">
												{e.eventCount === 0 ? (
													<span className="text-muted-foreground text-xs">
														—
													</span>
												) : (
													<span
														className={`tabular text-xs font-medium ${
															submissionRate >= 80
																? "text-emerald-600 dark:text-emerald-400"
																: submissionRate >= 50
																	? "text-amber-600 dark:text-amber-400"
																	: "text-rose-600 dark:text-rose-400"
														}`}
													>
														{e.rekapCount}/{e.eventCount} (
														{submissionRate.toFixed(0)}%)
													</span>
												)}
											</td>
											<td className="text-foreground tabular px-4 py-3 text-right font-semibold">
												{e.totalFee > 0 ? formatRupiah(e.totalFee) : "—"}
											</td>
											<td className="text-emerald-600 dark:text-emerald-400 tabular px-4 py-3 text-right">
												{e.paidFee > 0 ? formatRupiah(e.paidFee) : "—"}
											</td>
											<td
												className={`tabular px-4 py-3 text-right ${
													e.unpaidFee > 0
														? "text-amber-600 dark:text-amber-400 font-medium"
														: "text-muted-foreground"
												}`}
											>
												{e.unpaidFee > 0 ? formatRupiah(e.unpaidFee) : "—"}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}

// ─── Owner Section ────────────────────────────────────────────────────────

async function OwnerSection({
	ymStart,
	ymEnd,
	monthLabel,
}: {
	ymStart: string;
	ymEnd: string;
	monthLabel: string;
}) {
	const supabase = await createClient();
	const [
		{ data: ownersData },
		{ data: earningsAll },
		{ data: earningsThisMonth },
	] = await Promise.all([
		supabase
			.from("users")
			.select("id, full_name, role, share_pct, capital_contributed")
			.in("role", ["super_admin", "owner"])
			.eq("is_active", true)
			.order("full_name", { ascending: true }),
		supabase.from("owner_earnings").select("owner_user_id, amount, earning_type"),
		supabase
			.from("owner_earnings")
			.select("owner_user_id, amount, earning_type, created_at")
			.gte("created_at", `${ymStart}T00:00:00Z`)
			.lte("created_at", `${ymEnd}T23:59:59Z`),
	]);

	type Earning = {
		owner_user_id: string;
		amount: number;
		earning_type: string;
	};

	const allTimeStats = new Map<
		string,
		{ earned: number; withdrawn: number }
	>();
	for (const e of (earningsAll ?? []) as Earning[]) {
		const cur = allTimeStats.get(e.owner_user_id) ?? {
			earned: 0,
			withdrawn: 0,
		};
		if (e.earning_type === "withdrawal" || e.amount < 0) {
			cur.withdrawn += Math.abs(e.amount);
		} else {
			cur.earned += e.amount;
		}
		allTimeStats.set(e.owner_user_id, cur);
	}

	const monthStats = new Map<string, { earned: number; withdrawn: number }>();
	for (const e of (earningsThisMonth ?? []) as Earning[]) {
		const cur = monthStats.get(e.owner_user_id) ?? {
			earned: 0,
			withdrawn: 0,
		};
		if (e.earning_type === "withdrawal" || e.amount < 0) {
			cur.withdrawn += Math.abs(e.amount);
		} else {
			cur.earned += e.amount;
		}
		monthStats.set(e.owner_user_id, cur);
	}

	const owners = (
		(ownersData ?? []) as Array<{
			id: string;
			full_name: string;
			role: string;
			share_pct: number | null;
			capital_contributed: number | null;
		}>
	).map((o) => {
		const all = allTimeStats.get(o.id) ?? { earned: 0, withdrawn: 0 };
		const mtd = monthStats.get(o.id) ?? { earned: 0, withdrawn: 0 };
		return {
			...o,
			lifetimeEarned: all.earned,
			lifetimeWithdrawn: all.withdrawn,
			balance: all.earned - all.withdrawn,
			mtdEarned: mtd.earned,
			mtdWithdrawn: mtd.withdrawn,
		};
	});

	const totalShare = owners.reduce((s, o) => s + (o.share_pct ?? 0), 0);
	const totalEarned = owners.reduce((s, o) => s + o.lifetimeEarned, 0);
	const totalWithdrawn = owners.reduce((s, o) => s + o.lifetimeWithdrawn, 0);
	const totalBalance = totalEarned - totalWithdrawn;

	return (
		<div className="space-y-6">
			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Total earned"
					value={formatRupiah(totalEarned)}
					hint="Sejak hari pertama"
					icon={TrendingUp}
					tone="emerald"
				/>
				<KpiCard
					label="Total withdrawn"
					value={formatRupiah(totalWithdrawn)}
					hint="Total ditarik owner"
					icon={Wallet2}
					tone="muted"
				/>
				<KpiCard
					label="Balance available"
					value={formatRupiah(totalBalance)}
					hint="Bisa di-withdraw"
					icon={Coins}
					tone={totalBalance > 0 ? "emerald" : "muted"}
				/>
				<KpiCard
					label="Total share"
					value={`${totalShare.toFixed(2)}%`}
					hint={
						Math.abs(totalShare - 100) < 0.5 ? "✓ 100%" : "⚠ belum 100%"
					}
					icon={Users}
					tone={Math.abs(totalShare - 100) < 0.5 ? "emerald" : "amber"}
				/>
			</dl>

			<section className="space-y-3">
				<h2 className="text-base font-semibold tracking-tight">
					Owner statement · {monthLabel}
				</h2>
				<div className="border-border-default bg-surface-2 overflow-x-auto rounded-xl border">
					<table className="w-full text-sm">
						<thead className="bg-muted/40">
							<tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
								<th className="px-4 py-3 text-left font-medium">Owner</th>
								<th className="px-4 py-3 text-right font-medium">Share %</th>
								<th className="px-4 py-3 text-right font-medium">Capital</th>
								<th className="px-4 py-3 text-right font-medium">
									Earned MTD
								</th>
								<th className="px-4 py-3 text-right font-medium">
									Withdrawn MTD
								</th>
								<th className="px-4 py-3 text-right font-medium">
									Lifetime earned
								</th>
								<th className="px-4 py-3 text-right font-medium">
									Lifetime withdrawn
								</th>
								<th className="px-4 py-3 text-right font-medium">
									Available
								</th>
							</tr>
						</thead>
						<tbody className="divide-border divide-y">
							{owners.map((o) => (
								<tr key={o.id}>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<p className="text-foreground text-sm font-medium">
												{o.full_name}
											</p>
											<Badge
												variant="outline"
												className="text-[10px] uppercase"
											>
												{o.role === "super_admin" ? "super" : o.role}
											</Badge>
										</div>
									</td>
									<td className="text-muted-foreground tabular px-4 py-3 text-right text-xs">
										{o.share_pct !== null
											? `${o.share_pct.toFixed(2)}%`
											: "—"}
									</td>
									<td className="text-muted-foreground tabular px-4 py-3 text-right text-xs">
										{o.capital_contributed
											? formatRupiah(o.capital_contributed)
											: "—"}
									</td>
									<td className="text-emerald-600 dark:text-emerald-400 tabular px-4 py-3 text-right">
										{o.mtdEarned > 0 ? formatRupiah(o.mtdEarned) : "—"}
									</td>
									<td className="text-muted-foreground tabular px-4 py-3 text-right">
										{o.mtdWithdrawn > 0
											? formatRupiah(o.mtdWithdrawn)
											: "—"}
									</td>
									<td className="text-foreground tabular px-4 py-3 text-right">
										{o.lifetimeEarned > 0
											? formatRupiah(o.lifetimeEarned)
											: "—"}
									</td>
									<td className="text-muted-foreground tabular px-4 py-3 text-right">
										{o.lifetimeWithdrawn > 0
											? formatRupiah(o.lifetimeWithdrawn)
											: "—"}
									</td>
									<td className="tabular px-4 py-3 text-right font-semibold">
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
				<p className="text-muted-foreground text-xs">
					Withdraw via{" "}
					<Link href="/finance" className="text-primary hover:underline">
						/finance
					</Link>{" "}
					→ Owner pool section.
				</p>
			</section>
		</div>
	);
}

// ─── Shared bits ──────────────────────────────────────────────────────────

function KpiCard({
	label,
	value,
	hint,
	icon: Icon,
	tone,
}: {
	label: string;
	value: string;
	hint: string;
	icon: typeof BarChart3;
	tone: "primary" | "emerald" | "amber" | "rose" | "muted";
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
						: "text-foreground";
	return (
		<div className="border-border-default bg-surface-2 relative space-y-1 rounded-xl border p-4">
			<div className="flex items-center justify-between">
				<dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
					{label}
				</dt>
				<Icon className="text-muted-foreground/60 h-3.5 w-3.5" />
			</div>
			<dd className={`tabular text-xl font-semibold leading-tight ${cls}`}>
				{value}
			</dd>
			<p className="text-muted-foreground text-[10px]">{hint}</p>
		</div>
	);
}

function EmptyMini({ text }: { text: string }) {
	return (
		<div className="border-border-default bg-surface-2 rounded-xl border border-dashed p-8 text-center">
			<p className="text-muted-foreground text-sm">{text}</p>
		</div>
	);
}
