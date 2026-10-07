import { Plus } from "lucide-react";
import Link from "next/link";
import { PaymentStatusBadge } from "@/components/badges/status-badge";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { AutoRefresh } from "@/components/portal/auto-refresh";
import { buttonVariants } from "@/components/ui/button";
import { shiftISODate, todayWIB } from "@/lib/dates";
import { unitCountOf } from "@/lib/events/spots";
import {
	CHANNEL_TYPE_LABELS,
	formatDateID,
	formatRupiah,
	venueLabel,
} from "@/lib/format";
import { PRODUCT_LABELS } from "@/lib/portal/core";
import {
	eventStage,
	leadExpiringSoon,
	type PipelineStage,
	STAGE_TITLE,
} from "@/lib/portal/pipeline";
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
	unit_count: number | null;
	design_status: string | null;
};

type ColumnDef = {
	value: PipelineStage;
	hint: string;
	tone: string;
};

// Papan pipeline (ruang lingkup booking portal): lead → DP → desain → siap →
// hari H → selesai. Event resmi dari semua jalur; lead & DP dari portal klien
// dan Booking Masuk (bot WA).
const COLUMNS: ColumnDef[] = [
	{
		value: "lead",
		hint: "Draf portal",
		tone: "border-border-default bg-secondary/40",
	},
	{
		value: "dp",
		hint: "Portal & bot WA",
		tone: "border-amber-500/40 bg-amber-500/5",
	},
	{
		value: "desain",
		hint: "Frame belum ACC",
		tone: "border-sky-500/40 bg-sky-500/5",
	},
	{ value: "siap", hint: "Desain ACC", tone: "border-primary/40 bg-primary/5" },
	{
		value: "hari_h",
		hint: "Hari ini",
		tone: "border-rose-500/40 bg-rose-500/5",
	},
	{
		value: "selesai",
		hint: "30 hari terakhir",
		tone: "border-emerald-500/40 bg-emerald-500/5",
	},
];

type MiniCard = {
	id: string;
	href: string;
	title: string;
	date: string | null;
	meta: string;
	flag?: string;
};

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
	const today = todayWIB();
	const since = shiftISODate(today, -30);
	const [evRes, cbRes, inboxRes] = await Promise.all([
		supabase
			.from("events")
			.select(
				"id, project_id, status, channel, client_name, event_date, venue_name, venue_city, grand_total, payment_status, unit_count, design_status",
			)
			.is("deleted_at", null)
			.in("status", [
				"upcoming",
				"in_progress",
				"awaiting_settlement",
				"completed",
			])
			.gte("event_date", since)
			.order("event_date", { ascending: true })
			.limit(300),
		supabase
			.from("client_bookings")
			.select(
				"id, public_code, status, service_type, package_hours, event_date, detail, expires_at",
			)
			.in("status", ["draft", "menunggu_konfirmasi"])
			.order("event_date"),
		supabase
			.from("booking_inbox")
			.select("id, client_name, status, data")
			.in("status", ["baru", "diproses"])
			.order("created_at"),
	]);
	const error = evRes.error ?? cbRes.error ?? inboxRes.error;

	if (error) {
		return (
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat pipeline: {error.message}
					</p>
				</div>
			</div>
		);
	}

	const byStage = new Map<PipelineStage, EventRow[]>();
	for (const ev of (evRes.data ?? []) as EventRow[]) {
		const st = eventStage(ev, today);
		if (st) byStage.set(st, [...(byStage.get(st) ?? []), ev]);
	}
	const now = new Date();
	const mini = new Map<PipelineStage, MiniCard[]>();
	for (const b of cbRes.data ?? []) {
		const d = (b.detail ?? {}) as {
			nama_acara?: string;
			pemilik_nama?: string;
		};
		const st: PipelineStage = b.status === "draft" ? "lead" : "dp";
		mini.set(st, [
			...(mini.get(st) ?? []),
			{
				id: b.id,
				href: "/operations/portal",
				title: d.nama_acara || d.pemilik_nama || `Booking ${b.public_code}`,
				date: b.event_date,
				meta: `Portal · ${PRODUCT_LABELS[b.service_type] ?? b.service_type} ${b.package_hours} jam`,
				flag:
					st === "lead" && leadExpiringSoon(b.expires_at, now)
						? "Hampir kedaluwarsa"
						: undefined,
			},
		]);
	}
	for (const it of inboxRes.data ?? []) {
		const d = (it.data ?? {}) as {
			nama_acara?: string;
			tanggal_iso?: string;
			paket?: string;
		};
		mini.set("dp", [
			...(mini.get("dp") ?? []),
			{
				id: it.id,
				href: `/operations/booking-masuk/${it.id}`,
				title: d.nama_acara || it.client_name || "Booking WA",
				date: d.tanggal_iso ?? null,
				meta: `Bot WA · ${d.paket ?? "paket ?"}`,
			},
		]);
	}
	const total = COLUMNS.reduce(
		(n, c) =>
			n +
			(byStage.get(c.value)?.length ?? 0) +
			(mini.get(c.value)?.length ?? 0),
		0,
	);

	return (
		<Container size="full" className="space-y-3">
			<AutoRefresh seconds={60} />
			<SectionHeader
				title="Operations"
				description={`Pipeline ${total} booking: dari lead sampai selesai. Diperbarui otomatis tiap menit.`}
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
						const items = byStage.get(col.value) ?? [];
						const extra = mini.get(col.value) ?? [];
						return (
							<section
								key={col.value}
								className={`flex h-full flex-col rounded-xl border ${col.tone}`}
								aria-label={STAGE_TITLE[col.value]}
							>
								<header className="border-b border-border-default/60 px-3 py-3">
									<div className="flex items-baseline justify-between">
										<h3 className="text-sm font-semibold">
											{STAGE_TITLE[col.value]}
										</h3>
										<span className="bg-background/70 text-foreground tabular rounded-full border border-border-default px-2 py-0.5 text-[10px] font-medium">
											{items.length + extra.length}
										</span>
									</div>
									<p className="text-muted-foreground text-[10px] uppercase tracking-wider">
										{col.hint}
									</p>
								</header>
								<div className="flex-1 space-y-2 overflow-y-auto p-2">
									{items.length + extra.length === 0 ? (
										<p className="text-muted-foreground/60 px-2 py-6 text-center text-xs italic">
											—
										</p>
									) : (
										<>
											{extra.map((m) => (
												<MiniBoardCard key={m.id} card={m} />
											))}
											{items.map((ev) => (
												<BoardCard key={ev.id} event={ev} />
											))}
										</>
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

/** Lead / DP yang belum jadi event. */
function MiniBoardCard({ card }: { card: MiniCard }) {
	return (
		<Link
			href={card.href}
			className="border-border-default bg-surface-2 hover:border-primary/40 block space-y-1 rounded-lg border p-2.5 text-left transition-colors"
		>
			<div className="flex items-baseline justify-between gap-2">
				<p className="text-sm font-semibold leading-tight">{card.title}</p>
				{card.flag && (
					<span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
						{card.flag}
					</span>
				)}
			</div>
			<p className="tabular text-xs">
				{card.date ? formatDateID(card.date) : "Tanggal ?"}
			</p>
			<p className="text-muted-foreground truncate text-[11px]">{card.meta}</p>
		</Link>
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
						{unitCountOf(event) > 1 && (
							<span className="text-muted-foreground ml-1 text-xs font-medium">
								· {unitCountOf(event)} unit
							</span>
						)}
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
