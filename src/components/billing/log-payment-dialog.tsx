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
}: {
	eventId: string;
	projectId: string;
	bankAccounts: BankAccountOption[];
	defaultDate: string;
	suggestedAmount?: number;
	grandTotal?: number;
	totalPaid?: number;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="press tap inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
				<Plus className="size-4" />
				Log payment
			</DialogTrigger>
			<DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Log payment baru</DialogTitle>
					<DialogDescription>
						Catat pembayaran masuk. Total &amp; status event update otomatis.
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
					onSuccess={() => setOpen(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
