import {
	CalendarPlus,
	ChevronRight,
	Clock,
	Frame,
	Image as ImageIcon,
	MapPin,
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { NeedsRekapSection } from "@/components/rekap/needs-rekap-section";
import {
	AppHeader,
	AppScreen,
	AvatarGroup,
	Section,
} from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { todayWIB } from "@/lib/dates";
import { FRAME_SIZE_LABELS, formatDateID, venueLabel } from "@/lib/format";
import { hasBreak, parseSegments } from "@/lib/schedule/segments";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

type AssignedEvent = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	event_date: string;
	event_date_is_estimate: boolean | null;
	setup_time: string | null;
	start_time: string | null;
	session_segments: unknown;
	venue_name: string | null;
	venue_city: string | null;
	is_migrated_legacy: boolean | null;
	frame_size: string | null;
	backdrop_id: string | null;
	backdrop: { name: string } | { name: string }[] | null;
};

type AssignmentRow = {
	role_in_event: string;
	event: AssignedEvent | AssignedEvent[] | null;
};

export default async function CrewSchedulePage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const params = await searchParams;
	const tab = params.tab === "past" ? "past" : "upcoming";

	const me = await getCurrentUser();
	if (!me) return null;

	// Tanggal dibandingkan di WIB — lihat lib/dates.
	const todayISO = todayWIB();

	const supabase = await createClient();

	let query = supabase
		.from("crew_assignments")
		.select(
			`role_in_event,
			event:events!inner(
				id, project_id, status, client_name, event_date, event_date_is_estimate,
				setup_time, start_time, session_segments, venue_name, venue_city,
				is_migrated_legacy, frame_size, backdrop_id,
				backdrop:backdrops(name)
			)`,
		)
		.eq("user_id", me.profile.id);

	if (tab === "upcoming") {
		query = query.gte("event.event_date", todayISO);
	} else {
		query = query.lt("event.event_date", todayISO);
	}

	const { data, error } = await query;

	if (error) {
		return (
			<AppScreen>
				<AppHeader title="Jadwal" />
				<div className="mt-4 rounded-2xl border border-rose-300/60 bg-rose-50/60 p-4 dark:border-rose-900/70 dark:bg-rose-950/20">
					<p className="type-body text-rose-700 dark:text-rose-300">
						{error.message}
					</p>
				</div>
			</AppScreen>
		);
	}

	const assignments = ((data ?? []) as AssignmentRow[]).filter((a) => a.event);

	assignments.sort((a, b) => {
		const ea = Array.isArray(a.event) ? a.event[0] : a.event;
		const eb = Array.isArray(b.event) ? b.event[0] : b.event;
		if (!ea || !eb) return 0;
		const dCompare = ea.event_date.localeCompare(eb.event_date);
		if (dCompare !== 0) return tab === "upcoming" ? dCompare : -dCompare;
		return (ea.start_time ?? "").localeCompare(eb.start_time ?? "");
	});

	// Crew roster per event (avatars) in ONE batched RPC — crew can't read peers'
	// users rows under RLS, so this SECURITY DEFINER fn returns safe fields only.
	const eventIds = assignments
		.map((a) => (Array.isArray(a.event) ? a.event[0] : a.event)?.id)
		.filter((v): v is string => Boolean(v));
	const crewByEvent = new Map<
		string,
		Array<{ id: string; name: string; avatar_url: string | null }>
	>();
	if (eventIds.length > 0) {
		const { data: crewRows } = await supabase.rpc("get_events_crew", {
			p_event_ids: eventIds,
		});
		for (const r of (crewRows ?? []) as Array<{
			event_id: string;
			user_id: string;
			full_name: string;
			avatar_url: string | null;
		}>) {
			const list = crewByEvent.get(r.event_id) ?? [];
			list.push({ id: r.user_id, name: r.full_name, avatar_url: r.avatar_url });
			crewByEvent.set(r.event_id, list);
		}
	}

	return (
		<AppScreen>
			<AppHeader title="Jadwal" subtitle="Semua event yang ditugaskan ke lo." />

			<NeedsRekapSection userId={me.profile.id} />

			{/* Segmented control */}
			<div className="mt-5 grid grid-cols-2 gap-1 rounded-full border border-border-default bg-surface-3 p-1">
				<SegLink
					href="/crew/jadwal"
					label="Mendatang"
					active={tab === "upcoming"}
				/>
				<SegLink
					href="/crew/jadwal?tab=past"
					label="Selesai"
					active={tab === "past"}
				/>
			</div>

			<Section className="mt-4">
				{assignments.length === 0 ? (
					<div className="rounded-[16px] border border-dashed border-border-default bg-card/40 px-5 py-10 text-center">
						<CalendarPlus className="mx-auto mb-2.5 size-7 text-muted-foreground/50" />
						<p className="type-body-strong">
							{tab === "upcoming"
								? "Belum ada event mendatang"
								: "Belum ada event selesai"}
						</p>
						<p className="type-secondary mx-auto mt-1 max-w-[18rem]">
							{tab === "upcoming"
								? "Tunggu ditugaskan owner. Notif WA bakal masuk pas lo dapet jadwal baru."
								: "Event yang udah kelar bakal muncul di sini."}
						</p>
					</div>
				) : (
					<ul className="space-y-3">
						{assignments.map((a) => {
							const ev = Array.isArray(a.event) ? a.event[0] : a.event;
							if (!ev) return null;
							const backdrop = Array.isArray(ev.backdrop)
								? ev.backdrop[0]
								: ev.backdrop;
							// Event yang sudah kelar / batal / hasil migrasi lama tidak
							// perlu ditandai "menyusul" lagi — sama seperti sisi owner.
							const tbcRelevant =
								!ev.is_migrated_legacy &&
								(ev.status === "upcoming" || ev.status === "in_progress");
							const tbcStart = tbcRelevant && !ev.start_time;
							const sessions = parseSegments(ev.session_segments);
							const multiSesi = hasBreak(sessions);
							const tbcFrame = tbcRelevant && !ev.frame_size;
							const tbcBackdrop = tbcRelevant && !ev.backdrop_id;
							const city =
								ev.venue_city && ev.venue_city !== ev.venue_name
									? ev.venue_city
									: null;
							const [dd, mon] = formatDateID(ev.event_date).split(" ");
							const crew = crewByEvent.get(ev.id) ?? [];
							return (
								<li key={ev.id}>
									<Link
										href={`/crew/jadwal/${ev.project_id}`}
										className="press tap block rounded-[16px] border border-border-default bg-card p-3.5 shadow-[var(--shadow-level-2)] transition-colors active:bg-surface-3"
										style={{
											viewTransitionName: `crew-event-${ev.project_id}`,
										}}
									>
										<div className="flex items-center gap-3.5">
											<div
												className={`flex w-[3.4rem] shrink-0 flex-col items-center justify-center rounded-2xl py-2 ${
													ev.event_date_is_estimate
														? "bg-amber-500/15"
														: "bg-surface-3"
												}`}
											>
												<span className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
													{mon}
												</span>
												<span className="type-num text-[1.55rem] leading-none text-foreground">
													{dd}
												</span>
												{tbcRelevant && ev.event_date_is_estimate ? (
													<span className="text-[0.5rem] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
														TBC
													</span>
												) : null}
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<span className="type-body-strong truncate">
														{ev.client_name}
													</span>
													<EventStatusBadge status={ev.status} />
												</div>
												<p className="type-secondary mt-1 flex items-center gap-1">
													<MapPin className="size-3.5 shrink-0" />
													<span className="truncate">
														{venueLabel(ev.venue_name)}
														{city ? ` · ${city}` : ""}
													</span>
												</p>
												<div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
													<span
														className={cn(
															"inline-flex items-center gap-1 font-semibold",
															tbcStart
																? "text-amber-600 dark:text-amber-400"
																: "text-foreground",
														)}
													>
														<Clock className="size-3.5" />
														<span className="type-num text-[0.9375rem]">
															{tbcStart ? "TBC" : ID_TIME(ev.start_time)}
														</span>
													</span>
													{multiSesi && sessions ? (
														<span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-700 dark:text-amber-300">
															{sessions.length} sesi
														</span>
													) : null}
													<span className="eyebrow">
														{ROLE_LABELS[a.role_in_event] ?? a.role_in_event}
													</span>
													{!tbcFrame && ev.frame_size ? (
														<span className="type-caption">
															Frame{" "}
															{FRAME_SIZE_LABELS[ev.frame_size] ??
																ev.frame_size}
														</span>
													) : null}
													{!tbcBackdrop && backdrop?.name ? (
														<span className="type-caption truncate">
															{backdrop.name}
														</span>
													) : null}
												</div>
												{tbcFrame || tbcBackdrop ? (
													<div className="mt-2 flex flex-wrap items-center gap-1.5">
														{tbcFrame ? (
															<TbcBadge icon={Frame} label="Frame menyusul" />
														) : null}
														{tbcBackdrop ? (
															<TbcBadge
																icon={ImageIcon}
																label="Backdrop menyusul"
															/>
														) : null}
													</div>
												) : null}
												{crew.length > 0 ? (
													<div className="mt-2.5 flex items-center gap-2">
														<AvatarGroup people={crew} size="sm" max={4} />
														<span className="type-caption">
															{crew.length} crew
														</span>
													</div>
												) : null}
											</div>
											<ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/50" />
										</div>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</Section>
		</AppScreen>
	);
}

function TbcBadge({
	icon: Icon,
	label,
}: {
	icon: typeof Clock;
	label: string;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-700 dark:text-amber-300">
			<Icon className="size-3" />
			{label}
		</span>
	);
}

function SegLink({
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
			aria-current={active ? "page" : undefined}
			className={cn(
				"press-sm tap flex h-9 items-center justify-center rounded-full text-[0.875rem] font-medium transition-colors",
				active
					? "bg-card text-foreground shadow-[var(--shadow-level-2)]"
					: "text-muted-foreground active:text-foreground",
			)}
		>
			{label}
		</Link>
	);
}
