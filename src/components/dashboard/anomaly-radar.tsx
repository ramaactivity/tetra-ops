import {
	AlertTriangle,
	BellOff,
	CheckCircle2,
	ChevronRight,
	Info,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

type Severity = "alert" | "warning" | "info" | "success";

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

const SEVERITY_RANK: Record<Severity, number> = {
	alert: 0,
	warning: 1,
	info: 2,
	success: 3,
};

export async function AnomalyRadarWidget() {
	const me = await getCurrentUser();
	if (!me) return null;

	const supabase = await createClient();
	const { data, count } = await supabase
		.from("notifications")
		.select(
			"id, severity, category, title, body, action_url, created_at",
			{ count: "exact" },
		)
		.eq("user_id", me.profile.id)
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

	// Sort by severity rank then date desc
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
				<h2 className="text-base font-semibold tracking-tight">
					Anomaly radar
					{total > 0 && (
						<span className="text-muted-foreground tabular ml-2 text-xs font-normal">
							{total} unread
						</span>
					)}
				</h2>
				<Link
					href="/notifications"
					className="text-muted-foreground hover:text-foreground text-xs font-medium"
				>
					Lihat semua →
				</Link>
			</div>

			{top.length === 0 ? (
				<div className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 flex items-center gap-3 rounded-xl border p-4">
					<div className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
						<BellOff className="h-4 w-4" />
					</div>
					<div className="space-y-0.5">
						<p className="text-foreground text-sm font-medium">
							Semua aman
						</p>
						<p className="text-muted-foreground text-xs">
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
								className={`border-border bg-card hover:border-foreground/20 group flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
									n.severity === "alert" ? "ring-1 ring-rose-200/50 dark:ring-rose-900/50" : ""
								}`}
							>
								<div
									className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-2 ${tone.ring} ${tone.bg} ${tone.text}`}
								>
									<Icon className="h-4 w-4" />
								</div>
								<div className="min-w-0 flex-1 space-y-1">
									<div className="flex items-baseline gap-2">
										<p className="text-foreground text-sm font-medium leading-tight">
											{n.title}
										</p>
										<Badge
											variant="outline"
											className={`text-[10px] uppercase tracking-wider ${tone.text}`}
										>
											{tone.label}
										</Badge>
									</div>
									<p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
										{n.body}
									</p>
								</div>
								{n.action_url && (
									<ChevronRight className="text-muted-foreground/60 h-4 w-4 self-center" />
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
