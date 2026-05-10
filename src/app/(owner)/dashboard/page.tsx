import {
	Activity,
	CalendarCheck,
	CalendarClock,
	CheckCircle2,
	FileText,
	Hourglass,
	Package,
	PlusCircle,
	Receipt,
	Settings as SettingsIcon,
	Target,
	Users,
	Wallet,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { AnomalyRadarWidget } from "@/components/dashboard/anomaly-radar";
import { HeroKpiCard } from "@/components/dashboard/hero-kpi-card";
import { StatusGroupCard } from "@/components/dashboard/status-group-card";
import { TargetProgressCard } from "@/components/dashboard/target-progress-card";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { PipelineCard } from "@/components/operations/pipeline-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

const ID_DATE_FULL = new Intl.DateTimeFormat("id-ID", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
});

const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

export default async function DashboardPage() {
	const userResult = await getCurrentUser();
	if (!userResult) return null;

	const supabase = await createClient();

	const today = new Date();
	const todayISO = isoDate(today);
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);
	const tomorrowISO = isoDate(tomorrow);
	const sevenFromNow = new Date(today);
	sevenFromNow.setDate(today.getDate() + 7);
	const sevenFromNowISO = isoDate(sevenFromNow);

	const ymStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
	const ymEnd = lastDayOfMonth(today.getFullYear(), today.getMonth() + 1);
	const yearStart = `${today.getFullYear()}-01-01`;
	const yearEnd = `${today.getFullYear()}-12-31`;

	const [
		monthRevenueResult,
		outstandingResult,
		monthCountResult,
		awaitingCountResult,
		upcoming7dCountResult,
		inProgressCountResult,
		completedThisMonthCountResult,
		nextEventsResult,
		yearCountResult,
		monthCancelledResult,
		monthUpcomingResult,
		invoicePaidResult,
		invoicePartialResult,
		invoiceUnpaidResult,
		targetsResult,
	] = await Promise.all([
		supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", ymStart)
			.lte("payment_date", ymEnd),
		supabase
			.from("events")
			.select("remaining_balance")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.neq("payment_status", "paid")
			.gt("remaining_balance", 0),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "awaiting_settlement"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.in("status", ["confirmed", "upcoming"])
			.gte("event_date", todayISO)
			.lte("event_date", sevenFromNowISO),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "in_progress"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "completed")
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd),
		supabase
			.from("events")
			.select(
				"id, project_id, status, client_name, event_date, setup_time, start_time, venue_name, venue_city",
			)
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", todayISO)
			.lte("event_date", tomorrowISO)
			.order("event_date", { ascending: true })
			.order("start_time", { ascending: true }),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", yearStart)
			.lte("event_date", yearEnd),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd)
			.eq("status", "cancelled"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd)
			.in("status", ["confirmed", "upcoming", "in_progress"]),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("payment_status", "paid"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("payment_status", "partial"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("payment_status", "unpaid"),
		supabase
			.from("system_config")
			.select("key, value")
			.in("key", ["event_target_monthly", "event_target_yearly"]),
	]);

	const thisMonthRevenue = (monthRevenueResult.data ?? []).reduce(
		(sum, p) => sum + (p.amount ?? 0),
		0,
	);
	const outstanding = (outstandingResult.data ?? []).reduce(
		(sum, r) => sum + (r.remaining_balance ?? 0),
		0,
	);
	const monthCount = monthCountResult.count ?? 0;
	const awaitingCount = awaitingCountResult.count ?? 0;
	const upcoming7dCount = upcoming7dCountResult.count ?? 0;
	const inProgressCount = inProgressCountResult.count ?? 0;
	const completedThisMonthCount = completedThisMonthCountResult.count ?? 0;
	const yearCount = yearCountResult.count ?? 0;
	const monthCancelled = monthCancelledResult.count ?? 0;
	const monthUpcoming = monthUpcomingResult.count ?? 0;
	const invoicePaid = invoicePaidResult.count ?? 0;
	const invoicePartial = invoicePartialResult.count ?? 0;
	const invoiceUnpaid = invoiceUnpaidResult.count ?? 0;

	type ConfigRow = { key: string; value: number | string | null };
	const targets = ((targetsResult.data ?? []) as ConfigRow[]).reduce<{
		monthly: number;
		yearly: number;
	}>(
		(acc, r) => {
			const v = typeof r.value === "number" ? r.value : Number(r.value ?? 0);
			if (r.key === "event_target_monthly") acc.monthly = v || 10;
			if (r.key === "event_target_yearly") acc.yearly = v || 100;
			return acc;
		},
		{ monthly: 10, yearly: 100 },
	);

	const nextEvents = (nextEventsResult.data ?? []) as Array<{
		id: string;
		project_id: string;
		status: string;
		client_name: string;
		event_date: string;
		setup_time: string | null;
		start_time: string | null;
		venue_name: string;
		venue_city: string | null;
	}>;

	const firstName = userResult.profile.full_name.split(" ")[0];

	return (
		<Container size="xl" className="space-y-6 md:space-y-8">
			<SectionHeader
				title={`Halo, ${firstName}.`}
				description={ID_DATE_FULL.format(today)}
			/>

			{/* Hero KPIs — Tetra ERP exec-summary style: 4 dark-gradient cards */}
			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<HeroKpiCard
					label="Event Bulan Ini"
					value={monthCount.toLocaleString("id-ID")}
					hint="Total booking di bulan berjalan"
					icon={CalendarCheck}
					accent="primary"
				/>
				<HeroKpiCard
					label="Revenue MTD"
					value={formatRupiah(thisMonthRevenue)}
					hint="Payment masuk terverifikasi"
					icon={Wallet2}
					accent="emerald"
				/>
				<HeroKpiCard
					label="Outstanding"
					value={formatRupiah(outstanding)}
					hint="Total piutang aktif"
					icon={Wallet}
					accent={outstanding >= 5_000_000 ? "rose" : "amber"}
				/>
				<HeroKpiCard
					label="Awaiting Settlement"
					value={awaitingCount.toLocaleString("id-ID")}
					hint="Event selesai, belum di-settle"
					icon={Hourglass}
					accent="amber"
				/>
			</dl>

			{/* Targets + status overview — Tetra ERP exec-summary mid-strip */}
			<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<TargetProgressCard
					label="Target Bulanan"
					current={monthCount}
					target={targets.monthly}
					icon={Target}
				/>
				<TargetProgressCard
					label="Target Tahunan"
					current={yearCount}
					target={targets.yearly}
					icon={Target}
				/>
				<StatusGroupCard
					title="Status Operasional"
					icon={Activity}
					stats={[
						{ label: "Upcoming", value: monthUpcoming, tone: "sky" },
						{
							label: "Selesai",
							value: completedThisMonthCount,
							tone: "emerald",
						},
						{ label: "Batal", value: monthCancelled, tone: "rose" },
					]}
				/>
				<StatusGroupCard
					title="Status Invoice"
					icon={FileText}
					stats={[
						{ label: "Lunas", value: invoicePaid, tone: "emerald" },
						{ label: "DP", value: invoicePartial, tone: "amber" },
						{ label: "Unpaid", value: invoiceUnpaid, tone: "rose" },
					]}
				/>
			</section>

			<AnomalyRadarWidget />

			<section className="space-y-3">
				<div className="flex items-baseline justify-between">
					<h2 className="text-fluid-h3 font-semibold tracking-tight">
						Pipeline Event
					</h2>
					<Link
						href="/operations"
						className="text-fluid-caption font-medium text-muted-foreground hover:text-foreground"
					>
						Lihat semua →
					</Link>
				</div>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<PipelineCard
						label="Upcoming 7 Hari"
						count={upcoming7dCount}
						href="/operations?status=upcoming"
						icon={CalendarClock}
						accent="emerald"
					/>
					<PipelineCard
						label="In Progress"
						count={inProgressCount}
						href="/operations?status=in_progress"
						icon={CalendarCheck}
						accent="sky"
					/>
					<PipelineCard
						label="Awaiting Settlement"
						count={awaitingCount}
						href="/operations?status=awaiting_settlement"
						icon={Hourglass}
						accent="amber"
					/>
					<PipelineCard
						label="Completed Bulan Ini"
						count={completedThisMonthCount}
						href="/operations?status=completed"
						icon={CheckCircle2}
						accent="primary"
					/>
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-3">
				<section className="space-y-3 lg:col-span-2">
					<h2 className="text-fluid-h3 font-semibold tracking-tight">
						Hari Ini & Besok
					</h2>
					{nextEvents.length === 0 ? (
						<EmptyState
							icon={CalendarClock}
							title="Tidak ada event hari ini atau besok."
							description="Free time. Kalau ada booking baru, akan muncul di sini otomatis."
						/>
					) : (
						<div className="space-y-2">
							{nextEvents.map((ev) => {
								const isToday = ev.event_date === todayISO;
								return (
									<Link
										key={ev.id}
										href={`/operations/${ev.project_id}`}
										className="lift-on-hover group flex items-start gap-4 rounded-xl border border-border-default bg-surface-2 p-4 transition-colors hover:bg-surface-3"
										style={{
											viewTransitionName: `event-${ev.project_id}`,
										}}
									>
										<div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
											<span
												className={`text-fluid-caption font-medium uppercase tracking-wider ${
													isToday ? "text-primary" : "text-muted-foreground"
												}`}
											>
												{isToday ? "Hari ini" : "Besok"}
											</span>
											<span className="tabular text-fluid-body font-semibold text-foreground">
												{ID_TIME(ev.start_time)}
											</span>
										</div>
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex items-baseline gap-2">
												<span className="truncate text-fluid-body font-medium">
													{ev.client_name}
												</span>
												<EventStatusBadge status={ev.status} />
											</div>
											<p className="truncate text-fluid-caption text-muted-foreground">
												{ev.venue_name}
												{ev.venue_city && ` · ${ev.venue_city}`}
											</p>
											<p className="tabular text-fluid-caption text-muted-foreground">
												{ev.project_id} · setup {ID_TIME(ev.setup_time)}
											</p>
										</div>
									</Link>
								);
							})}
						</div>
					)}
				</section>

				<section className="space-y-3">
					<h2 className="text-fluid-h3 font-semibold tracking-tight">
						Quick Actions
					</h2>
					<div className="grid gap-2 rounded-xl border border-border-default bg-surface-2 p-3">
						<QuickAction
							href="/operations/new"
							icon={PlusCircle}
							label="New Booking"
							hint="Buat event baru"
						/>
						<QuickAction
							href="/settings/packages/new"
							icon={Package}
							label="New Package"
							hint="Tambah paket pricelist"
						/>
						<QuickAction
							href="/settings/crew"
							icon={Users}
							label="Master Crew"
							hint="Approve & atur tim"
						/>
						<QuickAction
							href="/settings/bank-accounts"
							icon={Receipt}
							label="Bank Accounts"
							hint="Atur penerima transfer"
						/>
						<QuickAction
							href="/settings"
							icon={SettingsIcon}
							label="Settings"
							hint="System configuration"
						/>
					</div>
				</section>
			</div>
		</Container>
	);
}

function QuickAction({
	href,
	icon: Icon,
	label,
	hint,
}: {
	href: string;
	icon: typeof PlusCircle;
	label: string;
	hint: string;
}) {
	return (
		<Link
			href={href}
			className="group flex items-center gap-3 rounded-lg p-3 transition-colors duration-fast ease-out-expo hover:bg-surface-3"
		>
			<div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-fluid-body font-medium">{label}</div>
				<div className="text-fluid-caption text-muted-foreground">{hint}</div>
			</div>
		</Link>
	);
}
