"use client";

import { Loader2, Receipt } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { issueReceipt } from "@/lib/actions/documents";

/** Kuitansi untuk satu pembayaran — dibuat sekali, unduh ulang nomor sama. */
export function ReceiptButton({ paymentId }: { paymentId: string }) {
	const [pending, start] = useTransition();
	function open() {
		start(async () => {
			const res = await issueReceipt(paymentId);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			if (res.created) toast.success("Kuitansi diterbitkan");
			window.open(`/api/pdf/document/${res.id}`, "_blank");
		});
	}
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			onClick={open}
			disabled={pending}
			title="Kuitansi pembayaran ini"
			aria-label="Kuitansi"
		>
			{pending ? <Loader2 className="animate-spin" /> : <Receipt />}
		</Button>
	);
}
