"use client";

import { CalendarDays, Receipt } from "lucide-react";
import Link from "next/link";
import { PaymentStatusBadge } from "@/components/badges/status-badge";
import {
	SendWhatsAppButton,
	type WhatsAppTemplate,
} from "@/components/booking/send-wa-button";
import { DocumentMenu } from "@/components/documents/document-menu";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <BillingListTable /> — billing event list, built to mirror the Operations
 * event list (operations-list-table.tsx) so the two pages read as one family:
 *
 *   KLIEN     → client name (links to event) + project id
 *   JADWAL    → event date + relative jatuh tempo (tinted by urgency)
 *   TAGIHAN   → total / paid-progress bar / sisa or lunas
 *   STATUS    → payment status pill
 *   AKSI      → WhatsApp + Payments + Invoice (auto width, never overlaps)
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

type Tone = "danger" | "warning" | "muted" | "success";

const TONE_TEXT: Record<Tone, string> = {
	danger: "text-rose-600 dark:text-rose-400",
	warning: "text-amber-700 dark:text-amber-500",
	muted: "text-muted-foreground",
	success: "text-emerald-700 dark:text-emerald-400",
};

/** Short date without year when it's the current year ("27 Sep"). */
function shortDate(iso: string) {
	const d = new Date(iso);
	return d.toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		...(d.getFullYear() === new Date().getFullYear()
			? {}
			: { year: "numeric" }),
	});
}

/**
 * Jatuh tempo as a relative, actionable label. Tempo usually equals the event
 * date, so repeating the date adds nothing — say how urgent it is instead.
 */
function dueInfo(ev: EventBillingRow): { label: string; tone: Tone } {
	if (ev.payment_status === "paid" || ev.remaining_balance <= 0)
		return { label: "Tidak ada tagihan", tone: "success" };
	const ref = ev.due_date ?? ev.event_date;
	if (!ref) return { label: "Tempo —", tone: "muted" };
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diff = Math.round(
		(new Date(ref).getTime() - today.getTime()) / 86_400_000,
	);
	if (diff < 0) return { label: `Telat ${-diff} hari`, tone: "danger" };
	if (diff === 0) return { label: "Jatuh tempo hari ini", tone: "danger" };
	if (diff <= 3) return { label: `Tempo H-${diff}`, tone: "warning" };
	return { label: `Tempo ${shortDate(ref)}`, tone: "muted" };
}

/* Klien flexes; Jadwal + Tagihan are fixed & compact; Status fits a pill;
   Aksi is `auto` so its buttons can never spill over Status. */
