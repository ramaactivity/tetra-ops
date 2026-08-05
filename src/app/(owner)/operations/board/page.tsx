import { Plus } from "lucide-react";
import Link from "next/link";
import { PaymentStatusBadge } from "@/components/badges/status-badge";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { buttonVariants } from "@/components/ui/button";
import {
	CHANNEL_TYPE_LABELS,
	formatDateID,
	formatRupiah,
	venueLabel,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type EventRow = {
	id: string;
	project_id: string;
	status: string;
	channel: string;
	client_name: string;
	event_date: string;
	venue_name: string | null;
	venue_city: string | null;
	grand_total: number;
	payment_status: string;
};

type ColumnDef = {
	value: string;
	label: string;
	hint?: string;
	tone: string;
};

const COLUMNS: ColumnDef[] = [
	{
		value: "upcoming",
		label: "Upcoming",
		hint: "Belum hari-H",
		tone: "border-primary/40 bg-primary/5",
	},
	{
		value: "in_progress",
		label: "In Progress",
		hint: "Hari-H",
		tone: "border-amber-500/40 bg-amber-500/5",
	},
	{
		value: "awaiting_settlement",
		label: "Awaiting Settle",
		hint: "Tutup buku",
		tone: "border-amber-500/40 bg-amber-500/5",
	},
	{
		value: "completed",
		label: "Completed",
		hint: "Done",
		tone: "border-emerald-500/40 bg-emerald-500/5",
	},
];

const HOT_DAYS_THRESHOLD = 7;

function daysUntil(eventDate: string): number {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const ev = new Date(eventDate);
	ev.setHours(0, 0, 0, 0);
	const diff = ev.getTime() - today.getTime();
	return Math.round(diff / (1000 * 60 * 60 * 24));
}

export default async function OperationsBoardPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("events")
		.select(
			"id, project_id, status, channel, client_name, event_date, venue_name, venue_city, grand_total, payment_status",
		)
		.is("deleted_at", null)
		.in(
			"status",
			COLUMNS.map((c) => c.value),
		)
		.order("event_date", { ascending: true })
		.limit(300);

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
	const byStatus = new Map<string, EventRow[]>();
	for (const ev of events) {
		const arr = byStatus.get(ev.status) ?? [];
		arr.push(ev);
		byStatus.set(ev.status, arr);
	}

	return (
		<Container size="full" className="space-y-3">
			<SectionHeader
				title="Operations"
				description={`${events.length} event aktif (selain cancelled / archived). Scroll horizontal untuk lihat status lain.`}
				actions={
					<>
						<OperationsViewSwitcher current="board" />
						<Link
							href="/operations/new"
							className={buttonVariants({ variant: "default" })}
						>
							<Plus className="size-4" />
							New booking
						</Link>
					</>
				}
			/>

			<div className="overflow-x-auto pb-4">
				<div className="grid min-w-[1100px] grid-cols-6 gap-3">
					{COLUMNS.map((col) => {
						const items = byStatus.get(col.value) ?? [];
						return (
							<section
								key={col.value}
								className={`flex h-full flex-col rounded-xl border ${col.tone}`}
								aria-label={col.label}
							>
								<header className="border-b border-border-default/60 px-3 py-3">
									<div className="flex items-baseline justify-between">
										<h3 className="text-sm font-semibold">{col.label}</h3>
										<span className="bg-background/70 text-foreground tabular rounded-full border border-border-default px-2 py-0.5 text-[10px] font-medium">
											{items.length}
										</span>
									</div>
									{col.hint && (
										<p className="text-muted-foreground text-[10px] uppercase tracking-wider">
											{col.hint}
										</p>
									)}
								</header>
								<div className="flex-1 space-y-2 overflow-y-auto p-2">
									{items.length === 0 ? (
										<p className="text-muted-foreground/60 px-2 py-6 text-center text-xs italic">
											—
										</p>
									) : (
										items.map((ev) => <BoardCard key={ev.id} event={ev} />)
									)}
								</div>
							</section>
						);
					})}
				</div>
			</div>
		</Container>
	);
}

function BoardCard({ event }: { event: EventRow }) {
	const days = daysUntil(event.event_date);
	const isPast = days < 0;
	const isHot =
		!isPast && days <= HOT_DAYS_THRESHOLD && event.status === "upcoming";

	let dayLabel: string;
	if (days === 0) dayLabel = "Hari ini";
	else if (days === 1) dayLabel = "Besok";
	else if (days > 0) dayLabel = `H-${days}`;
	else dayLabel = `${Math.abs(days)} hari lalu`;

	return (
		<Link
			href={`/operations/${event.project_id}`}
			className="border-border-default bg-surface-2 hover:border-primary/40 hover:bg-surface-2/80 block space-y-2 rounded-lg border p-2.5 text-left transition-colors"
		>
			<div className="space-y-0.5">
				<div className="flex items-baseline justify-between gap-2">
					<p className="text-sm font-semibold leading-tight">
						{event.client_name}
					</p>
					{isHot && (
						<span className="bg-rose-500/15 text-rose-600 dark:text-rose-300 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
							🔥 hot
						</span>
					)}
				</div>
				<p className="text-muted-foreground tabular text-[10px]">
					{event.project_id}
				</p>
			</div>

			<div className="space-y-0.5 text-xs">
				<p className="tabular text-foreground">
					{formatDateID(event.event_date)}{" "}
					<span
						className={`text-muted-foreground ml-0.5 ${isPast ? "italic" : ""}`}
					>
						· {dayLabel}
					</span>
				</p>
				<p className="text-muted-foreground truncate">
					{venueLabel(event.venue_name)}
					{event.venue_city ? ` · ${event.venue_city}` : ""}
				</p>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
				<span className="text-muted-foreground text-[10px]">
					{CHANNEL_TYPE_LABELS[event.channel] ?? event.channel}
				</span>
				<PaymentStatusBadge status={event.payment_status} />
			</div>

			<p className="tabular text-foreground border-t border-border-default/60 pt-1.5 text-xs font-semibold">
				{event.grand_total ? formatRupiah(event.grand_total) : "—"}
			</p>
		</Link>
	);
}
