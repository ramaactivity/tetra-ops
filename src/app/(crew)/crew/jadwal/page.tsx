import {
	CalendarDays,
	CalendarPlus,
	ChevronRight,
	Clock,
	Frame,
	History,
	Image as ImageIcon,
	MapPin,
} from "lucide-react";
import Link from "next/link";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { NeedsRekapSection } from "@/components/rekap/needs-rekap-section";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { FRAME_SIZE_LABELS, formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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
	// TBC fields — null = "menyusul / belum ditentukan"
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
			<div className="mx-auto w-full max-w-md px-4 py-6">
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm">{error.message}</p>
				</div>
			</div>
		);
	}

	const assignments = ((data ?? []) as AssignmentRow[]).filter((a) => a.event);

	// Sort: upcoming asc by date+time, past desc
	assignments.sort((a, b) => {
		const ea = Array.isArray(a.event) ? a.event[0] : a.event;
		const eb = Array.isArray(b.event) ? b.event[0] : b.event;
		if (!ea || !eb) return 0;
		const dCompare = ea.event_date.localeCompare(eb.event_date);
		if (dCompare !== 0) return tab === "upcoming" ? dCompare : -dCompare;
		return (ea.start_time ?? "").localeCompare(eb.start_time ?? "");
	});

	return (
		<div className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
			<header>
				<h1 className="text-fluid-h1 font-semibold tracking-tight">Jadwal</h1>
				<p className="text-muted-foreground text-sm">
					Event yang lo di-assign sebagai crew.
				</p>
			</header>

			<NeedsRekapSection userId={me.profile.id} />

			<div className="border-border-default flex gap-1 border-b">
				<TabLink
					href="/crew/jadwal"
					label="Upcoming"
					icon={CalendarDays}
					active={tab === "upcoming"}
				/>
				<TabLink
					href="/crew/jadwal?tab=past"
					label="Past"
					icon={History}
					active={tab === "past"}
				/>
			</div>

			{assignments.length === 0 ? (
				<EmptyState
					icon={CalendarPlus}
					title={
						tab === "upcoming"
							? "Belum ada event upcoming"
							: "Belum ada event past"
					}
					description={
						tab === "upcoming"
							? "Tunggu di-assign owner. Notif WA bakal masuk pas lo dapat schedule baru."
							: "Riwayat event yang udah selesai bakal muncul di sini."
					}
				/>
			) : (
				<div className="space-y-2">
					{assignments.map((a, i) => {
						const ev = Array.isArray(a.event) ? a.event[0] : a.event;
						if (!ev) return null;
						const backdrop = Array.isArray(ev.backdrop)
							? ev.backdrop[0]
							: ev.backdrop;
						const tbcStart = !ev.start_time;
						const tbcFrame = !ev.frame_size;
						const tbcBackdrop = !ev.backdrop_id;
						const hasAnyTbc = tbcStart || tbcFrame || tbcBackdrop;
						return (
							<Link
								key={`${ev.id}-${i}`}
								href={`/crew/jadwal/${ev.project_id}`}
								className="press-down flex items-stretch gap-3 rounded-xl border border-border-default bg-card p-3 transition-colors hover:bg-surface-3"
								style={{
									viewTransitionName: `crew-event-${ev.project_id}`,
								}}
							>
								<div className="flex w-16 shrink-0 flex-col items-center justify-center">
									<span className="text-muted-foreground text-[10px] font-medium uppercase">
										{formatDateID(ev.event_date)
											.split(" ")
											.slice(0, 2)
											.join(" ")}
									</span>
									<span
										className={`tabular text-base font-semibold ${
											tbcStart
												? "text-amber-600 dark:text-amber-400"
												: "text-foreground"
										}`}
									>
										{tbcStart ? "TBC" : ID_TIME(ev.start_time)}
									</span>
								</div>
								<div className="min-w-0 flex-1 space-y-1">
									<div className="flex flex-wrap items-baseline gap-1.5">
										<span className="truncate text-sm font-medium">
											{ev.client_name}
										</span>
										<EventStatusBadge status={ev.status} />
									</div>
									<p className="text-muted-foreground flex items-center gap-1 text-xs">
										<MapPin className="h-3 w-3 shrink-0" />
										<span className="truncate">
											{ev.venue_name}
											{ev.venue_city && ` · ${ev.venue_city}`}
										</span>
									</p>
									{hasAnyTbc && (
										<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
											{tbcStart && (
												<TbcBadge icon={Clock} label="Jam menyusul" />
											)}
											{tbcFrame && (
												<TbcBadge icon={Frame} label="Frame menyusul" />
											)}
											{tbcBackdrop && (
												<TbcBadge icon={ImageIcon} label="Backdrop menyusul" />
											)}
										</div>
									)}
									<div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
										<span className="text-[10px] uppercase tracking-wider">
											{ROLE_LABELS[a.role_in_event] ?? a.role_in_event}
										</span>
										{!tbcFrame && ev.frame_size && (
											<span className="text-[10px]">
												frame{" "}
												{FRAME_SIZE_LABELS[ev.frame_size] ?? ev.frame_size}
											</span>
										)}
										{!tbcBackdrop && backdrop?.name && (
											<span className="truncate text-[10px]">
												bg {backdrop.name}
											</span>
										)}
									</div>
								</div>
								<ChevronRight className="text-muted-foreground/60 h-4 w-4 self-center" />
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}

function TbcBadge({
	icon: Icon,
	label,
}: {
	icon: typeof CalendarDays;
	label: string;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-200">
			<Icon className="h-3 w-3" />
			{label}
		</span>
	);
}

function TabLink({
	href,
	label,
	icon: Icon,
	active,
}: {
	href: string;
	label: string;
	icon: typeof CalendarDays;
	active: boolean;
}) {
	return (
		<Link
			href={href}
			className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
				active
					? "text-foreground"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			<Icon className="h-4 w-4" />
			{label}
			{active && (
				<span className="bg-primary absolute inset-x-0 bottom-0 h-0.5" />
			)}
		</Link>
	);
}
