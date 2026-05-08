"use client";

import { Receipt } from "lucide-react";
import Link from "next/link";
import { PaymentStatusBadge } from "@/components/badges/status-badge";
import {
	SendWhatsAppButton,
	type WhatsAppTemplate,
} from "@/components/booking/send-wa-button";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <BillingListTable /> — client wrapper around <ResponsiveTable> for the
 * billing list. Server billing/page.tsx hands serializable data here;
 * column render functions live inside the client boundary.
 */

export type EventBillingRow = {
	id: string;
	project_id: string;
	client_name: string;
	client_wa: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	venue_name: string;
	due_date: string | null;
	grand_total: number;
	total_paid: number;
	remaining_balance: number;
	payment_status: string;
};

interface Props {
	events: EventBillingRow[];
	templates: WhatsAppTemplate[];
}

function dueDateColor(due: string | null, eventDate: string, status: string) {
	if (status === "paid") return "text-muted-foreground";
	const ref = due ?? eventDate;
	if (!ref) return "text-muted-foreground";
	const refDate = new Date(ref);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diffDays = Math.round(
		(refDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
	);
	if (diffDays < 0) return "text-rose-500";
	if (diffDays <= 3) return "text-amber-500";
	return "text-emerald-500";
}

export function BillingListTable({ events, templates }: Props) {
	const columns: ResponsiveTableColumn<EventBillingRow>[] = [
		{
			key: "client",
			header: "Klien",
			render: (ev) => (
				<div className="space-y-0.5">
					<div className="text-fluid-body font-medium">{ev.client_name}</div>
					<Link
						href={`/operations/${ev.project_id}`}
						className="tabular text-fluid-caption text-primary hover:underline"
						style={{ viewTransitionName: `event-${ev.project_id}` }}
					>
						{ev.project_id}
					</Link>
				</div>
			),
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
			key: "due_date",
			header: "Due Date",
			mobileLabel: "Jatuh Tempo",
			render: (ev) => {
				const due = ev.due_date ?? ev.event_date;
				return (
					<span
						className={cn(
							"tabular text-fluid-caption",
							dueDateColor(ev.due_date, ev.event_date, ev.payment_status),
						)}
					>
						{due ? formatDateID(due) : "—"}
					</span>
				);
			},
		},
		{
			key: "grand_total",
			header: "Total",
			align: "right",
			hideOnMobile: true,
			render: (ev) => (
				<span className="tabular font-medium">
					{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
				</span>
			),
		},
		{
			key: "total_paid",
			header: "Paid",
			align: "right",
			hideOnMobile: true,
			render: (ev) => (
				<span className="tabular text-emerald-500">
					{ev.total_paid > 0 ? formatRupiah(ev.total_paid) : "—"}
				</span>
			),
		},
		{
			key: "remaining_balance",
			header: "Sisa",
			align: "right",
			render: (ev) =>
				ev.remaining_balance > 0 ? (
					<span className="tabular font-medium text-foreground">
						{formatRupiah(ev.remaining_balance)}
					</span>
				) : (
					<span className="tabular text-muted-foreground">—</span>
				),
		},
		{
			key: "payment_status",
			header: "Status",
			render: (ev) => <PaymentStatusBadge status={ev.payment_status} />,
		},
		{
			key: "actions",
			header: "Actions",
			align: "right",
			render: (ev) => (
				<div className="flex items-center justify-end gap-1">
					<SendWhatsAppButton
						event={{
							project_id: ev.project_id,
							client_name: ev.client_name,
							client_wa: ev.client_wa,
							event_date: ev.event_date,
							setup_time: ev.setup_time,
							start_time: ev.start_time,
							venue_name: ev.venue_name,
							due_date: ev.due_date,
							total_paid: ev.total_paid,
							remaining_balance: ev.remaining_balance,
						}}
						templates={templates}
						size="sm"
					/>
					<Link
						href={`/operations/${ev.project_id}/payments`}
						title="Log payment / lihat history"
						className="inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 text-fluid-caption font-medium text-foreground transition-colors hover:bg-surface-3"
					>
						<Receipt className="size-3.5" />
						Payments
					</Link>
				</div>
			),
		},
	];

	return (
		<ResponsiveTable<EventBillingRow>
			keyExtractor={(ev) => ev.id}
			rows={events}
			columns={columns}
		/>
	);
}
