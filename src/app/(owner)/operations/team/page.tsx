import {
	AlertTriangle,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	UsersRound,
} from "lucide-react";
import Link from "next/link";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { createClient } from "@/lib/supabase/server";

const HORIZON_DAYS = 14; // 2 weeks rolling window
const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const ID_DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
	const copy = new Date(d);
	copy.setDate(copy.getDate() + n);
	return copy;
}

type CrewRow = {
	id: string;
	full_name: string;
	nickname: string | null;
	tier: "senior" | "junior" | null;
	phone_wa: string | null;
};

type AssignmentJoin = {
	user_id: string;
	role_in_event: string;
	event:
		| { id: string; project_id: string; client_name: string; event_date: string; venue_name: string }
		| Array<{
				id: string;
				project_id: string;
				client_name: string;
				event_date: string;
				venue_name: string;
		  }>
		| null;
};

type CellAssignment = {
	project_id: string;
	client_name: string;
	venue_name: string;
	role_in_event: string;
};

export default async function CrewScheduleView({
	searchParams,
}: {
	searchParams: Promise<{ start?: string }>;
}) {
	const params = await searchParams;
	const startInput = params.start;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	let windowStart: Date;
	if (startInput && /^\d{4}-\d{2}-\d{2}$/.test(startInput)) {
		windowStart = new Date(`${startInput}T00:00:00`);
		windowStart.setHours(0, 0, 0, 0);
	} else {
		windowStart = today;
	}
	const windowEnd = addDays(windowStart, HORIZON_DAYS - 1);
	const startISO = isoDate(windowStart);
	const endISO = isoDate(windowEnd);

	const supabase = await createClient();
	const [{ data: crewData, error: crewErr }, { data: assignmentData }] =
		await Promise.all([
			supabase
				.from("users")
				.select("id, full_name, nickname, tier, phone_wa")
				.eq("role", "crew")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("tier", { ascending: true })
				.order("full_name", { ascending: true }),
			supabase
				.from("crew_assignments")
				.select(
					`user_id, role_in_event,
					event:events!inner(id, project_id, client_name, event_date, venue_name)`,
				)
				.gte("event.event_date", startISO)
				.lte("event.event_date", endISO),
		]);

	if (crewErr) {
		return (
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm">{crewErr.message}</p>
				</div>
			</div>
		);
	}

	const crew = (crewData ?? []) as CrewRow[];
	const assignments = ((assignmentData ?? []) as AssignmentJoin[]).filter(
		(a) => a.event,
	);

	// Build map<crewId, map<dateISO, assignments[]>>
	const cellMap = new Map<string, Map<string, CellAssignment[]>>();
	for (const a of assignments) {
		const ev = Array.isArray(a.event) ? a.event[0] : a.event;
		if (!ev) continue;
		const date = ev.event_date;
		const userMap =
			cellMap.get(a.user_id) ??
			(() => {
				const m = new Map<string, CellAssignment[]>();
				cellMap.set(a.user_id, m);
				return m;
			})();
		const list = userMap.get(date) ?? [];
		list.push({
			project_id: ev.project_id,
			client_name: ev.client_name,
			venue_name: ev.venue_name,
			role_in_event: a.role_in_event,
		});
		userMap.set(date, list);
	}

	// Aggregate stats per crew
	const eventsCountByCrew = new Map<string, number>();
	const conflictsByCrew = new Map<string, number>();
	for (const [userId, dateMap] of cellMap.entries()) {
		let total = 0;
		let conflicts = 0;
		for (const [, list] of dateMap.entries()) {
			total += list.length;
			if (list.length > 1) conflicts += 1;
		}
		eventsCountByCrew.set(userId, total);
		conflictsByCrew.set(userId, conflicts);
	}

	const days = Array.from({ length: HORIZON_DAYS }, (_, i) =>
		addDays(windowStart, i),
	);

	const prevStart = isoDate(addDays(windowStart, -HORIZON_DAYS));
	const nextStart = isoDate(addDays(windowStart, HORIZON_DAYS));
	const todayStart = isoDate(today);

	return (
		<div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 md:px-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-fluid-h1 font-semibold tracking-tight">Operations</h1>
					<p className="text-muted-foreground text-sm">
						Crew schedule {HORIZON_DAYS} hari ke depan. Cell merah = bentrok
						(2+ event di tanggal sama).
					</p>
				</div>
				<OperationsViewSwitcher current="team" />
			</div>

			{/* Window navigation */}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="text-muted-foreground tabular text-xs">
					{ID_DAY_NAMES[windowStart.getDay()]}, {windowStart.getDate()}{" "}
					{windowStart.toLocaleDateString("id-ID", { month: "short" })} —{" "}
					{ID_DAY_NAMES[windowEnd.getDay()]}, {windowEnd.getDate()}{" "}
					{windowEnd.toLocaleDateString("id-ID", { month: "short" })}
				</div>
				<div className="flex items-center gap-1">
					<NavLink href={`/operations/team?start=${prevStart}`} dir="prev">
						<ChevronLeft className="h-4 w-4" />
					</NavLink>
					<Link
						href="/operations/team"
						className="border-border-default bg-surface-2 hover:bg-muted text-foreground inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium"
					>
						<CalendarDays className="h-3.5 w-3.5" />
						Today
					</Link>
					<NavLink href={`/operations/team?start=${nextStart}`} dir="next">
						<ChevronRight className="h-4 w-4" />
					</NavLink>
				</div>
			</div>

			{crew.length === 0 ? (
				<div className="border-border-default bg-surface-2 flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<UsersRound className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">Belum ada crew</h3>
						<p className="text-muted-foreground text-sm">
							Tambah crew dulu via <Link href="/settings/crew" className="text-primary hover:underline">/settings/crew</Link>.
						</p>
					</div>
				</div>
			) : (
				<div className="border-border-default bg-surface-2 overflow-x-auto rounded-xl border">
					<table className="w-full text-xs">
						<thead className="bg-muted/40 sticky top-0">
							<tr>
								<th
									scope="col"
									className="text-muted-foreground sticky left-0 z-10 min-w-[180px] bg-muted/40 px-3 py-2.5 text-left font-medium uppercase tracking-wider"
								>
									Crew
								</th>
								{days.map((d) => {
									const dateISO = isoDate(d);
									const isToday = dateISO === todayStart;
									const isWeekend = d.getDay() === 0 || d.getDay() === 6;
									return (
										<th
											key={dateISO}
											scope="col"
											className={`tabular px-2 py-2.5 text-center font-medium ${
												isToday
													? "bg-primary/10 text-primary"
													: isWeekend
														? "text-muted-foreground/60"
														: "text-muted-foreground"
											}`}
										>
											<div className="text-[9px] uppercase">
												{ID_DAY_NAMES[d.getDay()]}
											</div>
											<div className="text-foreground text-sm font-semibold">
												{d.getDate()}
											</div>
										</th>
									);
								})}
								<th className="text-muted-foreground px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider">
									Total
								</th>
							</tr>
						</thead>
						<tbody className="divide-border divide-y">
							{crew.map((c) => {
								const dateMap = cellMap.get(c.id);
								const total = eventsCountByCrew.get(c.id) ?? 0;
								const conflicts = conflictsByCrew.get(c.id) ?? 0;
								return (
									<tr key={c.id} className="hover:bg-muted/20">
										<td className="bg-surface-2 sticky left-0 z-[5] px-3 py-2">
											<div className="flex items-center gap-2">
												<div className="bg-muted text-muted-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
													{(c.nickname ?? c.full_name)
														.split(/\s+/)
														.slice(0, 2)
														.map((p) => p[0])
														.join("")
														.toUpperCase()}
												</div>
												<div className="min-w-0 flex-1">
													<div className="text-foreground truncate text-sm font-medium leading-tight">
														{c.full_name}
													</div>
													<div className="text-muted-foreground flex items-center gap-1 text-[10px]">
														{c.tier && (
															<span className="uppercase tracking-wider">
																{c.tier}
															</span>
														)}
														{c.phone_wa && (
															<>
																<span>·</span>
																<a
																	href={`https://wa.me/${c.phone_wa.replace(/^\+|^0/, "62")}`}
																	target="_blank"
																	rel="noopener noreferrer"
																	className="text-primary hover:underline tabular inline-flex items-center gap-0.5"
																>
																	WA
																	<ExternalLink className="h-2 w-2" />
																</a>
															</>
														)}
													</div>
												</div>
											</div>
										</td>
										{days.map((d) => {
											const dateISO = isoDate(d);
											const list = dateMap?.get(dateISO) ?? [];
											const isToday = dateISO === todayStart;
											const isWeekend = d.getDay() === 0 || d.getDay() === 6;
											const hasConflict = list.length > 1;
											return (
												<td
													key={dateISO}
													className={`px-1.5 py-1.5 text-center align-top ${
														isToday
															? "bg-primary/5"
															: isWeekend
																? "bg-muted/10"
																: ""
													}`}
												>
													{list.length === 0 ? (
														<span className="text-muted-foreground/30 text-[10px]">
															·
														</span>
													) : (
														<div className="space-y-0.5">
															{list.map((a, i) => (
																<Link
																	key={`${a.project_id}-${i}`}
																	href={`/operations/${a.project_id}`}
																	title={`${a.client_name} · ${a.venue_name} · ${ROLE_LABELS[a.role_in_event] ?? a.role_in_event}`}
																	className={`block rounded px-1 py-0.5 text-[10px] font-medium leading-tight transition-colors ${
																		hasConflict
																			? "bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25"
																			: a.role_in_event === "lead"
																				? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25"
																				: "bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25"
																	}`}
																>
																	<span className="block truncate">
																		{a.client_name.split(/\s+/)[0]}
																	</span>
																</Link>
															))}
															{hasConflict && (
																<div
																	className="text-rose-600 dark:text-rose-400 inline-flex items-center text-[9px]"
																	title="Bentrok"
																>
																	<AlertTriangle className="h-2.5 w-2.5" />
																</div>
															)}
														</div>
													)}
												</td>
											);
										})}
										<td className="px-3 py-2 text-right">
											<div className="flex items-center justify-end gap-2">
												{conflicts > 0 && (
													<span
														className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5 text-[10px] font-medium"
														title={`${conflicts} hari bentrok`}
													>
														<AlertTriangle className="h-3 w-3" />
														{conflicts}
													</span>
												)}
												<span className="text-foreground tabular text-sm font-semibold">
													{total}
												</span>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<div className="text-muted-foreground flex flex-wrap items-center gap-3 text-[11px]">
				<span className="inline-flex items-center gap-1">
					<span className="bg-emerald-500/15 inline-block h-2.5 w-2.5 rounded" />
					Lead
				</span>
				<span className="inline-flex items-center gap-1">
					<span className="bg-sky-500/15 inline-block h-2.5 w-2.5 rounded" />
					Asisten
				</span>
				<span className="inline-flex items-center gap-1">
					<span className="bg-rose-500/15 inline-block h-2.5 w-2.5 rounded" />
					Bentrok
				</span>
			</div>
		</div>
	);
}

function NavLink({
	href,
	dir,
	children,
}: {
	href: string;
	dir: "prev" | "next";
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			aria-label={dir === "prev" ? "Previous window" : "Next window"}
			className="border-border-default bg-surface-2 hover:bg-muted text-muted-foreground hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-md border"
		>
			{children}
		</Link>
	);
}
