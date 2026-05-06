"use client";

import { ExternalLink, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { reversePayment } from "@/lib/actions/payments";
import { formatDateID, formatRupiah } from "@/lib/format";

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
			<p className="text-muted-foreground text-sm italic">
				Belum ada payment ter-log.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{payments.map((p) => (
				<PaymentItem key={p.id} projectId={projectId} payment={p} />
			))}
		</div>
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
	const [error, setError] = useState<string | null>(null);

	function handleReverse() {
		const reason = prompt("Alasan reverse payment ini?");
		if (!reason) return;
		setError(null);
		startTransition(async () => {
			const result = await reversePayment(projectId, payment.id, reason);
			if (result.error) setError(result.error);
		});
	}

	return (
		<div
			className={`border-border flex items-start gap-3 rounded-md border p-3 ${
				payment.is_reversed ? "bg-muted/30" : "bg-card"
			}`}
		>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex items-baseline gap-2">
					<span
						className={`tabular text-xs font-medium ${
							payment.is_reversed ? "text-muted-foreground line-through" : ""
						}`}
					>
						{payment.ref_id}
					</span>
					<Badge variant="outline">
						{PAYMENT_TYPE_LABELS[payment.payment_type] ?? payment.payment_type}
					</Badge>
					{payment.is_reversed && (
						<Badge variant="secondary">Reversed</Badge>
					)}
				</div>
				<div className="flex items-baseline gap-3 text-sm">
					<span
						className={`tabular font-medium ${
							payment.is_reversed
								? "text-muted-foreground line-through"
								: "text-foreground"
						}`}
					>
						{formatRupiah(payment.amount)}
					</span>
					<span className="text-muted-foreground tabular text-xs">
						{formatDateID(payment.payment_date)}
					</span>
					{payment.bank && (
						<span className="text-muted-foreground text-xs">
							{payment.bank.bank_name}
							{payment.bank.account_number && ` · ${payment.bank.account_number}`}
						</span>
					)}
				</div>
				{payment.notes && (
					<p className="text-muted-foreground text-xs">{payment.notes}</p>
				)}
				{payment.is_reversed && payment.reversal_reason && (
					<p className="text-muted-foreground text-xs italic">
						Reversed: {payment.reversal_reason}
					</p>
				)}
				{error && <p className="text-destructive text-xs">{error}</p>}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{payment.proof_url && (
					<a
						href={payment.proof_url}
						target="_blank"
						rel="noopener noreferrer"
						title="Buka bukti"
						className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
					>
						<ExternalLink className="h-4 w-4" />
					</a>
				)}
				{!payment.is_reversed && (
					<button
						type="button"
						onClick={handleReverse}
						disabled={pending}
						title="Reverse payment"
						className="text-muted-foreground hover:bg-muted hover:text-destructive inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
					>
						<RotateCcw className="h-4 w-4" />
					</button>
				)}
			</div>
		</div>
	);
}
