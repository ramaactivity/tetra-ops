"use client";

import {
	Archive,
	ChevronRight,
	Clock,
	HardDrive,
	Inbox,
	MapPin,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";

/**
 * <OperationsListTable /> — client wrapper around <ResponsiveTable> for
 * the operations list. Compact-density variant per Rama (sesi 7+):
 * single-line crew, inline chips, icon-only chevron action button.
 */

export type EventRow = {
	id: string;
	project_id: string;
	status: string;
	channel: string;
	client_name: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	frame_size: string | null;
	backdrop_color: string | null;
	include_flashdisk_pouch: boolean | null;
	venue_name: string;
	venue_city: string | null;
	grand_total: number;
	remaining_balance: number | null;
	payment_status: string;
	is_migrated_legacy: boolean | null;
	legacy_invoice_number: string | null;
	package_name: string | null;
	package_duration_hours: number | null;
};

export type CrewChip = {
	user_id: string;
	full_name: string;
	nickname: string | null;
	tier: "senior" | "junior" | null;
	role_in_event: string;
};

interface Props {
	events: EventRow[];
	/** Serialized as Array<[event_id, CrewChip[]]> from the server page */
	crewByEventEntries: Array<[string, CrewChip[]]>;
	crewFilter: string;
}

const CHANNEL_TONE: Record<string, string> = {
	direct: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	vendor:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	relasi:
		"border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

const BACKDROP_TONE: Record<string, string> = {
	merah: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
	gold: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	putih:
		"border-zinc-300/40 bg-zinc-100 text-zinc-700 dark:bg-zinc-500/10 dark:text-zinc-300",
	silver:
		"border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
	custom:
		"border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

function formatTime(t: string | null): string {
	return t ? t.slice(0, 5) : "—";
}

function formatDayDate(iso: string): string {
	const day = new Date(iso).toLocaleDateString("id-ID", { weekday: "short" });
	return `${day}, ${formatDateID(iso)}`;
}

export function OperationsListTable({
	events,
	crewByEventEntries,
	crewFilter,
}: Props) {
	const crewByEvent = new Map(crewByEventEntries);

	const columns: ResponsiveTableColumn<EventRow>[] = [
		{
			key: "project_client",
			header: "Project & Klien",
			mobileLabel: "Project",
			className: "min-w-[14rem]",
			render: (ev) => (
				<div className="flex flex-col gap-0.5">
					<Link
						href={`/operations/${ev.project_id}`}
						className="group/title min-w-0"
						style={{ viewTransitionName: `event-${ev.project_id}` }}
					>
						<div className="truncate text-sm font-semibold text-foreground group-hover/title:text-primary transition-colors">
							{ev.client_name}
						</div>
					</Link>
					<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
						<span className="tabular text-muted-foreground inline-flex items-center gap-1">
							{ev.project_id}
							{ev.is_migrated_legacy && (
								<Archive
									className="size-2.5 text-amber-600 dark:text-amber-400"
									aria-label="Migrated"
								/>
							)}
							{!ev.is_migrated_legacy && ev.legacy_invoice_number && (
								<Inbox
									className="size-2.5"
									aria-label={`Imported (${ev.legacy_invoice_number})`}
								/>
							)}
						</span>
						<span className="text-muted-foreground/40">·</span>
						<span
							className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-medium uppercase tracking-wider ${
								CHANNEL_TONE[ev.channel] ?? ""
							}`}
						>
							{CHANNEL_TYPE_LABELS[ev.channel] ?? ev.channel}
						</span>
						{(ev.remaining_balance ?? 0) > 0 && (
							<span
								className="inline-flex h-4 items-center gap-0.5 rounded border border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wider text-rose-700 dark:text-rose-300"
								title={`Sisa ${formatRupiah(ev.remaining_balance ?? 0)}`}
							>
								<Wallet className="size-2.5" />
								Sisa
							</span>
						)}
					</div>
				</div>
			),
		},
		{
			key: "schedule",
			header: "Jadwal",
			mobileLabel: "Jadwal",
			className: "min-w-[9rem]",
			render: (ev) => (
				<div className="flex flex-col gap-0.5 tabular text-[11px]">
					<div className="text-foreground font-medium">
						{formatDayDate(ev.event_date)}
					</div>
					{(ev.setup_time || ev.start_time) && (
						<div className="text-muted-foreground inline-flex items-center gap-1">
							<Clock className="size-2.5 shrink-0" aria-hidden />
							{ev.setup_time && (
								<>
									<span className="text-muted-foreground/70">setup</span>
									<span>{formatTime(ev.setup_time)}</span>
								</>
							)}
							{ev.start_time && (
								<>
									<span className="text-muted-foreground/40">·</span>
									<span className="text-primary">
										{formatTime(ev.start_time)}
										{ev.end_time && `–${formatTime(ev.end_time)}`}
									</span>
								</>
							)}
						</div>
					)}
				</div>
			),
		},
		{
			key: "spec_venue",
			header: "Spesifikasi",
			hideOnMobile: true,
			className: "min-w-[12rem]",
			render: (ev) => {
				const spec = [
					ev.frame_size,
					ev.package_duration_hours
						? `${ev.package_duration_hours}j`
						: null,
				]
					.filter(Boolean)
					.join(" · ");
				return (
					<div className="flex flex-col gap-0.5 text-[11px]">
						<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
							{spec && (
								<span className="font-medium text-foreground">{spec}</span>
							)}
							{ev.include_flashdisk_pouch && (
								<span
									className="inline-flex h-4 items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
									title="Include flashdisk pouch"
								>
									<HardDrive className="size-2.5" />
									FD
								</span>
							)}
							{ev.package_name && (
								<span
									className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-medium uppercase tracking-wide ${
										ev.backdrop_color
											? (BACKDROP_TONE[ev.backdrop_color] ?? "")
											: "border border-primary/30 bg-primary/10 text-primary"
									}`}
								>
									{ev.package_name}
									{ev.backdrop_color &&
										ev.backdrop_color !== "custom" &&
										` · ${ev.backdrop_color}`}
								</span>
							)}
						</div>
						<div className="text-muted-foreground inline-flex items-center gap-1 truncate">
							<MapPin className="size-2.5 shrink-0" aria-hidden />
							<span className="truncate">
								{ev.venue_name}
								{ev.venue_city && (
									<span className="text-muted-foreground/60">
										{" · "}
										{ev.venue_city}
									</span>
								)}
							</span>
						</div>
					</div>
				);
			},
		},
		{
			key: "crew",
			header: "Crew",
			mobileLabel: "Crew",
			className: "min-w-[10rem]",
			render: (ev) => (
				<CrewLine
					crew={crewByEvent.get(ev.id) ?? []}
					highlightUserId={crewFilter || undefined}
				/>
			),
		},
		{
			key: "actions",
			header: "Status",
			align: "right",
			className: "w-[8rem]",
			render: (ev) => (
				<div className="flex items-center justify-end gap-1.5">
					<div className="flex flex-col items-end gap-0.5">
						<EventStatusBadge status={ev.status} />
						<PaymentStatusBadge status={ev.payment_status} />
					</div>
					<Link
						href={`/operations/${ev.project_id}`}
						className="press-down inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border-default bg-surface-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
						aria-label={`Buka ${ev.project_id}`}
						title="Buka detail"
					>
						<ChevronRight className="size-4" />
					</Link>
				</div>
			),
		},
	];

	return (
		<ResponsiveTable<EventRow>
			keyExtractor={(ev) => ev.id}
			rows={events}
			columns={columns}
		/>
	);
}

