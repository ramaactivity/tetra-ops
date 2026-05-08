"use client";

import { Archive, Inbox } from "lucide-react";
import Link from "next/link";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";

/**
 * <OperationsListTable /> — client wrapper around <ResponsiveTable> for
 * the operations list. Accepts only serializable props from the server
 * page; columns + render functions are constructed inside the client
 * boundary so Next.js doesn't reject the function values.
 *
 * Server → Client boundary: arrays of plain objects, primitive strings.
 */

export type EventRow = {
	id: string;
	project_id: string;
	status: string;
	channel: string;
	client_name: string;
	event_date: string;
	venue_name: string;
	venue_city: string | null;
	grand_total: number;
	payment_status: string;
	is_migrated_legacy: boolean | null;
	legacy_invoice_number: string | null;
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

export function OperationsListTable({
	events,
	crewByEventEntries,
	crewFilter,
}: Props) {
	const crewByEvent = new Map(crewByEventEntries);

	const columns: ResponsiveTableColumn<EventRow>[] = [
		{
			key: "project_id",
			header: "Project ID",
			mobileLabel: "ID",
			render: (ev) => (
				<div className="flex items-center gap-1.5 tabular text-fluid-caption font-medium">
					<Link
						href={`/operations/${ev.project_id}`}
						className="text-primary hover:underline"
					>
						{ev.project_id}
					</Link>
					{ev.is_migrated_legacy && (
						<span
							className="inline-flex h-4 items-center rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"
							title="Migrated from Phase-2 (read-only)"
						>
							<Archive className="size-2.5" />
						</span>
					)}
					{!ev.is_migrated_legacy && ev.legacy_invoice_number && (
						<span
							className="inline-flex h-4 items-center rounded border border-border-default px-1 text-[10px] font-medium text-muted-foreground"
							title={`Imported from Phase-2 (invoice ${ev.legacy_invoice_number})`}
						>
							<Inbox className="size-2.5" />
						</span>
					)}
				</div>
			),
		},
		{
			key: "client_name",
			header: "Client",
			mobileLabel: "Klien",
		},
		{
			key: "event_date",
			header: "Event Date",
			mobileLabel: "Tanggal",
			render: (ev) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{formatDateID(ev.event_date)}
				</span>
			),
		},
		{
			key: "venue",
			header: "Venue",
			hideOnMobile: true,
			render: (ev) => (
				<span className="truncate text-fluid-caption text-muted-foreground">
					{ev.venue_name}
					{ev.venue_city && (
						<span className="text-muted-foreground/60">
							{" · "}
							{ev.venue_city}
						</span>
					)}
				</span>
			),
		},
		{
			key: "crew",
			header: "Crew",
			render: (ev) => (
				<CrewChips
					crew={crewByEvent.get(ev.id) ?? []}
					highlightUserId={crewFilter || undefined}
				/>
			),
		},
		{
			key: "channel",
			header: "Channel",
			hideOnMobile: true,
			render: (ev) => (
				<span className="text-fluid-caption text-muted-foreground">
					{CHANNEL_TYPE_LABELS[ev.channel] ?? ev.channel}
				</span>
			),
		},
		{
			key: "status",
			header: "Status",
			render: (ev) => <EventStatusBadge status={ev.status} />,
		},
		{
			key: "grand_total",
			header: "Grand Total",
			align: "right",
			render: (ev) => (
				<span className="tabular font-medium">
					{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
				</span>
			),
		},
		{
			key: "payment_status",
			header: "Payment",
			mobileLabel: "Pembayaran",
			render: (ev) => <PaymentStatusBadge status={ev.payment_status} />,
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
	const visible = crew.slice(0, 3);
	const overflow = crew.length - visible.length;
	return (
		<div className="flex items-center gap-1">
			{visible.map((c) => {
				const isLead = c.role_in_event === "lead";
				const initials = (c.nickname ?? c.full_name)
					.split(/\s+/)
					.slice(0, 2)
					.map((p) => p[0])
					.join("")
					.toUpperCase();
				const highlighted = highlightUserId === c.user_id;
				return (
					<span
						key={c.user_id}
						title={`${c.full_name}${c.tier ? ` · ${c.tier}` : ""} · ${c.role_in_event}`}
						className={`inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ${
							highlighted
								? "ring-primary"
								: isLead
									? "ring-emerald-500/30"
									: "ring-sky-500/30"
						} ${
							isLead
								? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
								: "bg-sky-500/15 text-sky-700 dark:text-sky-300"
						}`}
					>
						{initials || "?"}
					</span>
				);
			})}
			{overflow > 0 && (
				<span
					title={`${overflow} crew lainnya`}
					className="inline-flex size-6 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-muted-foreground"
				>
					+{overflow}
				</span>
			)}
		</div>
	);
}
