import { AlertCircle, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type EventRow = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
	venue_name: string;
	venue_city: string | null;
	status: string;
	is_migrated_legacy: boolean | null;
	// PostgREST resolves events→crew_rekap as a to-ONE relationship because
	// crew_rekap.event_id is UNIQUE, so the embed comes back as a single object
	// (not an array). Type both shapes; normalizeRekap() below handles either.
	crew_rekap: RekapEmbed | RekapEmbed[] | null;
};

type RekapEmbed = {
	id: string;
	is_approved: boolean | null;
	review_notes: string | null;
	locked: boolean | null;
};

function normalizeRekap(
	raw: RekapEmbed | RekapEmbed[] | null | undefined,
): RekapEmbed | null {
	if (!raw) return null;
	return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

type AssignmentRow = {
	role_in_event: string;
	event: EventRow | EventRow[] | null;
};

type ActionableEvent = {
	project_id: string;
	client_name: string;
	event_date: string;
	venue_name: string;
	venue_city: string | null;
	state: "missing" | "rejected";
	review_notes: string | null;
};

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

export async function NeedsRekapSection({ userId }: { userId: string }) {
	const supabase = await createClient();
	const todayISO = new Date().toISOString().slice(0, 10);

	const { data } = await supabase
		.from("crew_assignments")
		.select(
			`role_in_event,
			event:events!inner(
				id, project_id, client_name, event_date, venue_name, venue_city,
				status, is_migrated_legacy,
				crew_rekap(id, is_approved, review_notes, locked)
			)`,
		)
		.eq("user_id", userId)
		.lte("event.event_date", todayISO)
		.in("event.status", ["awaiting_settlement", "in_progress"]);

	const rows = (data ?? []) as AssignmentRow[];

	const events: Array<ActionableEvent & { role_in_event: string }> = [];
	for (const row of rows) {
		const ev = Array.isArray(row.event) ? row.event[0] : row.event;
		if (!ev || ev.is_migrated_legacy) continue;
		const rekap = normalizeRekap(ev.crew_rekap);
		if (rekap?.locked) continue;
		if (rekap === null) {
			events.push({
				project_id: ev.project_id,
				client_name: ev.client_name,
				event_date: ev.event_date,
				venue_name: ev.venue_name,
				venue_city: ev.venue_city,
				state: "missing",
				review_notes: null,
				role_in_event: row.role_in_event,
			});
			continue;
		}
		if (rekap.is_approved === false) {
			events.push({
				project_id: ev.project_id,
				client_name: ev.client_name,
				event_date: ev.event_date,
				venue_name: ev.venue_name,
				venue_city: ev.venue_city,
				state: "rejected",
				review_notes: rekap.review_notes,
				role_in_event: row.role_in_event,
			});
		}
	}

	if (events.length === 0) return null;

	events.sort((a, b) => b.event_date.localeCompare(a.event_date));

	return (
		<section className="space-y-2">
			<div className="flex items-center gap-1.5">
				<AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
				<h2 className="text-fluid-h3 font-semibold tracking-tight">
					Perlu submit rekap
				</h2>
				<span className="tabular ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
					{events.length}
				</span>
			</div>
			<div className="space-y-2">
				{events.map((ev) => (
					<Link
						key={ev.project_id}
						href={`/crew/jadwal/${ev.project_id}/rekap`}
						className="press-down flex items-stretch gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 transition-colors hover:bg-amber-100/50 dark:border-amber-900 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
					>
						<div className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5">
							<span className="text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
								{ev.state === "rejected" ? "Revisi" : "Belum"}
							</span>
							<span className="tabular text-foreground text-[10px] leading-tight">
								{formatDateID(ev.event_date).split(" ").slice(0, 2).join(" ")}
							</span>
						</div>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-baseline gap-1.5">
								<span className="truncate text-sm font-medium">
									{ev.client_name}
								</span>
								<span className="text-muted-foreground text-[10px] uppercase tracking-wider">
									{ROLE_LABELS[ev.role_in_event] ?? ev.role_in_event}
								</span>
							</div>
							<p className="text-muted-foreground flex items-center gap-1 text-xs">
								<MapPin className="h-3 w-3 shrink-0" />
								<span className="truncate">
									{ev.venue_name}
									{ev.venue_city && ` · ${ev.venue_city}`}
								</span>
							</p>
							{ev.state === "rejected" && ev.review_notes && (
								<p className="text-rose-700 dark:text-rose-300 line-clamp-2 text-[11px] italic leading-snug">
									Owner: {ev.review_notes}
								</p>
							)}
						</div>
						<ChevronRight className="h-4 w-4 self-center text-amber-600 dark:text-amber-400" />
					</Link>
				))}
			</div>
		</section>
	);
}