const COLS_DESKTOP = "grid-cols-[minmax(12rem,1fr)_8.5rem_11rem_6rem_auto]";

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
					title="Catat pembayaran / lihat riwayat"
					aria-label="Payments"
					className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[12px] border border-border-default bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary"
				>
					<Receipt className="size-3.5 shrink-0" />
					<span className="md:hidden xl:inline">Payments</span>
				</Link>
				<DocumentMenu
					eventId={ev.id}
					isPaid={ev.remaining_balance <= 0 && ev.total_paid > 0}
					label="Invoice"
				/>
			</>
		);
	}

	return (
		<div className="md:overflow-hidden md:rounded-2xl md:border md:border-border-default md:bg-card md:shadow-[var(--shadow-soft)]">
			{/* DESKTOP */}
			<div className="hidden md:block">
				<div
					className={cn(
						"grid items-center gap-x-5 border-b border-border-default bg-secondary/40 px-5 py-2.5",
						COLS_DESKTOP,
					)}
				>
					<span className="eyebrow">Klien</span>
					<span className="eyebrow">Jadwal</span>
					<span className="eyebrow text-right">Tagihan</span>
					<span className="eyebrow">Status</span>
					<span className="eyebrow text-right">Aksi</span>
				</div>

				<div>
					{events.map((ev) => {
						const due = dueInfo(ev);
						return (
							<div
								key={ev.id}
								className={cn(
									"grid items-center gap-x-5 border-b border-border-subtle px-5 py-3.5 transition-colors last:border-b-0 hover:bg-secondary/50",
									COLS_DESKTOP,
								)}
							>
								{/* KLIEN */}
								<div className="flex min-w-0 flex-col gap-0.5">
									<Link
										href={`/operations/${ev.project_id}/payments`}
										style={{ viewTransitionName: `event-${ev.project_id}` }}
										title={ev.client_name}
										className="truncate text-[14px] font-semibold leading-snug text-foreground transition-colors hover:text-primary"
									>
										{ev.client_name}
									</Link>
									<span className="truncate font-mono text-[11px] text-muted-foreground">
										{ev.project_id}
									</span>
								</div>

								{/* JADWAL */}
								<div className="flex min-w-0 flex-col gap-0.5">
									<span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
										<CalendarDays
											className="size-3.5 shrink-0 text-muted-foreground/70"
											aria-hidden
										/>
										{shortDate(ev.event_date)}
									</span>
									<span
										className={cn(
											"truncate pl-5 text-[12px]",
											TONE_TEXT[due.tone],
											due.tone !== "muted" && "font-medium",
										)}
									>
										{due.label}
									</span>
								</div>

								{/* TAGIHAN */}
								<AmountCell ev={ev} />

								{/* STATUS */}
								<div>
									<PaymentStatusBadge status={ev.payment_status} />
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
					const due = dueInfo(ev);
					return (
						<div
							key={ev.id}
							className="rounded-2xl border border-border-default bg-card p-4 shadow-[var(--shadow-soft)]"
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
									<span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
										{ev.project_id}
									</span>
								</div>
								<PaymentStatusBadge status={ev.payment_status} />
							</div>

							{/* Body — jadwal | tagihan */}
							<div className="mt-3 grid grid-cols-2 gap-x-3 border-t border-border-subtle pt-3">
								<div className="min-w-0 space-y-1">
									<span className="eyebrow block">Jadwal</span>
									<span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
										<CalendarDays
											className="size-3.5 shrink-0 text-muted-foreground/70"
											aria-hidden
										/>
										{shortDate(ev.event_date)}
									</span>
									<span
										className={cn(
											"block text-[12px]",
											TONE_TEXT[due.tone],
											due.tone !== "muted" && "font-medium",
										)}
									>
										{due.label}
									</span>
								</div>
								<div className="min-w-0 space-y-1">
									<span className="eyebrow block text-right">Tagihan</span>
									<AmountCell ev={ev} />
								</div>
							</div>

							{/* Actions footer */}
							<div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-border-subtle pt-3">
								{renderActions(ev)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/**
 * Total on top, a thin paid-progress bar, then the one number that matters:
 * sisa (rose) or lunas (emerald). Right-aligned so amounts line up.
 */
function AmountCell({ ev }: { ev: EventBillingRow }) {
	const total = ev.grand_total ?? 0;
	const settled = Math.max(0, total - ev.remaining_balance);
	const pct = total > 0 ? Math.min(100, (settled / total) * 100) : 0;
	return (
		<div className="flex min-w-0 flex-col items-end gap-1">
			<span className="tabular text-[14px] font-semibold leading-none text-foreground">
				{total ? formatRupiah(total) : "—"}
			</span>
			<div
				className="h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-secondary"
				role="progressbar"
				aria-valuenow={Math.round(pct)}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Persentase terbayar"
			>
				<div
					className={cn(
						"h-full rounded-full",
						pct >= 100 ? "bg-emerald-500" : "bg-amber-400",
					)}
					style={{ width: `${pct}%` }}
				/>
			</div>
			{ev.remaining_balance > 0 ? (
				<span className="text-[12px] font-medium leading-none text-rose-600 dark:text-rose-400">
					Sisa{" "}
					<span className="tabular">{formatRupiah(ev.remaining_balance)}</span>
				</span>
			) : (
				<span className="text-[12px] font-medium leading-none text-emerald-700 dark:text-emerald-400">
					Lunas
				</span>
			)}
		</div>
	);
}
