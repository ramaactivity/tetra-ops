"use client";

import { Archive, ChevronRight, HardDrive, Inbox, Wallet } from "lucide-react";
import Link from "next/link";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";

/**
 * <OperationsListTable /> — client wrapper around <ResponsiveTable> for
 * the operations list. Server passes serializable EventRow + crew chip
 * entries; this component owns the column render functions.
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

function formatDayName(iso: string): string {
	return new Date(iso).toLocaleDateString("id-ID", { weekday: "short" });
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
			render: (ev) => (
				<div className="flex flex-col gap-1.5">
					<Link
						href={`/operations/${ev.project_id}`}
						className="group/title space-y-0.5"
						style={{ viewTransitionName: `event-${ev.project_id}` }}
					>
						<div className="text-fluid-body font-medium text-foreground group-hover/title:text-primary transition-colors">
							{ev.client_name}
						</div>
						<div className="tabular text-[11px] text-muted-foreground inline-flex items-center gap-1">
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
						</div>
					</Link>
					<div className="flex flex-wrap items-center gap-1">
						{(ev.remaining_balance ?? 0) > 0 && (
							<Badge
								variant="outline"
								className="h-5 gap-1 border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300"
								title={`Sisa tagihan ${formatRupiah(ev.remaining_balance ?? 0)}`}
							>
								<Wallet className="size-2.5" />
								Sisa Tagihan
							</Badge>
						)}
						<Badge
							variant="outline"
							className={`h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide ${CHANNEL_TONE[ev.channel] ?? ""}`}
						>
							{CHANNEL_TYPE_LABELS[ev.channel] ?? ev.channel}
						</Badge>
					</div>
				</div>
			),
		},
		{
			key: "schedule",
			header: "Jadwal & Waktu",
			mobileLabel: "Jadwal",
			render: (ev) => (
				<div className="flex flex-col gap-0.5 tabular">
					<div className="text-fluid-caption font-medium text-foreground">
						{formatDayName(ev.event_date)}, {formatDateID(ev.event_date)}
					</div>
					{ev.setup_time && (
						<div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
							<span className="rounded bg-muted/60 px-1 text-[9px] font-semibold uppercase">
								Setup
							</span>
							{formatTime(ev.setup_time)}
						</div>
					)}
					{(ev.start_time || ev.end_time) && (
						<div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
							<span className="rounded bg-primary/10 px-1 text-[9px] font-semibold uppercase text-primary">
								Mulai
							</span>
							{formatTime(ev.start_time)}
							{ev.end_time && ` - ${formatTime(ev.end_time)}`}
						</div>
					)}
				</div>
			),
		},
		{
			key: "spec_venue",
			header: "Spesifikasi & Lokasi",
			hideOnMobile: true,
			render: (ev) => {
				const spec = [
					ev.frame_size,
					ev.package_duration_hours
						? `${ev.package_duration_hours} Jam`
						: null,
				]
					.filter(Boolean)
					.join(" Unlimited ");
				return (
					<div className="flex flex-col gap-1">
						{spec && (
							<div className="text-fluid-caption font-medium text-foreground">
								{spec}
							</div>
						)}
						<div className="text-[11px] text-muted-foreground truncate">
							{ev.venue_name}
							{ev.venue_city && ` · ${ev.venue_city}`}
						</div>
						<div className="flex flex-wrap items-center gap-1">
							{ev.include_flashdisk_pouch && (
								<Badge
									variant="outline"
									className="h-5 gap-1 px-1.5 text-[10px] font-medium uppercase tracking-wide border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
								>
									<HardDrive className="size-2.5" />
									Flashdisk
								</Badge>
							)}
							{ev.package_name && (
								<Badge
									variant="outline"
									className={`h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide ${
										ev.backdrop_color
											? (BACKDROP_TONE[ev.backdrop_color] ?? "")
											: "border-primary/30 bg-primary/10 text-primary"
									}`}
								>
									{ev.package_name}
									{ev.backdrop_color &&
										ev.backdrop_color !== "custom" &&
										` · ${ev.backdrop_color}`}
								</Badge>
							)}
						</div>
					</div>
				);
			},
		},
		{
			key: "crew",
			header: "Kru Lapangan",
			mobileLabel: "Crew",
			render: (ev) => (
				<CrewChips
					crew={crewByEvent.get(ev.id) ?? []}
					highlightUserId={crewFilter || undefined}
				/>
			),
		},
		{
			key: "actions",
			header: "Aksi & Status",
			align: "right",
			render: (ev) => (
				<div className="flex flex-col items-stretch gap-1.5 sm:items-end">
					<Link
						href={`/operations/${ev.project_id}`}
						className={`${buttonVariants({ variant: "outline", size: "sm" })} press-down justify-center sm:min-w-[7rem]`}
					>
						Edit
						<ChevronRight className="size-3.5" />
					</Link>
					<div className="flex items-center justify-center gap-1 sm:justify-end">
						<EventStatusBadge status={ev.status} />
						<PaymentStatusBadge status={ev.payment_status} />
					</div>
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

function CrewChips({
	crew,
	highlightUserId,
}: {
	crew: CrewChip[];
	highlightUserId?: string;
}) {
	if (crew.length === 0) {
		return (
			<span className="text-fluid-caption text-muted-foreground/60">—</span>
		);
	}
	const lead = crew.find((c) => c.role_in_event === "lead");
	const others = crew.filter((c) => c.role_in_event !== "lead");

	return (
		<div className="flex flex-col gap-1 tabular text-[11px]">
			{lead && <CrewLine c={lead} prefix="L" highlight={highlightUserId} />}
			{others.length > 0 ? (
				<CrewLine
					c={others[0]}
					prefix="A"
					highlight={highlightUserId}
					extra={others.length > 1 ? others.length - 1 : 0}
				/>
			) : (
				<span className="inline-flex items-center gap-1.5 text-muted-foreground/60">
					<span className="font-semibold text-muted-foreground/80">A:</span>—
				</span>
			)}
		</div>
	);
}

function CrewLine({
	c,
	prefix,
	highlight,
	extra,
}: {
	c: CrewChip;
	prefix: string;
	highlight?: string;
	extra?: number;
}) {
	const name = c.nickname ?? c.full_name;
	const isHighlight = highlight === c.user_id;
	const tone =
		prefix === "L"
			? "text-emerald-700 dark:text-emerald-400"
			: "text-sky-700 dark:text-sky-400";
	return (
		<span
			className={`inline-flex items-baseline gap-1.5 ${
				isHighlight ? "font-semibold text-foreground" : "text-foreground/90"
			}`}
		>
			<span className={`text-[9px] font-bold uppercase ${tone}`}>
				{prefix}:
			</span>
			<span className="truncate" title={c.full_name}>
				{name}
			</span>
			{extra && extra > 0 ? (
				<span className="text-muted-foreground/70">+{extra}</span>
			) : null}
		</span>
	);
}
