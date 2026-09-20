"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
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
}) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="press tap inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#059669] px-4 text-sm font-medium text-white transition-colors hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]">
				<Plus className="size-4" />
				Log payment
			</DialogTrigger>
			<DialogContent className="max-h-[92vh] overflow-y-auto p-5 pb-6 sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>Log payment baru</DialogTitle>
					<DialogDescription className="sr-only">
						Catat pembayaran masuk. Total & status event update otomatis.
					</DialogDescription>
				</DialogHeader>
				<PaymentForm
					eventId={eventId}
					projectId={projectId}
					bankAccounts={bankAccounts}
					defaultDate={defaultDate}
					suggestedAmount={suggestedAmount}
					grandTotal={grandTotal}
					totalPaid={totalPaid}
					defaultDpAmount={defaultDpAmount}
					onSuccess={() => setOpen(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
