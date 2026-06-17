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
import { StatusGroupCard } from "@/components/dashboard/status-group-card";
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

	const {
		thisMonthRevenue,
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
		yearStart,
		yearEnd,
		todayISO,
		tomorrowISO,
		sevenFromNowISO,
	});

	const firstName = userResult.profile.full_name.split(" ")[0];

	return (
		<Container size="xl" className="space-y-6 md:space-y-10">
			{/* Greeting — compact */}
			<header className="space-y-0.5">
				<p className="eyebrow">{ID_DATE_FULL.format(today)}</p>
				<h1 className="type-display">
					Halo, <span className="text-primary">{firstName}</span>.
				</h1>
			</header>

			{/* KPIs — 2×2 compact grid on mobile */}
			<section className="space-y-2.5">
				<p className="eyebrow px-0.5">Ringkasan operasional</p>
				<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
					<MiniStat
						label="Event bln ini"
						value={monthCount.toLocaleString("id-ID")}
						hint="Booking bulan berjalan"
						icon={CalendarCheck}
					/>
					<MiniStat
						label="Pendapatan"
						value={formatRupiah(thisMonthRevenue)}
						hint="Masuk terverifikasi"
						icon={Wallet2}
						tone="positive"
					/>
					<MiniStat
						label="Piutang"
						value={formatRupiah(outstanding)}
						hint="Total piutang aktif"
						icon={Wallet}
						tone={outstanding >= 5_000_000 ? "negative" : "warning"}
					/>
					<MiniStat
						label="Menunggu settle"
						value={awaitingCount.toLocaleString("id-ID")}
						hint="Selesai, belum settle"
						icon={Hourglass}
						tone="warning"
					/>
				</div>
			</section>

			{/* Target & status — paired 2×2 */}
			<section className="space-y-2.5">
				<p className="eyebrow px-0.5">Target & status</p>
				<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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
							{ label: "Mendatang", value: monthUpcoming, tone: "sky" },
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
							{ label: "Belum bayar", value: invoiceUnpaid, tone: "rose" },
						]}
					/>
				</div>
			</section>

			<AnomalyRadarWidget userId={userResult.profile.id} />

			{/* Pipeline — 2×2 compact */}
			<section className="space-y-2.5">
				<SectionHead eyebrow="Pipeline" title="Pipeline Event" href="/operations" />
				<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Agenda */}
				<section className="space-y-2.5 lg:col-span-2">
					<SectionHead eyebrow="Agenda" title="Hari Ini & Besok" />
					{nextEvents.length === 0 ? (
						<div className="flex items-center gap-3 rounded-2xl border border-dashed border-border-default bg-card/60 p-4">
							<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-muted-foreground">
								<CalendarClock className="size-4" aria-hidden />
							</span>
							<div className="min-w-0">
								<p className="type-body-strong">Tidak ada event hari ini / besok</p>
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
										className="press tap flex items-start gap-3 rounded-2xl border border-border-default bg-card p-3.5 shadow-[var(--shadow-soft)] transition-colors active:bg-surface-3"
										style={{ viewTransitionName: `event-${ev.project_id}` }}
									>
										<div
											className={cn(
												"flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl py-2 ring-1",
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

				{/* Aksi Cepat — compact grid, primary action spans full width */}
				<section className="space-y-2.5">
					<SectionHead eyebrow="Pintasan" title="Aksi Cepat" />
					<div className="grid grid-cols-2 gap-2.5">
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

/* ───────────────────────── dashboard-local compact tiles ───────────────────────── */

type StatTone = "default" | "positive" | "negative" | "warning";

const STAT_VALUE_TONE: Record<StatTone, string> = {
	default: "text-foreground",
	positive: "text-emerald-700 dark:text-emerald-400",
	negative: "text-rose-600 dark:text-rose-400",
	warning: "text-amber-700 dark:text-amber-500",
};

const STAT_ICON_TONE: Record<StatTone, string> = {
	default: "bg-surface-3 text-muted-foreground",
	positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	negative: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
	warning: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
};

function MiniStat({
	label,
	value,
	hint,
	icon: Icon,
	tone = "default",
}: {
	label: string;
	value: string;
	hint?: string;
	icon: typeof CalendarCheck;
	tone?: StatTone;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-2xl border border-border-default bg-card p-3.5 shadow-[var(--shadow-soft)]">
			<div className="flex items-center justify-between gap-2">
				<span className="eyebrow truncate">{label}</span>
				<span
					className={cn(
						"grid size-7 shrink-0 place-items-center rounded-lg",
						STAT_ICON_TONE[tone],
					)}
				>
					<Icon className="size-3.5" aria-hidden strokeWidth={2} />
				</span>
			</div>
			<div>
				<div
					className={cn(
						"type-num truncate text-[1.35rem] font-semibold leading-tight",
						STAT_VALUE_TONE[tone],
					)}
				>
					{value}
				</div>
				{hint ? (
					<p className="type-caption mt-0.5 line-clamp-1 leading-tight">{hint}</p>
				) : null}
			</div>
		</div>
	);
}

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
		<div className="flex items-end justify-between gap-3">
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
				"press tap group flex items-center gap-3 rounded-2xl border p-3.5 shadow-[var(--shadow-soft)] transition-colors",
				primary
					? "col-span-2 border-emerald-600/20 bg-emerald-50/70 active:bg-emerald-100/60 dark:bg-emerald-500/10"
					: "border-border-default bg-card active:bg-surface-3",
			)}
		>
			<span
				className={cn(
					"grid size-9 shrink-0 place-items-center rounded-xl",
					primary
						? "bg-emerald-600 text-white dark:bg-emerald-500"
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
