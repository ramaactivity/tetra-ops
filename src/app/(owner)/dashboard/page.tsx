import {
	CalendarCheck,
	CalendarClock,
	CheckCircle2,
	Hourglass,
	Package,
	PlusCircle,
	Receipt,
	Settings as SettingsIcon,
	Users,
	Wallet,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { AnomalyRadarWidget } from "@/components/dashboard/anomaly-radar";
import { KpiCard } from "@/components/operations/kpi-card";
import { PipelineCard } from "@/components/operations/pipeline-card";
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

	const [
		monthRevenueResult,
		outstandingResult,
		monthCountResult,
		awaitingCountResult,
		upcoming7dCountResult,
		inProgressCountResult,
		completedThisMonthCountResult,
		nextEventsResult,
	] = await Promise.all([
		// This month revenue (sum of non-reversed payments)
		supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", ymStart)
			.lte("payment_date", ymEnd),
		// Outstanding (sum of remaining_balance for non-paid events) — exclude legacy archive
		supabase
			.from("events")
			.select("remaining_balance")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.neq("payment_status", "paid")
			.gt("remaining_balance", 0),
		// Total events this month — exclude legacy archive
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd),
		// Awaiting settlement — exclude legacy archive
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "awaiting_settlement"),
		// Pipeline: upcoming next 7 days — exclude legacy archive
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.in("status", ["confirmed", "upcoming"])
			.gte("event_date", todayISO)
			.lte("event_date", sevenFromNowISO),
		// In progress — exclude legacy archive
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "in_progress"),
		// Completed this month — exclude legacy archive
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "completed")
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd),
		// Today + tomorrow event list — exclude legacy archive
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
		<div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-semibold tracking-tight">
					Halo, {firstName}.
				</h1>
				<p className="text-muted-foreground text-sm">
					{ID_DATE_FULL.format(today)}
				</p>
			</div>

			{/* Section A — Hero KPIs */}
			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Bulan Ini"
					value={monthCount.toLocaleString("id-ID")}
					hint="Total event di bulan berjalan"
					icon={CalendarCheck}
					accent="primary"
				/>
				<KpiCard
					label="Revenue MTD"
					value={formatRupiah(thisMonthRevenue)}
					hint="Total payment terverifikasi"
					icon={Wallet2}
					accent="emerald"
				/>
				<KpiCard
					label="Outstanding"
					value={formatRupiah(outstanding)}
					hint="Total piutang aktif"
					icon={Wallet}
					accent={
						outstanding >= 15_000_000
							? "rose"
							: outstanding >= 5_000_000
								? "amber"
								: "sky"
					}
				/>
				<KpiCard
					label="Awaiting Settlement"
					value={awaitingCount.toLocaleString("id-ID")}
					hint="Event selesai, belum di-settle"
					icon={Hourglass}
					accent="amber"
				/>
			</dl>

			{/* Anomaly radar */}
			<AnomalyRadarWidget />

			{/* Section B — Event Pipeline */}
			<section className="space-y-3">
				<div className="flex items-baseline justify-between">
					<h2 className="text-base font-semibold tracking-tight">
						Pipeline Event
					</h2>
					<Link
						href="/operations"
						className="text-muted-foreground hover:text-foreground text-xs font-medium"
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
				{/* Section D — Today & Tomorrow */}
				<section className="space-y-3 lg:col-span-2">
					<h2 className="text-base font-semibold tracking-tight">
						Hari Ini & Besok
					</h2>
					{nextEvents.length === 0 ? (
						<div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
							<CalendarClock className="text-muted-foreground h-7 w-7" />
							<p className="text-muted-foreground text-sm">
								Tidak ada event hari ini atau besok.
							</p>
						</div>
					) : (
						<div className="space-y-2">
							{nextEvents.map((ev) => {
								const isToday = ev.event_date === todayISO;
								return (
									<Link
										key={ev.id}
										href={`/operations/${ev.project_id}`}
										className="group border-border bg-card hover:border-foreground/20 flex items-start gap-4 rounded-xl border p-4 transition-colors"
									>
										<div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
											<span
												className={`text-xs font-medium uppercase tracking-wider ${
													isToday
														? "text-primary"
														: "text-muted-foreground"
												}`}
											>
												{isToday ? "Hari ini" : "Besok"}
											</span>
											<span className="tabular text-foreground text-base font-semibold">
												{ID_TIME(ev.start_time)}
											</span>
										</div>
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex items-baseline gap-2">
												<span className="truncate text-sm font-medium">
													{ev.client_name}
												</span>
												<EventStatusBadge status={ev.status} />
											</div>
											<p className="text-muted-foreground truncate text-xs">
												{ev.venue_name}
												{ev.venue_city && ` · ${ev.venue_city}`}
											</p>
											<p className="text-muted-foreground tabular text-xs">
												{ev.project_id} · setup {ID_TIME(ev.setup_time)}
											</p>
										</div>
									</Link>
								);
							})}
						</div>
					)}
				</section>

				{/* Section C — Quick Actions */}
				<section className="space-y-3">
					<h2 className="text-base font-semibold tracking-tight">
						Quick Actions
					</h2>
					<div className="border-border bg-card grid gap-2 rounded-xl border p-3">
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
		</div>
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
			className="group hover:bg-muted flex items-center gap-3 rounded-lg p-3 transition-colors"
		>
			<div className="bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors">
				<Icon className="h-4 w-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-muted-foreground text-xs">{hint}</div>
			</div>
		</Link>
	);
}