function CrewLine({
	crew,
	highlightUserId,
}: {
	crew: CrewChip[];
	highlightUserId?: string;
}) {
	if (crew.length === 0) {
		return (
			<span className="text-[11px] text-muted-foreground/60 italic">—</span>
		);
	}
	const lead = crew.find((c) => c.role_in_event === "lead");
	const others = crew.filter((c) => c.role_in_event !== "lead");

	const leadName = lead?.nickname ?? lead?.full_name ?? null;
	const asistenName = others[0]?.nickname ?? others[0]?.full_name ?? null;
	const extra = others.length > 1 ? others.length - 1 : 0;
	const isHighlight = (uid?: string) => highlightUserId === uid;

	return (
		<div className="flex flex-col gap-0 tabular text-[11px] leading-tight">
			<span className="inline-flex items-baseline gap-1.5">
				<span className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
					L:
				</span>
				{leadName ? (
					<span
						className={`truncate ${isHighlight(lead?.user_id) ? "font-semibold text-foreground" : "text-foreground/90"}`}
						title={lead?.full_name}
					>
						{leadName}
					</span>
				) : (
					<span className="text-muted-foreground/60">—</span>
				)}
			</span>
			<span className="inline-flex items-baseline gap-1.5">
				<span className="text-[9px] font-bold uppercase text-sky-700 dark:text-sky-400">
					A:
				</span>
				{asistenName ? (
					<span
						className={`truncate ${isHighlight(others[0]?.user_id) ? "font-semibold text-foreground" : "text-foreground/90"}`}
						title={others[0]?.full_name}
					>
						{asistenName}
						{extra > 0 && (
							<span className="text-muted-foreground/70"> +{extra}</span>
						)}
					</span>
				) : (
					<span className="text-muted-foreground/60">—</span>
				)}
			</span>
		</div>
	);
}
