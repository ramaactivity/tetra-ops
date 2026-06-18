"use client";

import {
	CalendarClock,
	CalendarDays,
	CheckCircle2,
	Coins,
	Receipt,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { PaymentStatusDot } from "@/components/badges/status-badge";
import {
	SendWhatsAppButton,
	type WhatsAppTemplate,
} from "@/components/booking/send-wa-button";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <BillingListTable /> — billing event list, built to mirror the Operations
 * event list (operations-list-table.tsx) so the two pages read as one family:
 *
 *   KLIEN     → client name (links to event) + project id
 *   JADWAL    → 📅 event date / 🗓 jatuh tempo (tinted by urgency)
 *   TAGIHAN   → 💰 total / ✓ dibayar / sisa
 *   STATUS    → payment status
 *   AKSI      → WhatsApp + Payments
 *
 * Desktop = dense info-grid; mobile = a floating card with a 2-column body and
 * an actions footer (same skeleton as the operations card).
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
	if (status === "paid") return undefined;
	const ref = due ?? eventDate;
	if (!ref) return undefined;
	const refDate = new Date(ref);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diffDays = Math.round(
		(refDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
	);
	// Reserve color for what needs attention; everything else stays calm.
	if (diffDays < 0) return "text-rose-600 dark:text-rose-400 font-medium";
	if (diffDays <= 3) return "text-amber-700 dark:text-amber-500 font-medium";
	return undefined;
}

/* Klien gets the most flex; Jadwal + Tagihan equal; Status narrow; Aksi at the
   auto end, right-aligned. Mirrors operations COLS_DESKTOP proportions. */
const COLS_DESKTOP =
	"grid-cols-[minmax(11rem,1.25fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(6rem,0.5fr)_minmax(12rem,0.8fr)]";

export function BillingListTable({ events, templates }: Props) {
	function renderActions(ev: EventBillingRow) {
		return (
			<>
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
					className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border-default bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary"
				>
					<Receipt className="size-3.5 shrink-0" />
					Payments
				</Link>
			</>
		);
	}

	return (
		<div className="md:overflow-hidden md:rounded-lg md:border md:border-border-default md:bg-card">
			{/* DESKTOP */}
			<div className="hidden md:block">
				<div
					className={cn(
						"grid items-center gap-5 border-b border-border-default bg-card px-5 py-3 [&_.eyebrow]:!text-foreground",
						COLS_DESKTOP,
					)}
				>
					<span className="eyebrow">Klien</span>
					<span className="eyebrow">Jadwal</span>
					<span className="eyebrow">Tagihan</span>
					<span className="eyebrow">Status</span>
					<span className="eyebrow text-right">Aksi</span>
				</div>

				<div>
					{events.map((ev) => {
						const due = ev.due_date ?? ev.event_date;
						const dueTint = dueDateColor(
							ev.due_date,
							ev.event_date,
							ev.payment_status,
						);
						return (
							<div
								key={ev.id}
								className={cn(
									"group grid items-start gap-5 border-b border-border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-secondary/60",
									COLS_DESKTOP,
								)}
							>
								{/* KLIEN */}
								<div className="flex min-w-0 flex-col gap-1">
									<Link
										href={`/operations/${ev.project_id}/payments`}
										style={{ viewTransitionName: `event-${ev.project_id}` }}
										className="truncate text-[14px] font-semibold leading-snug text-foreground transition-colors hover:text-primary"
									>
										{ev.client_name}
									</Link>
									<span className="tabular truncate font-mono text-[11px] text-muted-foreground">
										{ev.project_id}
									</span>
								</div>

								{/* JADWAL */}
								<div className="flex min-w-0 flex-col gap-1 tabular">
									<Row icon={CalendarDays} strong>
										{formatDateID(ev.event_date)}
									</Row>
									<Row icon={CalendarClock} className={dueTint}>
										Tempo {due ? formatDateID(due) : "—"}
									</Row>
								</div>

								{/* TAGIHAN */}
								<div className="flex min-w-0 flex-col gap-1 tabular">
									<Row icon={Wallet} strong>
										{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
									</Row>
									<Row
										icon={CheckCircle2}
										className={
											ev.total_paid > 0
												? "text-emerald-700 dark:text-emerald-400"
												: undefined
										}
									>
										{ev.total_paid > 0
											? formatRupiah(ev.total_paid)
											: "Belum dibayar"}
									</Row>
									{ev.remaining_balance > 0 ? (
										<Row
											icon={Coins}
											className="font-semibold text-rose-600 dark:text-rose-400"
										>
											Sisa {formatRupiah(ev.remaining_balance)}
										</Row>
									) : null}
								</div>

								{/* STATUS */}
								<div className="flex items-start">
									<PaymentStatusDot
										status={ev.payment_status}
										className="!text-[13px] !font-semibold"
									/>
								</div>

								{/* AKSI */}
								<div className="flex items-center justify-end gap-1.5">
									{renderActions(ev)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* MOBILE — cards mirroring the operations event card */}
			<div className="space-y-3 md:hidden">
				{events.map((ev) => {
					const due = ev.due_date ?? ev.event_date;
					const dueTint = dueDateColor(
						ev.due_date,
						ev.event_date,
						ev.payment_status,
					);
					return (
						<div
							key={ev.id}
							className="rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-soft)]"
						>
							{/* Header */}
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<Link
										href={`/operations/${ev.project_id}/payments`}
										style={{ viewTransitionName: `event-${ev.project_id}` }}
										className="type-heading break-words transition-colors hover:text-primary"
									>
										{ev.client_name}
									</Link>
									<span className="tabular mt-0.5 block font-mono text-[11px] text-muted-foreground">
										{ev.project_id}
									</span>
								</div>
								<div className="flex shrink-0 flex-col items-end gap-1">
									<PaymentStatusDot
										status={ev.payment_status}
										className="!text-[13px] !font-semibold"
									/>
									{ev.remaining_balance > 0 && (
										<span className="tabular whitespace-nowrap text-[12px] font-semibold text-rose-600 dark:text-rose-400">
											Sisa {formatRupiah(ev.remaining_balance)}
										</span>
									)}
								</div>
							</div>

							{/* Body — 2 columns */}
							<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border-subtle pt-3">
								<div className="min-w-0 space-y-1.5 tabular">
									<span className="eyebrow block">Jadwal</span>
									<Row icon={CalendarDays} strong wrap>
										{formatDateID(ev.event_date)}
									</Row>
									<Row icon={CalendarClock} wrap className={dueTint}>
										Tempo {due ? formatDateID(due) : "—"}
									</Row>
								</div>
								<div className="min-w-0 space-y-1.5 tabular">
									<span className="eyebrow block">Tagihan</span>
									<Row icon={Wallet} strong wrap>
										{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
									</Row>
									<Row
										icon={CheckCircle2}
										wrap
										className={
											ev.total_paid > 0
												? "text-emerald-700 dark:text-emerald-400"
												: undefined
										}
									>
										{ev.total_paid > 0
											? `Dibayar ${formatRupiah(ev.total_paid)}`
											: "Belum dibayar"}
									</Row>
								</div>
							</div>

							{/* Actions footer */}
							<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle pt-3">
								<span className="eyebrow shrink-0">Aksi</span>
								<div className="flex items-center gap-1.5">
									{renderActions(ev)}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/** icon + value row — billing's local equivalent of the operations MetaLine. */
type IconCmp = React.ComponentType<{
	className?: string;
	"aria-hidden"?: boolean;
	strokeWidth?: number;
}>;

function Row({
	icon: Icon,
	children,
	strong = false,
	wrap = false,
	className,
}: {
	icon: IconCmp;
	children: React.ReactNode;
	strong?: boolean;
	wrap?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"min-w-0 gap-1.5 leading-snug",
				wrap ? "flex items-start" : "inline-flex items-center",
				strong
					? "text-[13px] font-semibold text-foreground"
					: "text-[12.5px] text-muted-foreground",
				className,
			)}
		>
			<Icon
				className={cn(
					"size-3.5 shrink-0 text-muted-foreground/70",
					wrap && "mt-px",
				)}
				aria-hidden
				strokeWidth={strong ? 2.2 : 2}
			/>
			<span className={wrap ? "min-w-0 break-words" : "truncate"}>
				{children}
			</span>
		</div>
	);
}
