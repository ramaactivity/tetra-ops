"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { PaymentDocsResult } from "@/components/billing/payment-docs-result";
import {
	type BankAccountOption,
	PaymentForm,
} from "@/components/billing/payment-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Log payment baru" sebagai modal (pola Arsip Nota) — biar halaman Payments
 * ringkas (summary + riwayat saja) dan formnya punya ruang sendiri.
 */
export function LogPaymentDialog({
	eventId,
	projectId,
	bankAccounts,
	defaultDate,
	suggestedAmount,
	grandTotal,
	totalPaid,
	defaultDpAmount,
	defaultProofUrl,
	triggerLabel = "Log payment",
}: {
	eventId: string;
	projectId: string;
	bankAccounts: BankAccountOption[];
	defaultDate: string;
	suggestedAmount?: number;
	grandTotal?: number;
	totalPaid?: number;
	/** Nominal DP standar (system_config.default_dp_amount) untuk chip isi-cepat. */
	defaultDpAmount?: number;
	/** Bukti yang sudah ada (mis. dari Booking Masuk bot WA). */
	defaultProofUrl?: string;
	triggerLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	// Setelah tersimpan dialog TIDAK langsung tutup: tampilkan dokumen yang
	// terbit (kuitansi, invoice sisa / nota lunas) supaya bisa langsung dikirim.
	const [done, setDone] = useState<
		| Parameters<NonNullable<Parameters<typeof PaymentForm>[0]["onSuccess"]>>[0]
		| null
	>(null);
	const onSuccess = useCallback(
		(r: NonNullable<typeof done>) => setDone(r),
		[],
	);
	function onOpenChange(v: boolean) {
		setOpen(v);
		if (!v) setDone(null);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger className="press tap inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#059669] px-4 text-sm font-medium text-white transition-colors hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]">
				<Plus className="size-4" />
				{triggerLabel}
			</DialogTrigger>
			<DialogContent className="max-h-[92vh] overflow-y-auto p-5 pb-6 sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>
						{done ? "Pembayaran tercatat" : "Log payment baru"}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Catat pembayaran masuk. Total & status event update otomatis.
					</DialogDescription>
				</DialogHeader>
				{done ? (
					<PaymentDocsResult
						eventId={eventId}
						docs={done.docs}
						lunas={done.lunas}
						onDone={() => onOpenChange(false)}
					/>
				) : (
					<PaymentForm
						eventId={eventId}
						projectId={projectId}
						bankAccounts={bankAccounts}
						defaultDate={defaultDate}
						suggestedAmount={suggestedAmount}
						grandTotal={grandTotal}
						totalPaid={totalPaid}
						defaultDpAmount={defaultDpAmount}
						defaultProofUrl={defaultProofUrl}
						onSuccess={onSuccess}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
