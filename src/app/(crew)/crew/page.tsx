import {
	CalendarClock,
	ChevronRight,
	ExternalLink,
	MapPin,
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { NeedsRekapSection } from "@/components/rekap/needs-rekap-section";
import {
	AppHeader,
	AppScreen,
	Section,
	StatTile,
} from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const ID_DATE_FULL = new Intl.DateTimeFormat("id-ID", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
});
const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type EventLite = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	venue_name: string;
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
	const todayISO = isoDate(today);
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);
	const tomorrowISO = isoDate(tomorrow);
	const sevenFromNow = new Date(today);
	sevenFromNow.setDate(today.getDate() + 7);
	const sevenFromNowISO = isoDate(sevenFromNow);

	const supabase = await createClient();

	const [{ data: nextAssignmentsData }, { data: weekAssignments }] =
		await Promise.all([
			supabase
				.from("crew_assignments")
				.select(
					`role_in_event,
				event:events!inner(
					id, project_id, status, client_name, event_date,
					setup_time, start_time, end_time,
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
				.gte("event.event_date", todayISO)
				.lte("event.event_date", sevenFromNowISO),
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

	const upcomingCount = ((weekAssignments ?? []) as unknown[]).length;
	const todayCount = nextAssignments.filter((a) => {
		const ev = Array.isArray(a.event) ? a.event[0] : a.event;
		return ev?.event_date === todayISO;
	}).length;

	const firstName = me.profile.full_name.split(" ")[0];

	return (
		<AppScreen>
			<AppHeader
				title={`Halo, ${firstName}`}
				subtitle={ID_DATE_FULL.format(today)}
			/>

			<NeedsRekapSection userId={me.profile.id} />

			<Section title="Ringkasan">
				<div className="grid grid-cols-2 gap-3">
					<StatTile
						label="Hari ini"
						value={todayCount}
						hint={todayCount === 0 ? "Tidak ada event" : "event terjadwal"}
						tone={todayCount > 0 ? "default" : "default"}
					/>
					<StatTile
						label="7 hari"
						value={upcomingCount}
						hint="event mendatang"
					/>
				</div>
				<Link
					href="/crew/jadwal"
					className="press tap mt-3 flex items-center justify-between gap-2 rounded-[1.25rem] border border-border-default bg-card px-4 py-3.5 shadow-[var(--shadow-level-2)] transition-colors active:bg-surface-3"
				>
					<span className="type-body-strong">Lihat semua jadwal</span>
					<ChevronRight className="size-4 text-muted-foreground/60" />
				</Link>
			</Section>

			<Section title="Hari ini & besok">
				{nextAssignments.length === 0 ? (
					<div className="rounded-[1.25rem] border border-dashed border-border-default bg-card/40 px-5 py-9 text-center">
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
												</div>
												<p className="type-secondary mt-1 flex items-center gap-1">
													<MapPin className="size-3.5 shrink-0" />
													<span className="truncate">
														{ev.venue_name}
														{city ? ` · ${city}` : ""}
													</span>
												</p>
												<span className="eyebrow mt-1.5 inline-block">
													{ROLE_LABELS[a.role_in_event] ?? a.role_in_event}
												</span>
											</div>
											<ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/50" />
										</div>
										{ev.pic_name && ev.pic_wa ? (
											<div className="mt-3 flex items-center gap-1.5 border-t border-border-subtle pt-2.5">
												<span className="type-caption font-medium text-amber-600 dark:text-amber-400">
													PIC
												</span>
												<span className="type-caption text-foreground">
													{ev.pic_name}
												</span>
												<a
													href={`https://wa.me/${ev.pic_wa.replace(/^\+|^0/, "62")}`}
													target="_blank"
													rel="noopener noreferrer"
													className="type-caption tabular ml-auto inline-flex items-center gap-0.5 text-link hover:underline"
												>
													{ev.pic_wa}
													<ExternalLink className="size-2.5" />
												</a>
											</div>
										) : null}
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

/** Time block tone — today uses the ink-tinted pill, tomorrow the neutral. */
function cnTimeTone(isToday: boolean): string {
	return [
		"flex w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2.5",
		isToday
			? "bg-primary/10 text-primary"
			: "bg-surface-3 text-muted-foreground",
	].join(" ");
}
