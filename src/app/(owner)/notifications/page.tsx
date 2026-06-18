import {
	AlertTriangle,
	BellOff,
	BellRing,
	CheckCircle2,
	ChevronRight,
	Coins,
	Inbox,
	Info,
	Package,
	Settings,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	DismissButton,
	MarkAllReadButton,
	MarkReadButton,
} from "@/components/notifications/notification-row-actions";
import { RunScannerButton } from "@/components/notifications/run-scanner-button";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { PushPrompt } from "@/components/push/push-prompt";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

type Severity = "alert" | "warning" | "info" | "success";
type Category = "operational" | "financial" | "inventory" | "system";

const SEVERITY_TONES: Record<
	Severity,
	{
		ring: string;
		bg: string;
		text: string;
		dot: string;
		icon: typeof Info;
		label: string;
	}
> = {
	alert: {
		ring: "ring-rose-200 dark:ring-rose-900",
		bg: "bg-rose-100 dark:bg-rose-950",
		text: "text-rose-700 dark:text-rose-300",
		dot: "bg-rose-500",
		icon: AlertTriangle,
		label: "Alert",
	},
	warning: {
		ring: "ring-amber-200 dark:ring-amber-900",
		bg: "bg-amber-100 dark:bg-amber-950",
		text: "text-amber-700 dark:text-amber-300",
		dot: "bg-amber-500",
		icon: AlertTriangle,
		label: "Warning",
	},
	info: {
		ring: "ring-sky-200 dark:ring-sky-900",
		bg: "bg-sky-100 dark:bg-sky-950",
		text: "text-sky-700 dark:text-sky-300",
		dot: "bg-sky-500",
		icon: Info,
		label: "Info",
	},
	success: {
		ring: "ring-emerald-200 dark:ring-emerald-900",
		bg: "bg-emerald-100 dark:bg-emerald-950",
		text: "text-emerald-700 dark:text-emerald-300",
		dot: "bg-emerald-500",
		icon: CheckCircle2,
		label: "Success",
	},
};

const CATEGORY_LABELS: Record<Category, string> = {
	operational: "Operational",
	financial: "Financial",
	inventory: "Inventory",
	system: "System",
};

const CATEGORY_ICONS: Record<Category, typeof Inbox> = {
	operational: Inbox,
	financial: Coins,
	inventory: Package,
	system: Settings,
};

type NotifRow = {
	id: string;
	severity: Severity;
	category: Category;
	title: string;
	body: string;
	entity_type: string | null;
	entity_id: string | null;
	action_url: string | null;
	is_read: boolean;
	is_dismissed: boolean;
	is_resolved: boolean;
	created_at: string;
	expires_at: string | null;
};

const SEVERITIES: Severity[] = ["alert", "warning", "info", "success"];
const CATEGORIES: Category[] = [
	"operational",
	"financial",
	"inventory",
	"system",
];

function timeAgo(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return `${sec}s lalu`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m lalu`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour}j lalu`;
	const day = Math.floor(hour / 24);
	if (day < 30) return `${day}h lalu`;
	const month = Math.floor(day / 30);
	if (month < 12) return `${month}bln lalu`;
	return `${Math.floor(month / 12)}thn lalu`;
}

