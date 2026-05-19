import {
	AlertTriangle,
	BellOff,
	CheckCircle2,
	ChevronRight,
	Info,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

/**
 * <AnomalyRadarWidget /> — top-3 unread anomaly notifications on
 * dashboard.
 *
 * A3 refactor (sesi 5):
 * - Surface tokens (was bg-surface-2). Severity tones still semantic
 *   (rose/amber/sky/emerald) for clear state mapping but use ring tokens.
 * - Empty state uses fluid type. Cards swap surface on hover, no transform.
 */

type Severity = "alert" | "warning" | "info" | "success";

const SEVERITY_TONES: Record<
	Severity,
	{ ring: string; bg: string; text: string; icon: typeof Info; label: string }
> = {
	alert: {
		ring: "ring-rose-500/20",
		bg: "bg-rose-500/10",
		text: "text-rose-500",
		icon: AlertTriangle,
		label: "Alert",
	},
	warning: {
		ring: "ring-amber-500/20",
		bg: "bg-amber-500/10",
		text: "text-amber-500",
		icon: AlertTriangle,
		label: "Warning",
	},
	info: {
		ring: "ring-sky-500/20",
		bg: "bg-sky-500/10",
		text: "text-sky-500",
		icon: Info,
		label: "Info",
	},
	success: {
		ring: "ring-emerald-500/20",
		bg: "bg-emerald-500/10",
		text: "text-emerald-500",
		icon: CheckCircle2,
		label: "Success",
	},
};

const SEVERITY_RANK: Record<Severity, number> = {
	alert: 0,
	warning: 1,
	info: 2,
	success: 3,
};

export async function AnomalyRadarWidget({ userId }: { userId: string }) {
	const supabase = await createClient();
	const { data, count } = await supabase
		.from("notifications")
		.select(
			"id, severity, category, title, body, action_url, created_at",
			{ count: "exact" },
		)
		.eq("user_id", userId)
		.eq("is_dismissed", false)
		.eq("is_read", false)
		.order("severity", { ascending: true })
		.order("created_at", { ascending: false })
		.limit(5);

	const items = (data ?? []) as Array<{
		id: string;
		severity: Severity;
		category: string;
		title: string;
		body: string;
		action_url: string | null;
		created_at: string;
	}>;

	items.sort((a, b) => {
		const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
		if (r !== 0) return r;
		return b.created_at.localeCompare(a.created_at);
	});
	const top = items.slice(0, 3);
	const total = count ?? 0;

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between">
				<h2 className="text-fluid-h3 font-semibold tracking-tight">
					Anomaly radar
					{total > 0 && (
						<span className="ml-2 tabular text-fluid-caption font-normal text-muted-foreground">
							{total} unread
						</span>
					)}
				</h2>
				<Link
					href="/notifications"
					className="text-fluid-caption font-medium text-muted-foreground hover:text-foreground"
				>
					Lihat semua →
				</Link>
			</div>

			{top.length === 0 ? (
				<div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 dark:bg-emerald-500/[0.08]">
					<div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-500">
						<BellOff className="size-4" />
					</div>
					<div className="space-y-0.5">
						<p className="text-fluid-body font-medium text-foreground">
							Semua aman
						</p>
						<p className="text-fluid-caption text-muted-foreground">
							Belum ada anomaly. Cron scan jalan tiap pagi 06:30 WIB.
						</p>
					</div>
				</div>
			) : (
				<ul className="space-y-2">
					{top.map((n) => {
						const tone = SEVERITY_TONES[n.severity];
						const Icon = tone.icon;
						const card = (
							<div
								className={`group flex items-start gap-3 rounded-xl border border-border-default bg-card p-3.5 transition-colors hover:bg-surface-3 ${
									n.severity === "alert"
										? "ring-1 ring-rose-500/20"
										: ""
								}`}
							>
								<div
									className={`grid size-9 shrink-0 place-items-center rounded-lg ring-2 ${tone.ring} ${tone.bg} ${tone.text}`}
								>
									<Icon className="size-4" />
								</div>
								<div className="min-w-0 flex-1 space-y-1">
									<div className="flex items-baseline gap-2">
										<p className="text-fluid-body font-medium leading-tight text-foreground">
											{n.title}
										</p>
										<Badge
											variant="outline"
											className={`text-[10px] uppercase tracking-wider ${tone.text}`}
										>
											{tone.label}
										</Badge>
									</div>
									<p className="line-clamp-2 text-fluid-caption leading-relaxed text-muted-foreground">
										{n.body}
									</p>
								</div>
								{n.action_url && (
									<ChevronRight className="size-4 self-center text-muted-foreground/60" />
								)}
							</div>
						);
						return (
							<li key={n.id}>
								{n.action_url ? (
									<Link href={n.action_url} className="block">
										{card}
									</Link>
								) : (
									card
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
