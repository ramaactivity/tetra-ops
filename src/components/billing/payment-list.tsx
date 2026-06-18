"use client";

import { ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/form-fields";
import { MoneyAmount } from "@/components/ui/money-amount";
import { toast } from "@/components/ui/toaster";
import { reversePayment } from "@/lib/actions/payments";
import { formatDateID } from "@/lib/format";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
	dp: "DP",
	partial: "Partial",
	pelunasan: "Pelunasan",
};

export type PaymentRow = {
	id: string;
	ref_id: string;
	amount: number;
	payment_date: string;
	payment_type: string;
	proof_url: string | null;
	notes: string | null;
	is_reversed: boolean;
	reversal_reason: string | null;
	bank: { bank_name: string; account_number: string | null } | null;
};

export function PaymentList({
	projectId,
	payments,
}: {
	projectId: string;
	payments: PaymentRow[];
}) {
	if (payments.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border-default px-6 py-7 text-center">
				<p className="type-body-strong">Belum ada payment</p>
				<p className="type-caption">Pembayaran yang di-log muncul di sini.</p>
			</div>
		);
	}

	return (
		<ul className="divide-y divide-border-default">
			{payments.map((p) => (
				<PaymentItem key={p.id} projectId={projectId} payment={p} />
			))}
		</ul>
	);
}

function PaymentItem({
	projectId,
	payment,
}: {
	projectId: string;
	payment: PaymentRow;
}) {
	const [pending, startTransition] = useTransition();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");

	function handleReverse() {
		if (reason.trim().length < 3) {
			toast.error("Alasan reverse minimal 3 karakter");
			return;
		}
		startTransition(async () => {
			const result = await reversePayment(projectId, payment.id, reason.trim());
			if (result.error) {
				toast.error(result.error);
				return;
			}
			toast.success("Payment di-reverse");
			setOpen(false);
			setReason("");
		});
	}

	const muted = payment.is_reversed;

	return (
		<li className="flex items-start justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
			<div className="min-w-0 flex-1 space-y-1">
				{/* Amount is the hero — the one thing you scan a payment history for */}
				<div className="flex flex-wrap items-center gap-2">
					<MoneyAmount
						value={payment.amount}
						size="lg"
						tone={muted ? "muted" : "default"}
						className={muted ? "line-through" : ""}
					/>
					<Badge variant="outline">
						{PAYMENT_TYPE_LABELS[payment.payment_type] ?? payment.payment_type}
					</Badge>
					{muted && <Badge variant="secondary">Reversed</Badge>}
				</div>

				{/* When + where the money landed */}
				<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted-foreground">
					<span className="tabular">{formatDateID(payment.payment_date)}</span>
					{payment.bank && (
						<>
							<span className="text-muted-foreground/40" aria-hidden>
								·
							</span>
							<span>
								{payment.bank.bank_name}
								{payment.bank.account_number &&
									` · ${payment.bank.account_number}`}
							</span>
						</>
					)}
				</div>

				{/* Reference ID demoted — for audit, not the headline */}
				<p
					className={`tabular font-mono text-[11px] text-muted-foreground/70 ${muted ? "line-through" : ""}`}
				>
					{payment.ref_id}
				</p>

				{payment.notes && (
					<p className="text-[12px] text-muted-foreground">{payment.notes}</p>
				)}
				{muted && payment.reversal_reason && (
					<p className="text-[12px] italic text-muted-foreground">
						Reversed: {payment.reversal_reason}
					</p>
				)}
			</div>

			<div className="flex shrink-0 items-center gap-0.5">
				{payment.proof_url && (
					<Button
						variant="ghost"
						size="icon-sm"
						render={
							<a
								href={payment.proof_url}
								target="_blank"
								rel="noopener noreferrer"
								title="Buka bukti transfer"
							>
								<ExternalLink />
							</a>
						}
					/>
				)}
				{!payment.is_reversed && (
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => setOpen(true)}
						title="Reverse payment"
						className="text-muted-foreground hover:text-destructive"
					>
						<RotateCcw />
					</Button>
				)}
			</div>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Reverse payment</DialogTitle>
						<DialogDescription>
							{payment.ref_id} · membatalkan pembayaran ini. Total &amp; status
							event akan dihitung ulang otomatis.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-1.5">
						<label
							htmlFor={`reverse-reason-${payment.id}`}
							className="block text-[13px] font-medium text-foreground"
						>
							Alasan <span className="text-destructive">*</span>
						</label>
						<TextareaField
							id={`reverse-reason-${payment.id}`}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							rows={3}
							placeholder="Contoh: salah input nominal, transfer dibatalkan, dobel."
						/>
						<p className="text-xs text-muted-foreground">
							Disimpan sebagai catatan historis pada payment ini.
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleReverse}
							disabled={pending || reason.trim().length < 3}
						>
							{pending ? (
								<>
									<Loader2 className="animate-spin" />
									Memproses…
								</>
							) : (
								"Reverse payment"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</li>
	);
}
