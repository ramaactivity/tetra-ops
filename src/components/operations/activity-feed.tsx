import {
	Activity,
	CalculatorIcon,
	CalendarPlus,
	Pencil,
	RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

type Audit = {
	id: string;
	action: string;
	entity_type: string;
	changes: Record<string, unknown> | null;
	metadata: Record<string, unknown> | null;
	created_at: string;
	actor: { full_name: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	confirmed: "Confirmed",
	design_brief: "Design Brief",
	design_approved: "Design Approved",
	upcoming: "Upcoming",
	in_progress: "In Progress",
	awaiting_settlement: "Awaiting Settlement",
	completed: "Completed",
	cancelled: "Cancelled",
	archived: "Archived",
};

function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function summarize(a: Audit): {
	icon: ReactNode;
	tone: "primary" | "emerald" | "rose" | "amber" | "muted";
	title: string;
	detail?: string;
} {
	// Custom RPC-emitted audits (settlement)
	if (a.entity_type === "event_settlement") {
		if (a.action === "settlement_close") {
			const profit = Number(a.metadata?.net_profit ?? 0);
			const isLoss = !!a.metadata?.is_loss;
			return {
				icon: <CalculatorIcon className="h-3.5 w-3.5" />,
				tone: isLoss ? "rose" : "emerald",
				title: isLoss ? "Settlement ditutup (rugi)" : "Settlement ditutup",
				detail: `Net ${isLoss ? "loss" : "profit"} Rp ${Math.abs(profit).toLocaleString("id-ID")}`,
			};
		}
		if (a.action === "settlement_reopen") {
			return {
				icon: <RefreshCw className="h-3.5 w-3.5" />,
				tone: "amber",
				title: "Settlement di-reopen",
				detail: a.metadata?.reason
					? `“${a.metadata.reason as string}”`
					: undefined,
			};
		}
	}

	// Trigger-generated audits on events table
	if (a.entity_type === "events") {
		const before = (a.changes?.before ?? null) as Record<
			string,
			unknown
		> | null;
		const after = (a.changes?.after ?? null) as Record<string, unknown> | null;

		if (a.action === "insert") {
			return {
				icon: <CalendarPlus className="h-3.5 w-3.5" />,
				tone: "primary",
				title: "Booking dibuat",
				detail: (after?.client_name as string) || (after?.project_id as string),
			};
		}
		if (a.action === "update") {
			// Status change is the most interesting diff
			if (before && after && before.status !== after.status) {
				const fromLabel =
					STATUS_LABELS[String(before.status)] ?? String(before.status);
				const toLabel =
					STATUS_LABELS[String(after.status)] ?? String(after.status);
				return {
					icon: <RefreshCw className="h-3.5 w-3.5" />,
					tone: "amber",
					title: "Status berubah",
					detail: `${fromLabel} → ${toLabel}`,
				};
			}
			return {
				icon: <Pencil className="h-3.5 w-3.5" />,
				tone: "muted",
				title: "Booking diedit",
			};
		}
	}

	return {
		icon: <Activity className="h-3.5 w-3.5" />,
		tone: "muted",
		title: a.action,
		detail: a.entity_type,
	};
}

const TONE_DOT: Record<string, string> = {
	primary: "bg-primary",
	emerald: "bg-emerald-500",
	rose: "bg-rose-500",
	amber: "bg-amber-500",
	muted: "bg-muted-foreground/40",
};

export async function EventActivityFeed({ eventId }: { eventId: string }) {
	const supabase = await createClient();

	// Fetch in two queries because Supabase JS doesn't compose JSONB OR cleanly
	const [byEntityResult, byMetadataResult] = await Promise.all([
		supabase
			.from("audit_log")
			.select(
				`
				id, action, entity_type, changes, metadata, created_at,
				actor:users!audit_log_actor_id_fkey(full_name)
			`,
			)
			.eq("entity_type", "events")
			.eq("entity_id", eventId)
			.order("created_at", { ascending: false })
			.limit(30),
		supabase
			.from("audit_log")
			.select(
				`
				id, action, entity_type, changes, metadata, created_at,
				actor:users!audit_log_actor_id_fkey(full_name)
			`,
			)
			.eq("metadata->>event_id", eventId)
			.order("created_at", { ascending: false })
			.limit(30),
	]);

	const byEntity = (byEntityResult.data ?? []).map((r) => ({
		...r,
		actor: Array.isArray(r.actor) ? r.actor[0] : r.actor,
	})) as Audit[];
	const byMetadata = (byMetadataResult.data ?? []).map((r) => ({
		...r,
		actor: Array.isArray(r.actor) ? r.actor[0] : r.actor,
	})) as Audit[];

	const seen = new Set<string>();
	const merged: Audit[] = [];
	for (const a of [...byEntity, ...byMetadata]) {
		if (seen.has(a.id)) continue;
		seen.add(a.id);
		merged.push(a);
	}
	merged.sort((a, b) => b.created_at.localeCompare(a.created_at));

	if (merged.length === 0) {
		return (
			<div className="border-border-default bg-surface-2 md:col-span-2 rounded-lg border p-5">
				<h3 className="text-sm font-semibold tracking-tight">Activity</h3>
				<p className="text-muted-foreground mt-2 text-sm italic">
					Belum ada aktivitas tercatat.
				</p>
			</div>
		);
	}

	return (
		<div className="border-border-default bg-surface-2 md:col-span-2 space-y-4 rounded-lg border p-5">
			<div>
				<h3 className="text-sm font-semibold tracking-tight">Activity</h3>
				<p className="text-muted-foreground text-xs">
					{merged.length} entri terbaru · dari{" "}
					<code className="font-mono">audit_log</code>
				</p>
			</div>
			<ol className="space-y-0">
				{merged.map((a, idx) => {
					const summary = summarize(a);
					const isLast = idx === merged.length - 1;
					return (
						<li key={a.id} className="flex gap-3">
							<div className="flex flex-col items-center">
								<div
									className={`${TONE_DOT[summary.tone]} text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full`}
								>
									{summary.icon}
								</div>
								{!isLast && (
									<span aria-hidden="true" className="bg-border w-px flex-1" />
								)}
							</div>
							<div className="flex-1 pb-4">
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<p className="text-sm font-medium">{summary.title}</p>
									<p className="text-muted-foreground tabular text-xs">
										{formatDateTime(a.created_at)}
									</p>
								</div>
								{summary.detail && (
									<p className="text-muted-foreground text-xs">
										{summary.detail}
									</p>
								)}
								{a.actor?.full_name && (
									<p className="text-muted-foreground/70 text-xs">
										oleh {a.actor.full_name}
									</p>
								)}
							</div>
						</li>
					);
				})}
			</ol>
		</div>
	);
}