export default async function NotificationsPage({
	searchParams,
}: {
	searchParams: Promise<{
		severity?: string;
		category?: string;
		show?: string;
	}>;
}) {
	const me = await getCurrentUser();
	if (!me) return null;
	const params = await searchParams;
	const sev = (
		SEVERITIES.includes(params.severity as Severity) ? params.severity : ""
	) as Severity | "";
	const cat = (
		CATEGORIES.includes(params.category as Category) ? params.category : ""
	) as Category | "";
	const showAll = params.show === "all";

	const supabase = await createClient();
	// Hide notifications whose expires_at is in the past. Two-clause filter
	// (or expires_at.is.null,expires_at.gt.now) keeps non-expiring rows
	// visible while filtering only on stale ones — prevents DB bloat in UI
	// (audit AUDIT_UI_UX.md §3.8 P1).
	const nowIso = new Date().toISOString();
	let query = supabase
		.from("notifications")
		.select(
			"id, severity, category, title, body, entity_type, entity_id, action_url, is_read, is_dismissed, is_resolved, created_at, expires_at",
		)
		.eq("user_id", me.profile.id)
		.eq("is_dismissed", false)
		.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
		.order("created_at", { ascending: false })
		.limit(200);

	if (!showAll) query = query.eq("is_read", false);
	if (sev) query = query.eq("severity", sev);
	if (cat) query = query.eq("category", cat);

	const [
		{ data, error },
		{ count: unreadCount },
		{ count: totalCount },
		{ data: sevData },
	] = await Promise.all([
		query,
		supabase
			.from("notifications")
			.select("id", { count: "exact", head: true })
			.eq("user_id", me.profile.id)
			.eq("is_dismissed", false)
			.eq("is_read", false)
			.or(`expires_at.is.null,expires_at.gt.${nowIso}`),
		// Total (non-dismissed) — lets the empty state distinguish a brand-new
		// account ("belum ada notif") from "semua sudah dibaca".
		supabase
			.from("notifications")
			.select("id", { count: "exact", head: true })
			.eq("user_id", me.profile.id)
			.eq("is_dismissed", false)
			.or(`expires_at.is.null,expires_at.gt.${nowIso}`),
		// Unread severities — feeds the KPI hero breakdown (global, not filtered).
		supabase
			.from("notifications")
			.select("severity")
			.eq("user_id", me.profile.id)
			.eq("is_dismissed", false)
			.eq("is_read", false)
			.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
			.limit(1000),
	]);

	if (error) {
		return (
			<div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm">{error.message}</p>
				</div>
			</div>
		);
	}

	const rows = (data ?? []) as NotifRow[];
	const totalUnread = unreadCount ?? 0;
	const totalAll = totalCount ?? 0;
	const hasActiveFilter = Boolean(sev || cat);

	// Unread-by-severity for the KPI hero.
	const sevCount: Record<Severity, number> = {
		alert: 0,
		warning: 0,
		info: 0,
		success: 0,
	};
	for (const r of (sevData ?? []) as Array<{ severity: Severity }>) {
		if (r.severity in sevCount) sevCount[r.severity]++;
	}

	return (
		<Container size="xl" className="space-y-3 md:space-y-3">
			<SectionHeader
				title="Notifications"
				actions={
					<>
						<RunScannerButton />
						<MarkAllReadButton disabled={totalUnread === 0} />
					</>
				}
			/>

			{/* Hero — KPI breakdown of unread, same shape every page uses. */}
			<KpiRow>
				<KpiCard
					label="Belum dibaca"
					value={String(totalUnread)}
					hint={`${totalAll} total aktif`}
					icon={BellRing}
					accent="primary"
				/>
				<KpiCard
					label="Alert"
					value={String(sevCount.alert)}
					hint="Perlu tindakan segera"
					icon={AlertTriangle}
					accent="rose"
				/>
				<KpiCard
					label="Warning"
					value={String(sevCount.warning)}
					hint="Perlu dicek"
					icon={AlertTriangle}
					accent="amber"
				/>
				<KpiCard
					label="Info"
					value={String(sevCount.info + sevCount.success)}
					hint="Update & status"
					icon={Info}
					accent="sky"
				/>
			</KpiRow>

			{/* Filters — Status toggle + single-row horizontal-scroll chip groups
			    (severity / kategori) so they never wrap to a messy second line. */}
			<div className="border-border-subtle bg-card divide-border-subtle divide-y overflow-hidden rounded-2xl border shadow-[var(--shadow-level-2)]">
				<FilterRow label="Status">
					<div className="bg-secondary inline-flex items-center rounded-full p-0.5">
						<TabLink
							href={buildQs({ show: "", severity: sev, category: cat })}
							label={`Belum dibaca${totalUnread > 0 ? ` · ${totalUnread}` : ""}`}
							active={!showAll}
						/>
						<TabLink
							href={buildQs({ show: "all", severity: sev, category: cat })}
							label="Semua"
							active={showAll}
						/>
					</div>
				</FilterRow>

				{/* Severity — colored dot carries the meaning; pill stays neutral
				    until selected (calmer than rainbow text). */}
				<FilterRow label="Severity" scroll>
					<ChipLink
						href={buildQs({
							severity: "",
							category: cat,
							show: showAll ? "all" : "",
						})}
						label="Semua"
						active={sev === ""}
					/>
					{SEVERITIES.map((s) => (
						<ChipLink
							key={s}
							href={buildQs({
								severity: s,
								category: cat,
								show: showAll ? "all" : "",
							})}
							label={SEVERITY_TONES[s].label}
							active={sev === s}
							dot={SEVERITY_TONES[s].dot}
						/>
					))}
				</FilterRow>

				{/* Kategori — neutral icon, never colored (DESIGN.md §5). */}
				<FilterRow label="Kategori" scroll>
					<ChipLink
						href={buildQs({
							category: "",
							severity: sev,
							show: showAll ? "all" : "",
						})}
						label="Semua"
						active={cat === ""}
					/>
					{CATEGORIES.map((c) => (
						<ChipLink
							key={c}
							href={buildQs({
								category: c,
								severity: sev,
								show: showAll ? "all" : "",
							})}
							label={CATEGORY_LABELS[c]}
							active={cat === c}
							icon={CATEGORY_ICONS[c]}
						/>
					))}
				</FilterRow>
			</div>

			{rows.length === 0 ? (
				totalAll === 0 ? (
					// Genuinely empty account — common on a second owner's phone where
					// the scanner hasn't created notifications for this user yet. Offer
					// the scan inline so they can self-populate in one tap.
					<EmptyState
						icon={BellOff}
						title="Belum ada notifikasi"
						description="Anomaly scanner & event triggers bakal ngirim notif ke sini. Jalankan scan sekarang buat cek kondisi terkini."
						action={<RunScannerButton />}
					/>
				) : hasActiveFilter ? (
					<EmptyState
						icon={BellOff}
						title="Tidak ada yang cocok filter"
						description="Coba longgarkan filter severity / kategori, atau lihat semua."
						action={
							<ResetLink href={buildQs({ show: showAll ? "all" : "" })} />
						}
					/>
				) : (
					<EmptyState
						icon={CheckCircle2}
						title="Inbox bersih — semua sudah dibaca"
						description="Mantap. Klik 'Semua' kalau mau lihat yang sudah dibaca."
						action={
							<ResetLink
								href={buildQs({ show: "all", severity: sev, category: cat })}
								label="Lihat semua"
							/>
						}
					/>
				)
			) : (
				<ul className="space-y-2">
					{rows.map((n) => (
						<NotificationItem key={n.id} n={n} />
					))}
				</ul>
			)}

			{/* Enable-push / add-to-home-screen — dismissible popup pinned to the
			    bottom, never a hero (see PushPrompt). */}
			<PushPrompt
				vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
			/>
		</Container>
	);
}

