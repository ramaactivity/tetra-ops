"use client";

import { Receipt } from "lucide-react";
import Link from "next/link";
import { PaymentStatusDot } from "@/components/badges/status-badge";
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
	// Reserve color for what needs attention; everything else stays calm.
	if (diffDays < 0) return "text-rose-600 dark:text-rose-400 font-medium";
	if (diffDays <= 3) return "text-amber-700 dark:text-amber-500 font-medium";
	return "text-muted-foreground";
}

export function BillingListTable({ events, templates }: Props) {
	const columns: ResponsiveTableColumn<EventBillingRow>[] = [
		{
			key: "client",
			header: "Klien",
			width: "23%",
			render: (ev) => (
				<div className="flex flex-col gap-0.5">
					<span className="truncate text-[13px] font-medium text-foreground">
						{ev.client_name}
					</span>
					<Link
						href={`/operations/${ev.project_id}`}
						className="tabular w-fit whitespace-nowrap text-[11px] text-muted-foreground transition-colors hover:text-primary"
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
			width: "112px",
			render: (ev) => (
				<span className="tabular whitespace-nowrap text-[12.5px] text-muted-foreground">
					{formatDateID(ev.event_date)}
				</span>
			),
		},
		{
			key: "due_date",
			header: "Due Date",
			mobileLabel: "Jatuh Tempo",
			width: "112px",
			render: (ev) => {
				const due = ev.due_date ?? ev.event_date;
				return (
					<span
						className={cn(
							"tabular whitespace-nowrap text-[12.5px]",
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
			width: "120px",
			render: (ev) => (
				<span className="tabular whitespace-nowrap text-[13px] font-medium text-foreground">
					{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
				</span>
			),
		},
		{
			key: "total_paid",
			header: "Paid",
			align: "right",
			hideOnMobile: true,
			width: "120px",
			render: (ev) => (
				<span className="tabular whitespace-nowrap text-[13px] text-emerald-600 dark:text-emerald-400">
					{ev.total_paid > 0 ? (
						formatRupiah(ev.total_paid)
					) : (
						<span className="text-muted-foreground/50">—</span>
					)}
				</span>
			),
		},
		{
			key: "remaining_balance",
			header: "Sisa",
			align: "right",
			width: "120px",
			render: (ev) =>
				ev.remaining_balance > 0 ? (
					<span className="tabular whitespace-nowrap text-[13px] font-semibold text-foreground">
						{formatRupiah(ev.remaining_balance)}
					</span>
				) : (
					<span className="tabular text-[13px] text-muted-foreground/50">—</span>
				),
		},
		{
			key: "payment_status",
			header: "Status",
			width: "104px",
			render: (ev) => <PaymentStatusDot status={ev.payment_status} />,
		},
		{
			key: "actions",
			header: "Actions",
			align: "right",
			width: "184px",
			render: (ev) => (
				<div className="flex items-center justify-end gap-1.5">
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
						className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border-default bg-surface-2 px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-surface-3"
					>
						<Receipt className="size-3.5 shrink-0" />
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
