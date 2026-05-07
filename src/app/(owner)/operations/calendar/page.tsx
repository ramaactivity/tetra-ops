import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type EventRow = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	event_date: string;
	start_time: string | null;
	venue_name: string;
};

const STATUS_TONE: Record<string, string> = {
	draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
	confirmed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
	design_brief: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
	design_approved: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
	upcoming: "bg-primary/15 text-primary",
	in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	awaiting_settlement: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

function ymdLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function startOfMonthGrid(year: number, monthIndex: number): Date {
	// Monday-first grid (Indonesian convention)
	const first = new Date(year, monthIndex, 1);
	const dow = first.getDay(); // 0 Sun .. 6 Sat
	const daysFromMonday = dow === 0 ? 6 : dow - 1;
	const start = new Date(year, monthIndex, 1 - daysFromMonday);
	return start;
}

function parseMonthParam(m: string | undefined): {
	year: number;
	month: number; // 1-12
} {
	const today = new Date();
	if (m && /^\d{4}-\d{2}$/.test(m)) {
		const [y, mo] = m.split("-").map(Number);
		if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) {
			return { year: y, month: mo };
		}
	}
	return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function monthLabelID(year: number, monthIndex: number): string {
	return new Date(year, monthIndex, 1).toLocaleDateString("id-ID", {
		month: "long",
		year: "numeric",
	});
}

const DAY_HEADERS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export default async function OperationsCalendarPage({
	searchParams,
}: {
	searchParams: Promise<{ month?: string }>;
}) {
	const params = await searchParams;
	const { year, month } = parseMonthParam(params.month);
	const monthIndex = month - 1;

	const gridStart = startOfMonthGrid(year, monthIndex);
	const gridDays: Date[] = [];
	for (let i = 0; i < 42; i++) {
		const d = new Date(gridStart);
		d.setDate(gridStart.getDate() + i);
		gridDays.push(d);
	}
	const rangeStart = ymdLocal(gridDays[0]);
	const rangeEnd = ymdLocal(gridDays[gridDays.length - 1]);

	const supabase = await createClient();
	const { data, error } = await supabase
		.from("events")
		.select(
			"id, project_id, status, client_name, event_date, start_time, venue_name",
		)
		.is("deleted_at", null)
		.gte("event_date", rangeStart)
		.lte("event_date", rangeEnd)
		.order("event_date", { ascending: true })
		.order("start_time", { ascending: true });

	if (error) {
		return (
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat events: {error.message}
					</p>
				</div>
			</div>
		);
	}

	const events = (data ?? []) as EventRow[];
	const eventsByDate = new Map<string, EventRow[]>();
	for (const ev of events) {
		const arr = eventsByDate.get(ev.event_date) ?? [];
		arr.push(ev);
		eventsByDate.set(ev.event_date, arr);
	}

	const today = new Date();
	const todayKey = ymdLocal(today);

	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear = month === 1 ? year - 1 : year;
	const nextMonth = month === 12 ? 1 : month + 1;
	const nextYear = month === 12 ? year + 1 : year;
	const fmt = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
					<p className="text-muted-foreground text-sm">
						{events.length} event di window kalender · klik kartu untuk detail.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<OperationsViewSwitcher current="calendar" />
					<Link
						href="/operations/new"
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium"
					>
						<Plus className="h-4 w-4" />
						New booking
					</Link>
				</div>
			</div>

			<div className="border-border bg-surface-2 flex items-center justify-between gap-3 rounded-lg border p-3">
				<div className="flex items-center gap-1">
					<Link
						href={`/operations/calendar?month=${fmt(prevYear, prevMonth)}`}
						aria-label="Previous month"
						className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
					>
						<ChevronLeft className="h-4 w-4" />
					</Link>
					<Link
						href={`/operations/calendar?month=${fmt(nextYear, nextMonth)}`}
						aria-label="Next month"
						className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
					>
						<ChevronRight className="h-4 w-4" />
					</Link>
					<Link
						href="/operations/calendar"
						className="text-muted-foreground hover:text-foreground ml-1 text-xs underline-offset-2 hover:underline"
					>
						Hari ini
					</Link>
				</div>
				<h2 className="text-base font-semibold capitalize">
					{monthLabelID(year, monthIndex)}
				</h2>
				<div className="hidden gap-3 sm:flex">
					<LegendDot tone="bg-sky-500" label="Confirmed" />
					<LegendDot tone="bg-primary" label="Upcoming" />
					<LegendDot tone="bg-amber-500" label="In Progress" />
					<LegendDot tone="bg-emerald-500" label="Done" />
				</div>
			</div>

			<div className="border-border bg-surface-2 overflow-hidden rounded-lg border">
				<div className="grid grid-cols-7 border-b border-border">
					{DAY_HEADERS.map((d) => (
						<div
							key={d}
							className="text-muted-foreground bg-muted/30 border-r border-border px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider last:border-r-0"
						>
							{d}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7">
					{gridDays.map((d, idx) => {
						const key = ymdLocal(d);
						const list = eventsByDate.get(key) ?? [];
						const inMonth = d.getMonth() === monthIndex;
						const isToday = key === todayKey;
						const isWeekendCol = idx % 7 === 5 || idx % 7 === 6;
						const visible = list.slice(0, 3);
						const overflow = Math.max(0, list.length - visible.length);
						return (
							<div
								key={key}
								className={cn(
									"border-b border-r border-border p-2 transition-colors last-of-type:border-r-0 [&:nth-child(7n)]:border-r-0",
									"min-h-[110px] sm:min-h-[120px]",
									!inMonth && "bg-muted/20",
									isWeekendCol && inMonth && "bg-muted/10",
								)}
							>
								<div className="flex items-baseline justify-between">
									<span
										className={cn(
											"text-xs",
											inMonth ? "text-foreground" : "text-muted-foreground/50",
											isToday &&
												"bg-primary text-primary-foreground inline-flex h-5 w-5 items-center justify-center rounded-full font-semibold tabular",
										)}
									>
										{d.getDate()}
									</span>
									{list.length > 0 && (
										<span className="text-muted-foreground/70 tabular text-[10px]">
											{list.length}
										</span>
									)}
								</div>
								<div className="mt-1 space-y-0.5">
									{visible.map((ev) => (
										<Link
											key={ev.id}
											href={`/operations/${ev.project_id}`}
											className={cn(
												"block truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80",
												STATUS_TONE[ev.status] ??
													"bg-muted text-muted-foreground",
											)}
											title={`${ev.client_name} · ${ev.venue_name}`}
										>
											{ev.start_time && (
												<span className="tabular mr-1 opacity-70">
													{ev.start_time.slice(0, 5)}
												</span>
											)}
											{ev.client_name}
										</Link>
									))}
									{overflow > 0 && (
										<span className="text-muted-foreground inline-block px-1.5 py-0.5 text-[10px] font-medium">
											+{overflow} lainnya
										</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
	return (
		<span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
			<span className={`${tone} h-2 w-2 rounded-full`} />
			{label}
		</span>
	);
}