function FilterRow({
	label,
	children,
	scroll = false,
}: {
	label: string;
	children: ReactNode;
	/** When true, chips sit in ONE horizontal-scroll row (no wrapping). */
	scroll?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
			<span className="text-muted-foreground shrink-0 text-[11px] font-semibold uppercase tracking-wider sm:w-16">
				{label}
			</span>
			<div
				className={
					scroll
						? "hide-scrollbar -mx-3 flex min-w-0 items-center gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-1 sm:px-0 [&>*]:shrink-0"
						: "flex flex-wrap items-center gap-1.5"
				}
			>
				{children}
			</div>
		</div>
	);
}

function ResetLink({
	href,
	label = "Reset filter",
}: {
	href: string;
	label?: string;
}) {
	return (
		<Link
			href={href}
			className="border-border-default bg-card text-foreground hover:bg-secondary inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors"
		>
			{label}
		</Link>
	);
}

function NotificationItem({ n }: { n: NotifRow }) {
	const tone = SEVERITY_TONES[n.severity];
	const SeverityIcon = tone.icon;
	const CategoryIcon = CATEGORY_ICONS[n.category];

	return (
		<li
			className={`border-border-subtle bg-card hover:border-border-strong group flex items-start gap-3 rounded-2xl border p-4 shadow-[var(--shadow-level-1)] transition-colors ${
				!n.is_read ? "ring-primary/25 ring-1" : ""
			}`}
		>
			<div
				className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-2 ${tone.ring} ${tone.bg} ${tone.text}`}
			>
				<SeverityIcon className="size-4" />
			</div>

			<div className="min-w-0 flex-1 space-y-1.5">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<p
						className={`min-w-0 text-sm leading-snug ${
							n.is_read
								? "text-foreground/80 font-medium"
								: "text-foreground font-semibold"
						}`}
					>
						{n.title}
					</p>
					<Badge
						variant="outline"
						className={`text-[10px] uppercase tracking-wider ${tone.text}`}
					>
						{tone.label}
					</Badge>
					<span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
						<CategoryIcon className="size-3" />
						{CATEGORY_LABELS[n.category]}
					</span>
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{n.body}
				</p>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span className="text-muted-foreground/70 tabular text-[11px]">
						{timeAgo(n.created_at)}
					</span>
					{n.action_url && (
						<Link
							href={n.action_url}
							className="text-primary inline-flex items-center gap-0.5 text-[11px] font-medium hover:underline"
						>
							Buka
							<ChevronRight className="size-3" />
						</Link>
					)}
					{n.is_resolved && (
						<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 text-[11px] font-medium">
							<CheckCircle2 className="size-3" />
							Selesai
						</span>
					)}
				</div>
			</div>

			<div className="flex flex-col items-center gap-1">
				{!n.is_read && <MarkReadButton id={n.id} />}
				<DismissButton id={n.id} />
			</div>
		</li>
	);
}

function buildQs(updates: Record<string, string>): string {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(updates)) {
		if (v) params.set(k, v);
	}
	const qs = params.toString();
	return qs ? `/notifications?${qs}` : "/notifications";
}

function TabLink({
	href,
	label,
	active,
}: {
	href: string;
	label: string;
	active: boolean;
}) {
	return (
		<Link
			href={href}
			aria-current={active ? "true" : undefined}
			className={`inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors ${
				active
					? "bg-[#059669] text-white shadow-[var(--shadow-level-1)]"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			{label}
		</Link>
	);
}

function ChipLink({
	href,
	label,
	active,
	dot,
	icon: Icon,
}: {
	href: string;
	label: string;
	active: boolean;
	/** Semantic status color (severity only) — a small leading dot. */
	dot?: string;
	/** Neutral leading icon (category only). */
	icon?: typeof Info;
}) {
	return (
		<Link
			href={href}
			aria-current={active ? "true" : undefined}
			className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
				active
					? "border-[#059669] bg-[#059669] text-white"
					: "border-border-default bg-card text-foreground/70 hover:bg-secondary hover:text-foreground"
			}`}
		>
			{dot ? (
				<span
					aria-hidden
					className={`size-2 shrink-0 rounded-full ${active ? "bg-white/90" : dot}`}
				/>
			) : null}
			{Icon ? (
				<Icon
					aria-hidden
					className={`size-3.5 shrink-0 ${active ? "text-white" : "text-muted-foreground"}`}
				/>
			) : null}
			{label}
		</Link>
	);
}
