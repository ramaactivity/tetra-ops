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
import { AppHeader, AppScreen, Section } from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { FRAME_SIZE_LABELS, formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type AssignedEvent = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	venue_name: string;
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

	const todayISO = isoDate(new Date());

	const supabase = await createClient();

	let query = supabase
		.from("crew_assignments")
		.select(
			`role_in_event,
			event:events!inner(
				id, project_id, status, client_name, event_date,
				setup_time, start_time, venue_name, venue_city,
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
					<div className="rounded-[1.25rem] border border-dashed border-border-default bg-card/40 px-5 py-10 text-center">
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
							const tbcStart = !ev.start_time;
							const tbcFrame = !ev.frame_size;
							const tbcBackdrop = !ev.backdrop_id;
							const hasAnyTbc = tbcStart || tbcFrame || tbcBackdrop;
							const city =
								ev.venue_city && ev.venue_city !== ev.venue_name
									? ev.venue_city
									: null;
							const [dd, mon] = formatDateID(ev.event_date).split(" ");
							return (
								<li key={ev.id}>
									<Link
										href={`/crew/jadwal/${ev.project_id}`}
										className="press tap block rounded-[1.25rem] border border-border-default bg-card p-3.5 shadow-[var(--shadow-level-2)] transition-colors active:bg-surface-3"
										style={{
											viewTransitionName: `crew-event-${ev.project_id}`,
										}}
									>
										<div className="flex items-center gap-3.5">
											<div className="flex w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-surface-3 px-1 py-2.5">
												<span className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
													{dd} {mon}
												</span>
												<span
													className={cn(
														"type-num text-[1.2rem] leading-none",
														tbcStart
															? "text-amber-600 dark:text-amber-400"
															: "text-foreground",
													)}
												>
													{tbcStart ? "TBC" : ID_TIME(ev.start_time)}
												</span>
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
														{ev.venue_name}
														{city ? ` · ${city}` : ""}
													</span>
												</p>
												<div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
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
												{hasAnyTbc ? (
													<div className="mt-2 flex flex-wrap items-center gap-1.5">
														{tbcStart ? (
															<TbcBadge icon={Clock} label="Jam menyusul" />
														) : null}
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
