import {
	AlertTriangle,
	BellOff,
	CheckCircle2,
	ChevronRight,
	Coins,
	Inbox,
	Info,
	Package,
	Settings,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	DismissButton,
	MarkAllReadButton,
	MarkReadButton,
} from "@/components/notifications/notification-row-actions";
import { RunScannerButton } from "@/components/notifications/run-scanner-button";
import { PushSubscribeButton } from "@/components/push/subscribe-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

type Severity = "alert" | "warning" | "info" | "success";
type Category = "operational" | "financial" | "inventory" | "system";

const SEVERITY_TONES: Record<
	Severity,
	{ ring: string; bg: string; text: string; icon: typeof Info; label: string }
> = {
	alert: {
		ring: "ring-rose-200 dark:ring-rose-900",
		bg: "bg-rose-100 dark:bg-rose-950",
		text: "text-rose-700 dark:text-rose-300",
		icon: AlertTriangle,
		label: "Alert",
	},
	warning: {
		ring: "ring-amber-200 dark:ring-amber-900",
		bg: "bg-amber-100 dark:bg-amber-950",
		text: "text-amber-700 dark:text-amber-300",
		icon: AlertTriangle,
		label: "Warning",
	},
	info: {
		ring: "ring-sky-200 dark:ring-sky-900",
		bg: "bg-sky-100 dark:bg-sky-950",
		text: "text-sky-700 dark:text-sky-300",
		icon: Info,
		label: "Info",
	},
	success: {
		ring: "ring-emerald-200 dark:ring-emerald-900",
		bg: "bg-emerald-100 dark:bg-emerald-950",
		text: "text-emerald-700 dark:text-emerald-300",
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

	const [{ data, error }, { count: unreadCount }] = await Promise.all([
		query,
		supabase
			.from("notifications")
			.select("id", { count: "exact", head: true })
			.eq("user_id", me.profile.id)
			.eq("is_dismissed", false)
			.eq("is_read", false)
			.or(`expires_at.is.null,expires_at.gt.${nowIso}`),
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

	return (
		<Container size="md" className="space-y-6">
			<SectionHeader
				title="Notifications"
				description={
					<>
						Anomaly radar, operational alerts, sistem updates.
						{totalUnread > 0 && (
							<>
								{" · "}
								<span className="tabular font-medium text-rose-600 dark:text-rose-400">
									{totalUnread} unread
								</span>
							</>
						)}
					</>
				}
				actions={
					<>
						<RunScannerButton />
						<MarkAllReadButton disabled={totalUnread === 0} />
					</>
				}
			/>

			{/* Push notifications subscribe */}
			<div className="border-border-default bg-surface-2 flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
				<div className="space-y-0.5">
					<p className="text-foreground text-sm font-medium">
						Push notification ke device ini
					</p>
					<p className="text-muted-foreground text-xs">
						Aktifkan biar dapat alert OS-level (Android lockscreen, macOS, dll)
						saat anomaly fires — tidak perlu app terbuka.
					</p>
				</div>
				<PushSubscribeButton
					vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
				/>
			</div>

			{/* Show / unread toggle */}
			<div className="border-border-default bg-surface-2 inline-flex items-center rounded-md border p-0.5">
				<TabLink
					href={buildQs({ show: "", severity: sev, category: cat })}
					label={`Unread${totalUnread > 0 ? ` (${totalUnread})` : ""}`}
					active={!showAll}
				/>
				<TabLink
					href={buildQs({ show: "all", severity: sev, category: cat })}
					label="Semua"
					active={showAll}
				/>
			</div>

			{/* Severity + category chips */}
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
					Severity:
				</span>
				<ChipLink
					href={buildQs({
						severity: "",
						category: cat,
						show: showAll ? "all" : "",
					})}
					label="All"
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
						tone={SEVERITY_TONES[s].text}
					/>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
					Kategori:
				</span>
				<ChipLink
					href={buildQs({
						category: "",
						severity: sev,
						show: showAll ? "all" : "",
					})}
					label="All"
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
					/>
				))}
			</div>

			{rows.length === 0 ? (
				<EmptyState
					icon={BellOff}
					title={
						showAll
							? "Belum ada notification"
							: totalUnread === 0
								? "Inbox kosong, semua sudah read"
								: "Tidak ada notification cocok filter"
					}
					description={
						showAll
							? "Anomaly scanner & event triggers akan ngirim notif ke sini."
							: "Klik 'Semua' kalau mau lihat yang sudah read."
					}
				/>
			) : (
				<ul className="space-y-2">
					{rows.map((n) => (
						<NotificationItem key={n.id} n={n} />
					))}
				</ul>
			)}
		</Container>
	);
}

function NotificationItem({ n }: { n: NotifRow }) {
	const tone = SEVERITY_TONES[n.severity];
	const SeverityIcon = tone.icon;
	const CategoryIcon = CATEGORY_ICONS[n.category];

	return (
		<li
			className={`border-border-default bg-surface-2 hover:border-foreground/20 group flex items-start gap-3 rounded-xl border p-4 transition-colors ${
				!n.is_read ? "ring-primary/30 ring-1" : ""
			}`}
		>
			<div
				className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-2 ${tone.ring} ${tone.bg} ${tone.text}`}
			>
				<SeverityIcon className="h-4 w-4" />
			</div>

			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex flex-wrap items-baseline gap-2">
					<p
						className={`text-sm leading-tight ${
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
					<span className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px]">
						<CategoryIcon className="h-2.5 w-2.5" />
						{CATEGORY_LABELS[n.category]}
					</span>
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{n.body}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<span className="text-muted-foreground/70 tabular text-[10px]">
						{timeAgo(n.created_at)}
					</span>
					{n.action_url && (
						<Link
							href={n.action_url}
							className="text-primary inline-flex items-center gap-0.5 text-[10px] font-medium hover:underline"
						>
							Open
							<ChevronRight className="h-2.5 w-2.5" />
						</Link>
					)}
					{n.is_resolved && (
						<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 text-[10px] font-medium">
							<CheckCircle2 className="h-2.5 w-2.5" />
							Resolved
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
			className={`inline-flex h-7 items-center rounded px-2.5 text-xs font-medium transition-colors ${
				active
					? "bg-primary text-primary-foreground"
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
	tone,
}: {
	href: string;
	label: string;
	active: boolean;
	tone?: string;
}) {
	return (
		<Link
			href={href}
			className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors ${
				active
					? "border-primary/40 bg-primary/10 text-primary"
					: `border-border-default bg-surface-2 hover:bg-muted ${tone ?? "text-muted-foreground"}`
			}`}
		>
			{label}
		</Link>
	);
}
