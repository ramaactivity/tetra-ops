import {
	CalendarClock,
	ChevronRight,
	ExternalLink,
	MapPin,
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { PushPrompt } from "@/components/push/push-prompt";
import { NeedsRekapSection } from "@/components/rekap/needs-rekap-section";
import {
	AppHeader,
	AppScreen,
	AvatarGroup,
	Section,
	StatTile,
} from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { shiftISODate, todayWIB } from "@/lib/dates";
import { venueLabel } from "@/lib/format";
import { hasBreak, parseSegments } from "@/lib/schedule/segments";
import { createClient } from "@/lib/supabase/server";
import { waLink } from "@/lib/whatsapp";

const ID_DATE_FULL = new Intl.DateTimeFormat("id-ID", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
});
const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

type EventLite = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	session_segments: unknown;
	venue_name: string | null;
	venue_city: string | null;
	google_maps_url: string | null;
	is_migrated_legacy: boolean | null;
	pic_name: string | null;
	pic_wa: string | null;
};

type Assignment = {
	role_in_event: string;
	event: EventLite | EventLite[] | null;
};

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

export default async function CrewHomePage() {
	const me = await getCurrentUser();
	if (!me) return null;

	const today = new Date();
	// Tanggal dihitung di WIB: server Vercel jalan di UTC, jadi antara 00:00–07:00
	// WIB event hari-H akan dilabeli "Besok" — persis jam crew berangkat setup.
	const todayISO = todayWIB();
	const tomorrowISO = shiftISODate(todayISO, 1);
	// Bulan berjalan — semua event bulan ini, dipisah "sudah selesai" vs "mendatang".
	const [curYear, curMonth] = todayISO.split("-").map(Number);
	const monthStartISO = `${todayISO.slice(0, 7)}-01`;
	const monthEndISO = new Date(Date.UTC(curYear, curMonth, 0))
		.toISOString()
		.slice(0, 10);
	const monthName = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(
		today,
	);

	const supabase = await createClient();

	const [{ data: nextAssignmentsData }, { data: monthAssignmentsData }] =
		await Promise.all([
			supabase
				.from("crew_assignments")
				.select(
					`role_in_event,
				event:events!inner(
					id, project_id, status, client_name, event_date,
					setup_time, start_time, end_time, session_segments,
					venue_name, venue_city, google_maps_url,
					is_migrated_legacy, pic_name, pic_wa
				)`,
				)
				.eq("user_id", me.profile.id)
				.gte("event.event_date", todayISO)
				.lte("event.event_date", tomorrowISO),
			supabase
				.from("crew_assignments")
				.select("event:events!inner(event_date)")
				.eq("user_id", me.profile.id)
				.gte("event.event_date", monthStartISO)
				.lte("event.event_date", monthEndISO),
		]);

	const nextAssignments = (nextAssignmentsData ?? []).filter(
		(a) => a.event,
	) as Assignment[];

	nextAssignments.sort((a, b) => {
		const ea = Array.isArray(a.event) ? a.event[0] : a.event;
		const eb = Array.isArray(b.event) ? b.event[0] : b.event;
		if (!ea || !eb) return 0;
		if (ea.event_date !== eb.event_date)
			return ea.event_date.localeCompare(eb.event_date);
		return (ea.start_time ?? "").localeCompare(eb.start_time ?? "");
	});

	const monthRows = (monthAssignmentsData ?? []) as Array<{
		event: { event_date: string } | { event_date: string }[] | null;
	}>;
	let doneThisMonth = 0;
	let upcomingThisMonth = 0;
	for (const r of monthRows) {
		const ev = Array.isArray(r.event) ? r.event[0] : r.event;
		if (!ev) continue;
		if (ev.event_date < todayISO) doneThisMonth += 1;
		else upcomingThisMonth += 1;
	}

	// Crew avatars per event (batched, RLS-safe RPC).
	const homeEventIds = nextAssignments
		.map((a) => (Array.isArray(a.event) ? a.event[0] : a.event)?.id)
		.filter((v): v is string => Boolean(v));
	const crewByEvent = new Map<
		string,
		Array<{ id: string; name: string; avatar_url: string | null }>
	>();
	if (homeEventIds.length > 0) {
		const { data: crewRows } = await supabase.rpc("get_events_crew", {
			p_event_ids: homeEventIds,
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

	const firstName = me.profile.full_name.split(" ")[0];

	return (
		<AppScreen>
			<AppHeader
				title={`Halo, ${firstName}`}
				subtitle={ID_DATE_FULL.format(today)}
			/>

			<NeedsRekapSection userId={me.profile.id} />

			<Section title={`Bulan ${monthName}`}>
				<div className="grid grid-cols-2 gap-3">
					<StatTile
						label="Sudah selesai"
						value={doneThisMonth}
						hint={`event ${monthName}`}
						tone={doneThisMonth > 0 ? "positive" : "default"}
					/>
					<StatTile
						label="Mendatang"
						value={upcomingThisMonth}
						hint={`event ${monthName}`}
					/>
				</div>
				<Link
					href="/crew/jadwal"
					className="press tap mt-3 flex items-center justify-between gap-2 rounded-[16px] border border-border-default bg-card px-4 py-3.5 shadow-[var(--shadow-level-2)] transition-colors active:bg-surface-3"
				>
					<span className="type-body-strong">Lihat semua jadwal</span>
					<ChevronRight className="size-4 text-muted-foreground/60" />
				</Link>
			</Section>

			<Section title="Hari ini & besok">
				{nextAssignments.length === 0 ? (
					<div className="rounded-[16px] border border-dashed border-border-default bg-card/40 px-5 py-9 text-center">
						<CalendarClock className="mx-auto mb-2.5 size-7 text-muted-foreground/50" />
						<p className="type-body-strong">Free time hari ini & besok</p>
						<p className="type-secondary mx-auto mt-1 max-w-[16rem]">
							Cek tab Jadwal buat event yang masih jauh.
						</p>
					</div>
				) : (
					<ul className="space-y-3">
						{nextAssignments.map((a) => {
							const ev = Array.isArray(a.event) ? a.event[0] : a.event;
							if (!ev) return null;
							const isToday = ev.event_date === todayISO;
							const city =
								ev.venue_city && ev.venue_city !== ev.venue_name
									? ev.venue_city
									: null;
							const crew = crewByEvent.get(ev.id) ?? [];
							const sessions = parseSegments(ev.session_segments);
							const multiSesi = hasBreak(sessions);
							return (
								<li
									key={ev.id}
									className="overflow-hidden rounded-[16px] border border-border-default bg-card shadow-[var(--shadow-level-2)]"
									style={{
										viewTransitionName: `crew-event-${ev.project_id}`,
									}}
								>
									<Link
										href={`/crew/jadwal/${ev.project_id}`}
										className="press tap block p-3.5 transition-colors active:bg-surface-3"
									>
										<div className="flex items-center gap-3.5">
											<div className={cnTimeTone(isToday)} aria-hidden="true">
												<span className="text-[0.625rem] font-semibold uppercase tracking-wide">
													{isToday ? "Hari ini" : "Besok"}
												</span>
												<span className="type-num text-[1.35rem] leading-none">
													{ID_TIME(ev.start_time)}
												</span>
												<span className="text-[0.625rem] opacity-70">
													setup {ID_TIME(ev.setup_time)}
												</span>
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<span className="type-body-strong truncate">
														{ev.client_name}
													</span>
													<EventStatusBadge status={ev.status} />
													{multiSesi && sessions ? (
														<span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.625rem] font-semibold text-amber-700 dark:text-amber-300">
															{sessions.length} sesi
														</span>
													) : null}
												</div>
												<p className="type-secondary mt-1 flex items-center gap-1">
													<MapPin className="size-3.5 shrink-0" />
													<span className="truncate">
														{venueLabel(ev.venue_name)}
														{city ? ` · ${city}` : ""}
													</span>
												</p>
												<div className="mt-1.5 flex items-center justify-between gap-2">
													<span className="eyebrow">
														{ROLE_LABELS[a.role_in_event] ?? a.role_in_event}
													</span>
													{crew.length > 0 ? (
														<AvatarGroup people={crew} size="sm" max={4} />
													) : null}
												</div>
											</div>
											<ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/50" />
										</div>
									</Link>
									{/* Baris PIC SENGAJA di luar <Link>: anchor di dalam anchor
									    itu HTML ilegal — React melempar validateDOMNesting dan
									    tap ke nomor PIC bisa nyasar membuka detail event. */}
									{ev.pic_name || ev.pic_wa ? (
										<div className="flex items-center gap-1.5 border-t border-border-subtle px-3.5 py-2.5">
											<span className="type-caption font-medium text-amber-600 dark:text-amber-400">
												PIC
											</span>
											<span className="type-caption truncate text-foreground">
												{ev.pic_name ?? "—"}
											</span>
											{ev.pic_wa ? (
												<a
													href={waLink(ev.pic_wa) ?? undefined}
													target="_blank"
													rel="noopener noreferrer"
													className="type-caption tabular ml-auto inline-flex shrink-0 items-center gap-0.5 text-link hover:underline"
												>
													{ev.pic_wa}
													<ExternalLink className="size-2.5" />
												</a>
											) : (
												<span className="type-caption ml-auto shrink-0 text-muted-foreground">
													nomor menyusul
												</span>
											)}
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</Section>

			{/* Tawaran aktifkan push — sebelumnya cuma dipasang di halaman owner,
			    jadi tidak ada satu pun crew yang bisa berlangganan notifikasi. */}
			<PushPrompt
				vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
			/>
		</AppScreen>
	);
}

/** Time block tone — today uses the ink-tinted pill, tomorrow the neutral. */
function cnTimeTone(isToday: boolean): string {
	return [
		"flex w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2.5",
		isToday
			? "bg-primary/10 text-primary"
			: "bg-surface-3 text-muted-foreground",
	].join(" ");
}
