"use client";

import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Wallet,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { cancelPayable } from "@/lib/actions/payables";
import { formatDateID, formatRupiah } from "@/lib/format";
import { PayDialog } from "./pay-dialog";

export type PayablePayment = {
	id: string;
	amount: number;
	payment_date: string;
	payment_account_code: string;
	notes: string | null;
	paid_by_name: string | null;
};

export type PayableRow = {
	id: string;
	supplier_id: string | null;
	supplier_name: string | null;
	supplier_contact: string | null;
	invoice_no: string | null;
	description: string | null;
	amount: number;
	amount_paid: number;
	remaining: number;
	issued_date: string;
	due_date: string | null;
	payment_terms: string | null;
	status: string;
	notes: string | null;
	paid_at: string | null;
	cancelled_at: string | null;
	cancelled_reason: string | null;
	source_journal_id: string | null;
	created_at: string;
	payments: PayablePayment[];
};

export type CashAccountOption = {
	code: string;
	name: string;
};

const STATUS_TONE: Record<string, string> = {
	open: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	partial: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	cancelled: "border-border-default bg-surface-3 text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
	open: "Open",
	partial: "Sebagian",
	paid: "Lunas",
	cancelled: "Cancelled",
};

function daysUntil(dateStr: string | null): number | null {
	if (!dateStr) return null;
	const due = new Date(dateStr).setHours(0, 0, 0, 0);
	const today = new Date().setHours(0, 0, 0, 0);
	return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

export function PayablesTable({
	rows,
	cashAccounts,
}: {
	rows: PayableRow[];
	cashAccounts: CashAccountOption[];
}) {
	const router = useRouter();
	const [expanded, setExpanded] = useState<string | null>(null);
	const [payTarget, setPayTarget] = useState<PayableRow | null>(null);
	const [cancelTarget, setCancelTarget] = useState<PayableRow | null>(null);
	const [pending, startTransition] = useTransition();

	function handleCancel() {
		if (!cancelTarget) return;
		startTransition(async () => {
			const res = await cancelPayable(cancelTarget.id, "Dibatalkan via UI");
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("Payable dibatalkan");
				setCancelTarget(null);
				router.refresh();
			}
		});
	}

	return (
		<>
			<div className="space-y-2">
				{rows.map((p) => {
					const open = expanded === p.id;
					const days = daysUntil(p.due_date);
					const isOverdue =
						(p.status === "open" || p.status === "partial") &&
						days !== null &&
						days < 0;
					const isDueSoon =
						(p.status === "open" || p.status === "partial") &&
						days !== null &&
						days >= 0 &&
						days <= 7;
					const progressPct =
						p.amount === 0
							? 0
							: Math.min(100, Math.round((p.amount_paid / p.amount) * 100));
					const canPay = p.status === "open" || p.status === "partial";
					return (
						<article
							key={p.id}
							className={`overflow-hidden rounded-lg border bg-card ${
								isOverdue
									? "border-rose-500/40"
									: isDueSoon
										? "border-amber-500/30"
										: "border-border-default"
							}`}
						>
							<div className="flex items-start justify-between gap-3 p-4">
								<button
									type="button"
									onClick={() => setExpanded(open ? null : p.id)}
									className="min-w-0 flex-1 text-left"
								>
									<div className="space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-semibold text-foreground">
												{p.supplier_name ?? "—"}
											</span>
											<Badge
												variant="outline"
												className={STATUS_TONE[p.status] ?? ""}
											>
												{STATUS_LABEL[p.status] ?? p.status}
											</Badge>
											{isOverdue && (
												<Badge
													variant="outline"
													className="h-5 border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] text-rose-700 dark:text-rose-300"
												>
													<AlertTriangle className="mr-0.5 size-2.5" />
													Overdue {Math.abs(days as number)}h
												</Badge>
											)}
											{!isOverdue && isDueSoon && days !== null && (
												<Badge
													variant="outline"
													className="h-5 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
												>
													Due dalam {days}h
												</Badge>
											)}
											{p.payment_terms && (
												<Badge
													variant="outline"
													className="h-5 px-1.5 text-[10px] text-muted-foreground"
												>
													{p.payment_terms.toUpperCase()}
												</Badge>
											)}
										</div>
										<div className="text-fluid-caption text-foreground">
											{p.description ?? "Pembelian"}
											{p.invoice_no && (
												<span className="text-muted-foreground">
													{" "}
													· inv {p.invoice_no}
												</span>
											)}
										</div>
										<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
											<span>Issued: {formatDateID(p.issued_date)}</span>
											{p.due_date && (
												<>
													<span className="text-muted-foreground/40">·</span>
													<span>Due: {formatDateID(p.due_date)}</span>
												</>
											)}
											{p.payments.length > 0 && (
												<>
													<span className="text-muted-foreground/40">·</span>
													<span>{p.payments.length} pembayaran</span>
												</>
											)}
										</div>
										<div className="flex items-center gap-2 pt-1">
											<div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
												<div
													className={`h-full rounded-full transition-all ${
														p.status === "paid"
															? "bg-emerald-500"
															: "bg-amber-400"
													}`}
													style={{ width: `${progressPct}%` }}
												/>
											</div>
											<span className="tabular text-[10px] text-muted-foreground">
												{formatRupiah(p.amount_paid)} / {formatRupiah(p.amount)}{" "}
												({progressPct}%)
											</span>
										</div>
									</div>
								</button>

								<div className="flex shrink-0 flex-col items-end gap-1.5">
									<div className="text-right">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Sisa
										</div>
										<div
											className={`tabular text-fluid-h3 font-semibold ${
												p.remaining > 0
													? isOverdue
														? "text-rose-700 dark:text-rose-300"
														: "text-foreground"
													: "text-emerald-700 dark:text-emerald-300"
											}`}
										>
											{formatRupiah(p.remaining)}
										</div>
									</div>
									<div className="flex items-center gap-1">
										{canPay && (
											<button
												type="button"
												onClick={() => setPayTarget(p)}
												className="press-down inline-flex h-8 items-center gap-1 rounded-md bg-[#059669] dark:bg-[#0b9e6a] px-2.5 text-[12px] font-medium text-white hover:bg-[#047857] dark:hover:bg-[#059669]"
											>
												<Wallet className="size-3.5" />
												Bayar
											</button>
										)}
										{p.status === "open" && p.amount_paid === 0 && (
											<button
												type="button"
												onClick={() => setCancelTarget(p)}
												disabled={pending}
												title="Batalkan payable"
												className="press-down inline-flex size-8 items-center justify-center rounded-md border border-border-default bg-surface-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
											>
												<X className="size-3.5" />
											</button>
										)}
										<button
											type="button"
											onClick={() => setExpanded(open ? null : p.id)}
											className="press-down inline-flex size-8 items-center justify-center rounded-md border border-border-default bg-surface-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
										>
											{open ? (
												<ChevronUp className="size-4" />
											) : (
												<ChevronDown className="size-4" />
											)}
										</button>
									</div>
								</div>
							</div>

							{open && (
								<div className="border-t border-border-default px-3 pb-3 pt-2 space-y-2">
									{p.payments.length === 0 ? (
										<div className="rounded-md border border-dashed border-border-default/60 bg-surface-1/50 p-3 text-center text-[11px] text-muted-foreground">
											Belum ada pembayaran. Klik <strong>Bayar</strong> untuk
											record.
										</div>
									) : (
										<div className="overflow-hidden rounded-md border border-border-default">
											<div className="w-full overflow-x-auto">
												<table className="w-full text-sm">
													<thead className="bg-card border-b border-border-subtle text-[11px] uppercase tracking-wider text-foreground">
														<tr>
															<th className="px-3 py-2 text-left">Tanggal</th>
															<th className="px-3 py-2 text-left">Akun</th>
															<th className="px-3 py-2 text-left">Oleh</th>
															<th className="px-3 py-2 text-left">Catatan</th>
															<th className="px-3 py-2 text-right">Amount</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-border-subtle">
														{p.payments.map((py) => (
															<tr
																key={py.id}
																className="transition-colors hover:bg-secondary/40"
															>
																<td className="px-3 py-2 tabular text-fluid-caption">
																	{formatDateID(py.payment_date)}
																</td>
																<td className="px-3 py-2 tabular text-fluid-caption text-muted-foreground">
																	{py.payment_account_code}
																</td>
																<td className="px-3 py-2 text-fluid-caption text-muted-foreground">
																	{py.paid_by_name ?? "—"}
																</td>
																<td className="px-3 py-2 text-fluid-caption text-muted-foreground">
																	{py.notes ?? "—"}
																</td>
																<td className="px-3 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
																	{formatRupiah(py.amount)}
																</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>
									)}
									{p.status === "paid" && p.paid_at && (
										<div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-fluid-caption">
											<CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
											<span className="text-foreground">
												Lunas pada {formatDateID(p.paid_at)}
											</span>
										</div>
									)}
									{p.status === "cancelled" && p.cancelled_at && (
										<div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2.5 text-[11px] text-muted-foreground">
											Dibatalkan {formatDateID(p.cancelled_at)}
											{p.cancelled_reason ? ` — ${p.cancelled_reason}` : ""}
										</div>
									)}
								</div>
							)}
						</article>
					);
				})}
			</div>

			{payTarget && (
				<PayDialog
					payable={payTarget}
					cashAccounts={cashAccounts}
					open={!!payTarget}
					onOpenChange={(o) => !o && setPayTarget(null)}
				/>
			)}

			<ConfirmDialog
				open={!!cancelTarget}
				onOpenChange={(o) => !o && setCancelTarget(null)}
				title="Batalkan payable?"
				description={
					cancelTarget
						? `Payable "${cancelTarget.description ?? cancelTarget.id}" akan ditandai cancelled. Jurnal asal (DEBIT Persediaan / CREDIT Hutang Vendor) tidak otomatis ter-reverse — kalau perlu, reverse manual di Jurnal.`
						: ""
				}
				confirmLabel="Ya, batalkan"
				variant="destructive"
				onConfirm={handleCancel}
			/>
		</>
	);
}
