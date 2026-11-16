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
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { AnomalyRadarWidget } from "@/components/dashboard/anomaly-radar";
import { HeroMetric } from "@/components/dashboard/hero-metric";
import { SegmentedBar } from "@/components/dashboard/segmented-bar";
import { TargetProgressCard } from "@/components/dashboard/target-progress-card";
import { HutangPiutangOwner } from "@/components/finance/talangan-owner-card";
import { Container } from "@/components/layout/container";
import { PipelineCard } from "@/components/operations/pipeline-card";
import { getCurrentUser } from "@/lib/auth/get-user";
import { getDashboardStats } from "@/lib/dashboard/stats";
import { loadCashAccounts } from "@/lib/finance/cash-accounts";
import { filterEmoneyAccounts } from "@/lib/finance/emoney";
import { formatRupiah } from "@/lib/format";
import { loadTalanganOwner } from "@/lib/rekap/uang-jalan-db";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

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

const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

export default async function DashboardPage() {
	const userResult = await getCurrentUser();
	if (!userResult) return null;

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

	const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
	const lmYear = lastMonthDate.getFullYear();
	const lmMonth = lastMonthDate.getMonth() + 1;
	const lastMonthStart = `${lmYear}-${String(lmMonth).padStart(2, "0")}-01`;
	const lastMonthEnd = lastDayOfMonth(lmYear, lmMonth);

	const monthName = today.toLocaleDateString("id-ID", { month: "long" });
	const lastMonthName = lastMonthDate.toLocaleDateString("id-ID", {
		month: "short",
	});

	const {
		thisMonthRevenue,
		revenueDeltaPct,
		dailyRevenue,
		outstanding,
		monthCount,
		awaitingCount,
		upcoming7dCount,
		inProgressCount,
		completedThisMonthCount,
		yearCount,
		monthCancelled,
		monthUpcoming,
		invoicePaid,
		invoicePartial,
		invoiceUnpaid,
		targets,
		nextEvents,
	} = await getDashboardStats({
		ymStart,
		ymEnd,
		lastMonthStart,
		lastMonthEnd,
		yearStart,
		yearEnd,
		todayISO,
		tomorrowISO,
		sevenFromNowISO,
	});

	// Hutang-piutang Tetra ↔ owner — khusus owner.
	const isOwnerLevel =
		userResult.profile.role === "owner" ||
		userResult.profile.role === "super_admin";
	const supabase = await createClient();
	const [talangan, talanganAccounts, { data: talanganOwnerRows }] = isOwnerLevel
		? await Promise.all([
				loadTalanganOwner(supabase),
				loadCashAccounts(supabase).then((a) => filterEmoneyAccounts(a, false)),
				supabase
					.from("users")
					.select("id, full_name, nickname")
					.eq("role", "owner")
					.eq("is_active", true)
					.order("full_name"),
			])
		: [[], [], { data: [] }];
	const talanganOwners = (talanganOwnerRows ?? []).map((o) => ({
		id: o.id as string,
		name: (o.nickname as string | null) || (o.full_name as string),
	}));

	return (
		<Container size="xl" className="space-y-3">
			{/* HERO + supporting */}
			<section className="space-y-3">
				<div className="lg:grid lg:grid-cols-3 lg:gap-3 lg:space-y-0 space-y-3">
					<div className="lg:col-span-2">
						<HeroMetric
							label={`Pendapatan ${monthName}`}
							value={formatRupiah(thisMonthRevenue)}
							deltaPct={revenueDeltaPct}
							deltaLabel={`vs ${lastMonthName}`}
							spark={dailyRevenue}
							hint="Pembayaran masuk terverifikasi bulan ini"
						/>
					</div>
					{/* Piutang — stacked so the money stays on one line; settle count
					    is a compact pill at the bottom (no space-eating side rail). */}
					<div className="flex flex-col justify-between gap-4 rounded-[16px] border border-border-subtle bg-card p-5 shadow-[var(--shadow-level-2)]">
						<div>
							<div className="flex items-center gap-2">
								<span className="grid size-7 shrink-0 place-items-center rounded-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400">
									<Wallet className="size-4" aria-hidden />
								</span>
								<span className="text-[14.5px] font-medium text-muted-foreground">
									Piutang aktif
								</span>
							</div>
							<p className="type-num-lg mt-3 tabular text-rose-600 dark:text-rose-400">
								{formatRupiah(outstanding)}
							</p>
							<p className="mt-1 text-[12.5px] text-muted-foreground">
								Total belum tertagih
							</p>
						</div>
						<div className="flex items-center gap-2 border-t border-border-subtle pt-3">
							<span className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full bg-amber-300 px-2.5 text-[11.5px] font-medium text-amber-950 dark:bg-amber-500/25 dark:text-amber-200">
								{awaitingCount} nunggu settle
							</span>
							<span className="text-[12px] text-muted-foreground">
								acara selesai, belum di-settle
							</span>
						</div>
					</div>
				</div>
			</section>

			{/* Aksi cepat — satu baris pill (dulu kolom 5 kotak yang membuat kolom
			    agenda di sebelahnya kosong melompong) */}
			<nav aria-label="Aksi cepat" className="flex flex-wrap gap-2">
				<QuickAction href="/operations/new" icon={PlusCircle} primary>
					Booking baru
				</QuickAction>
				<QuickAction href="/operations/packages/new" icon={Package}>
					Paket baru
				</QuickAction>
				<QuickAction href="/settings/crew" icon={Users}>
					Master crew
				</QuickAction>
				<QuickAction href="/finance/bank-accounts" icon={Receipt}>
					Rekening bank
				</QuickAction>
				<QuickAction href="/settings" icon={SettingsIcon}>
					Pengaturan
				</QuickAction>
			</nav>

			<div>
				{/* Agenda */}
				<section className="space-y-3">
					<SectionHead title="Hari ini & besok" />
					{nextEvents.length === 0 ? (
						<div className="flex items-center gap-3 rounded-[16px] border border-dashed border-border-default bg-card/60 p-4">
							<span className="grid size-9 shrink-0 place-items-center rounded-[16px] bg-surface-3 text-muted-foreground">
								<CalendarClock className="size-4" aria-hidden />
							</span>
							<div className="min-w-0">
								<p className="type-body-strong">
									Tidak ada acara hari ini / besok
								</p>
								<p className="type-caption">
									Booking baru otomatis muncul di sini.
								</p>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							{nextEvents.map((ev) => {
								const isToday = ev.event_date === todayISO;
								return (
									<Link
										key={ev.id}
										href={`/operations/${ev.project_id}`}
										className="press tap flex items-start gap-3 rounded-[16px] border border-border-default bg-card p-3.5 shadow-[var(--shadow-soft)] transition-colors active:bg-surface-3"
										style={{ viewTransitionName: `event-${ev.project_id}` }}
									>
										<div
											className={cn(
												"flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] py-2 ring-1",
												isToday
													? "bg-emerald-500/10 ring-emerald-500/25"
													: "bg-surface-3 ring-border-subtle",
											)}
										>
											<span
												className={cn(
													"eyebrow !text-[9px]",
													isToday && "!text-emerald-600 dark:!text-emerald-400",
												)}
											>
												{isToday ? "Hari ini" : "Besok"}
											</span>
											<span className="type-num text-[1.05rem] font-semibold leading-none text-foreground">
												{ID_TIME(ev.start_time)}
											</span>
										</div>
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="type-body-strong truncate">
													{ev.client_name}
												</span>
												<EventStatusBadge status={ev.status} />
											</div>
											<p className="type-caption truncate">
												{ev.venue_name}
												{ev.venue_city && ` · ${ev.venue_city}`}
											</p>
										</div>
									</Link>
								);
							})}
						</div>
					)}
				</section>
			</div>
			<AnomalyRadarWidget userId={userResult.profile.id} />

			{/* Pipeline */}
			<section className="space-y-3">
				<SectionHead title="Acara" href="/operations" />
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<PipelineCard
						label="7 hari ke depan"
						count={upcoming7dCount}
						href="/operations?status=upcoming"
						icon={CalendarClock}
						accent="emerald"
					/>
					<PipelineCard
						label="Berlangsung"
						count={inProgressCount}
						href="/operations?status=in_progress"
						icon={CalendarCheck}
						accent="sky"
					/>
					<PipelineCard
						label="Menunggu settle"
						count={awaitingCount}
						href="/operations?status=awaiting_settlement"
						icon={Hourglass}
						accent="amber"
					/>
					<PipelineCard
						label="Selesai bulan ini"
						count={completedThisMonthCount}
						href="/operations?status=completed"
						icon={CheckCircle2}
						accent="primary"
					/>
				</div>
			</section>

			{/* Target */}
			<section className="space-y-3">
				<h2 className="type-heading px-5">Target</h2>
				<div className="grid grid-cols-2 gap-3">
					<TargetProgressCard
						label="Target bulan ini"
						current={monthCount}
						target={targets.monthly}
						icon={Target}
					/>
					<TargetProgressCard
						label="Target tahun ini"
						current={yearCount}
						target={targets.yearly}
						icon={Target}
					/>
				</div>
			</section>

			{/* Status breakdowns — segmented bars (no more overlapping mini-stats) */}
			<section className="space-y-3">
				<h2 className="type-heading px-5">Status</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<SegmentedBar
						title="Pembayaran"
						icon={<FileText aria-hidden />}
						segments={[
							{ label: "Lunas", value: invoicePaid, tone: "emerald" },
							{ label: "DP", value: invoicePartial, tone: "amber" },
							{ label: "Belum bayar", value: invoiceUnpaid, tone: "rose" },
						]}
					/>
					<SegmentedBar
						title="Acara bulan ini"
						icon={<Activity aria-hidden />}
						segments={[
							{ label: "Mendatang", value: monthUpcoming, tone: "teal" },
							{
								label: "Selesai",
								value: completedThisMonthCount,
								tone: "emerald",
							},
							{ label: "Batal", value: monthCancelled, tone: "rose" },
						]}
					/>
				</div>
			</section>

			{isOwnerLevel && (
				<section className="rounded-[16px] border border-border-subtle bg-card p-5 shadow-[var(--shadow-level-2)]">
					<HutangPiutangOwner
						owners={talanganOwners}
						list={talangan}
						cashAccounts={talanganAccounts}
					/>
				</section>
			)}
		</Container>
	);
}

/* ───────────────────────── small page-local helpers ───────────────────────── */

function SectionHead({ title, href }: { title: string; href?: string }) {
	return (
		<div className="flex items-end justify-between gap-3 px-5">
			<h2 className="type-heading min-w-0">{title}</h2>
			{href ? (
				<Link
					href={href}
					className="type-caption shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					Lihat semua →
				</Link>
			) : null}
		</div>
	);
}

function QuickAction({
	href,
	icon: Icon,
	primary = false,
	children,
}: {
	href: string;
	icon: typeof PlusCircle;
	primary?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]",
				primary
					? "bg-primary text-primary-foreground hover:bg-primary/90"
					: "border border-border-default bg-card text-foreground hover:bg-secondary",
			)}
		>
			<Icon className="size-4" aria-hidden />
			{children}
		</Link>
	);
}
