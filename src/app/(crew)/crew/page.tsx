import {
	CalendarClock,
	CalendarDays,
	ChevronRight,
	ExternalLink,
	MapPin,
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { NeedsRekapSection } from "@/components/rekap/needs-rekap-section";
import { EmptyState } from "@/components/ui/empty-state";
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

type Assignment = {
	role_in_event: string;
	event:
		| {
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
		  }
		| Array<{
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
		  }>
		| null;
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

	// Sort by event_date asc, then start_time asc
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
		<div className="mx-auto w-full max-w-md space-y-6 px-4 py-6">
			<header className="space-y-1">
				<h1 className="text-fluid-h1 font-semibold tracking-tight">
					Halo, {firstName}
				</h1>
				<p className="text-muted-foreground text-sm">
					{ID_DATE_FULL.format(today)}
				</p>
			</header>

			<NeedsRekapSection userId={me.profile.id} />

			<dl className="grid grid-cols-2 gap-3">
				<StatCard
					icon={CalendarClock}
					label="Hari ini"
					value={todayCount.toString()}
					hint={todayCount === 0 ? "Tidak ada event" : "event jadwal lo"}
					tone="primary"
				/>
				<StatCard
					icon={CalendarDays}
					label="7 hari ke depan"
					value={(upcomingCount ?? 0).toString()}
					hint="event upcoming"
					tone="emerald"
				/>
				<StatCard
					icon={CalendarDays}
					label="Semua jadwal"
					value=""
					hint="Lihat list lengkap"
					tone="muted"
					href="/crew/jadwal"
				/>
			</dl>

			<section className="space-y-2">
				<h2 className="text-fluid-h3 font-semibold tracking-tight">
					Hari ini & Besok
				</h2>
				{nextAssignments.length === 0 ? (
					<EmptyState
						size="sm"
						icon={CalendarClock}
						title="Free time hari ini & besok"
						description="Cek tab Jadwal kalau mau lihat event yang masih jauh."
					/>
				) : (
					<div className="space-y-2">
						{nextAssignments.map((a) => {
							const ev = Array.isArray(a.event) ? a.event[0] : a.event;
							if (!ev) return null;
							const isToday = ev.event_date === todayISO;
							return (
								<Link
									key={ev.id}
									href={`/crew/jadwal/${ev.project_id}`}
									className="press-down flex items-stretch gap-3 rounded-lg border border-border-default bg-card p-3 transition-colors hover:bg-surface-3"
									style={{
										viewTransitionName: `crew-event-${ev.project_id}`,
									}}
								>
									<div className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5">
										<span
											className={`text-[10px] font-medium uppercase tracking-wider ${
												isToday ? "text-primary" : "text-muted-foreground"
											}`}
										>
											{isToday ? "Hari ini" : "Besok"}
										</span>
										<span className="tabular text-foreground text-lg font-semibold leading-none">
											{ID_TIME(ev.start_time)}
										</span>
										<span className="text-muted-foreground text-[10px]">
											setup {ID_TIME(ev.setup_time)}
										</span>
									</div>
									<div className="min-w-0 flex-1 space-y-1.5">
										<div className="flex flex-wrap items-baseline gap-2">
											<span className="truncate text-sm font-medium">
												{ev.client_name}
											</span>
											<EventStatusBadge status={ev.status} />
											<span className="text-muted-foreground text-[10px] uppercase tracking-wider">
												{ROLE_LABELS[a.role_in_event] ?? a.role_in_event}
											</span>
										</div>
										<p className="text-muted-foreground flex items-center gap-1 text-xs">
											<MapPin className="h-3 w-3 shrink-0" />
											<span className="truncate">
												{ev.venue_name}
												{ev.venue_city && ` · ${ev.venue_city}`}
											</span>
										</p>
										{ev.pic_name && ev.pic_wa && (
											<p className="text-muted-foreground tabular flex items-center gap-1 text-xs">
												<span className="text-amber-700 dark:text-amber-400 font-medium">
													PIC:
												</span>
												<span>{ev.pic_name}</span>
												<a
													href={`https://wa.me/${ev.pic_wa.replace(/^\+|^0/, "62")}`}
													target="_blank"
													rel="noopener noreferrer"
													onClick={(e) => e.stopPropagation()}
													className="text-primary inline-flex items-center gap-0.5 hover:underline"
												>
													{ev.pic_wa}
													<ExternalLink className="h-2.5 w-2.5" />
												</a>
											</p>
										)}
									</div>
									<ChevronRight className="text-muted-foreground/60 h-4 w-4 self-center" />
								</Link>
							);
						})}
					</div>
				)}
			</section>
		</div>
	);
}

function StatCard({
	icon: Icon,
	label,
	value,
	hint,
	tone,
	href,
}: {
	icon: typeof CalendarClock;
	label: string;
	value: string;
	hint: string;
	tone: "primary" | "emerald" | "amber" | "muted";
	href?: string;
}) {
	const valueCls =
		tone === "primary"
			? "text-primary"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: tone === "amber"
					? "text-amber-600 dark:text-amber-400"
					: "text-foreground";

	const inner = (
		<>
			<div className="flex items-center justify-between">
				<dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
					{label}
				</dt>
				<Icon className="text-muted-foreground/60 h-3.5 w-3.5" />
			</div>
			<dd
				className={`tabular truncate text-xl font-semibold leading-tight ${valueCls}`}
			>
				{value || "→"}
			</dd>
			<p className="text-muted-foreground text-[10px]">{hint}</p>
		</>
	);

	if (href) {
		return (
			<Link
				href={href}
				className="border-border-default bg-surface-2 hover:border-foreground/20 space-y-1 rounded-lg border p-3 transition-colors active:scale-[0.99]"
			>
				{inner}
			</Link>
		);
	}
	return (
		<div className="border-border-default bg-surface-2 space-y-1 rounded-lg border p-3">
			{inner}
		</div>
	);
}
