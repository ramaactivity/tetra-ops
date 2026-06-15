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
		<section className="mt-5">
			<div className="mb-2 flex items-center gap-2 px-1">
				<span className="flex size-6 items-center justify-center rounded-full bg-amber-500/15">
					<AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
				</span>
				<h2 className="type-heading">Perlu submit rekap</h2>
				<span className="type-num tabular ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500/15 px-2 text-[0.75rem] font-semibold text-amber-700 dark:text-amber-300">
					{events.length}
				</span>
			</div>
			<ul className="overflow-hidden rounded-[1.25rem] border border-amber-300/60 bg-amber-50/60 shadow-[var(--shadow-level-2)] dark:border-amber-900/70 dark:bg-amber-950/20">
				{events.map((ev) => {
					const city =
						ev.venue_city && ev.venue_city !== ev.venue_name
							? ev.venue_city
							: null;
					return (
						<li key={ev.project_id}>
							<Link
								href={`/crew/jadwal/${ev.project_id}/rekap`}
								className="press tap flex items-center gap-3 border-b border-amber-300/40 px-4 py-3 transition-colors last:border-b-0 active:bg-amber-100/50 dark:border-amber-900/50 dark:active:bg-amber-950/40"
							>
								<div className="flex w-[3.25rem] shrink-0 flex-col items-center gap-0.5">
									<span
										className={
											ev.state === "rejected"
												? "rounded-full bg-rose-500/15 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300"
												: "rounded-full bg-amber-500/20 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
										}
									>
										{ev.state === "rejected" ? "Revisi" : "Belum"}
									</span>
									<span className="type-caption tabular leading-tight text-foreground">
										{formatDateID(ev.event_date)
											.split(" ")
											.slice(0, 2)
											.join(" ")}
									</span>
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="type-body-strong truncate">
											{ev.client_name}
										</span>
										<span className="eyebrow shrink-0">
											{ROLE_LABELS[ev.role_in_event] ?? ev.role_in_event}
										</span>
									</div>
									<p className="type-secondary mt-0.5 flex items-center gap-1">
										<MapPin className="size-3.5 shrink-0" />
										<span className="truncate">
											{ev.venue_name}
											{city ? ` · ${city}` : ""}
										</span>
									</p>
									{ev.state === "rejected" && ev.review_notes ? (
										<p className="mt-1 line-clamp-2 text-[0.75rem] italic leading-snug text-rose-700 dark:text-rose-300">
											Owner: {ev.review_notes}
										</p>
									) : null}
								</div>
								<ChevronRight className="size-4 shrink-0 self-center text-amber-600/70 dark:text-amber-400/70" />
							</Link>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
