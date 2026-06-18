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
import { Container } from "@/components/layout/container";
import { PipelineCard } from "@/components/operations/pipeline-card";
import { getCurrentUser } from "@/lib/auth/get-user";
import { getDashboardStats } from "@/lib/dashboard/stats";
import { formatRupiah } from "@/lib/format";
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
							<span className="inline-flex h-[22px] items-center rounded-full bg-amber-300 px-2.5 text-[11.5px] font-medium text-amber-950 dark:bg-amber-500/25 dark:text-amber-200">
								{awaitingCount} nunggu settle
							</span>
							<span className="text-[12px] text-muted-foreground">
								event selesai, belum di-settle
							</span>
						</div>
					</div>
				</div>
			</section>

			{/* Target */}
			<section className="space-y-3">
				<p className="eyebrow px-5">Target capaian</p>
				<div className="grid grid-cols-2 gap-3">
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
				</div>
			</section>

			{/* Status breakdowns — segmented bars (no more overlapping mini-stats) */}
			<section className="space-y-3">
				<p className="eyebrow px-5">Status</p>
				<div className="grid gap-3 sm:grid-cols-2">
					<SegmentedBar
						title="Status Invoice"
						icon={<FileText aria-hidden />}
						segments={[
							{ label: "Lunas", value: invoicePaid, tone: "emerald" },
							{ label: "DP", value: invoicePartial, tone: "amber" },
							{ label: "Belum bayar", value: invoiceUnpaid, tone: "rose" },
						]}
					/>
					<SegmentedBar
						title="Status Operasional"
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

			{/* Pipeline */}
			<section className="space-y-3">
				<SectionHead
					eyebrow="Pipeline"
					title="Pipeline Event"
					href="/operations"
				/>
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<PipelineCard
						label="7 Hari ke Depan"
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
						label="Menunggu Settle"
						count={awaitingCount}
						href="/operations?status=awaiting_settlement"
						icon={Hourglass}
						accent="amber"
					/>
					<PipelineCard
						label="Selesai Bln Ini"
						count={completedThisMonthCount}
						href="/operations?status=completed"
						icon={CheckCircle2}
						accent="primary"
					/>
				</div>
			</section>

			<AnomalyRadarWidget userId={userResult.profile.id} />

			<div className="grid gap-3 lg:grid-cols-3">
				{/* Agenda */}
				<section className="space-y-3 lg:col-span-2">
					<SectionHead eyebrow="Agenda" title="Hari Ini & Besok" />
					{nextEvents.length === 0 ? (
						<div className="flex items-center gap-3 rounded-[16px] border border-dashed border-border-default bg-card/60 p-4">
							<span className="grid size-9 shrink-0 place-items-center rounded-[16px] bg-surface-3 text-muted-foreground">
								<CalendarClock className="size-4" aria-hidden />
							</span>
							<div className="min-w-0">
								<p className="type-body-strong">
									Tidak ada event hari ini / besok
								</p>
								<p className="type-caption">
									Free time — booking baru muncul di sini otomatis.
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

				{/* Aksi Cepat */}
				<section className="space-y-3">
					<SectionHead eyebrow="Pintasan" title="Aksi Cepat" />
					<div className="grid grid-cols-2 gap-3">
						<QuickActionTile
							href="/operations/new"
							icon={PlusCircle}
							label="Booking Baru"
							hint="Buat event baru"
							primary
						/>
						<QuickActionTile
							href="/operations/packages/new"
							icon={Package}
							label="Paket Baru"
							hint="Tambah pricelist"
						/>
						<QuickActionTile
							href="/settings/crew"
							icon={Users}
							label="Master Crew"
							hint="Approve & atur tim"
						/>
						<QuickActionTile
							href="/finance/bank-accounts"
							icon={Receipt}
							label="Rekening Bank"
							hint="Penerima transfer"
						/>
						<QuickActionTile
							href="/settings"
							icon={SettingsIcon}
							label="Pengaturan"
							hint="Konfigurasi sistem"
						/>
					</div>
				</section>
			</div>
		</Container>
	);
}

/* ───────────────────────── small page-local helpers ───────────────────────── */

function SectionHead({
	eyebrow,
	title,
	href,
}: {
	eyebrow: string;
	title: string;
	href?: string;
}) {
	return (
		<div className="flex items-end justify-between gap-3 px-5">
			<div className="min-w-0">
				<p className="eyebrow">{eyebrow}</p>
				<h2 className="type-heading mt-0.5">{title}</h2>
			</div>
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

function QuickActionTile({
	href,
	icon: Icon,
	label,
	hint,
	primary = false,
}: {
	href: string;
	icon: typeof PlusCircle;
	label: string;
	hint: string;
	primary?: boolean;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"press tap group flex items-center gap-3 rounded-[16px] border p-3.5 shadow-[var(--shadow-soft)] transition-colors",
				primary
					? "col-span-2 border-emerald-600/20 bg-emerald-50/70 active:bg-emerald-100/60 dark:bg-emerald-500/10"
					: "border-border-default bg-card active:bg-surface-3",
			)}
		>
			<span
				className={cn(
					"grid size-9 shrink-0 place-items-center rounded-[16px]",
					primary
						? "bg-primary text-white dark:bg-primary"
						: "bg-surface-3 text-muted-foreground",
				)}
			>
				<Icon className="size-4" aria-hidden />
			</span>
			<span className="min-w-0 flex-1">
				<span className="type-label block truncate">{label}</span>
				<span className="type-caption block truncate">{hint}</span>
			</span>
		</Link>
	);
}
