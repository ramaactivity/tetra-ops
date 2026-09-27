"use client";

import { CalendarPlus, Check, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	ackInboxChanges,
	cancelInbox,
	markInboxProcessing,
} from "@/lib/actions/booking-inbox";

/** Buat Event (→ form booking terisi) + Tandai batal. */
export function InboxOpenActions({ id }: { id: string }) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();

	function buatEvent() {
		start(async () => {
			await markInboxProcessing(id);
			router.push(`/operations/new?fromInbox=${id}`);
		});
	}
	async function batal() {
		const ok = await confirm({
			title: "Tandai booking ini batal?",
			description:
				"Item tetap tersimpan sebagai riwayat dan tidak lagi menahan slot di bot.",
			confirmLabel: "Tandai batal",
			variant: "destructive",
		});
		if (!ok) return;
		start(async () => {
			const res = await cancelInbox(id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Ditandai batal");
			router.refresh();
		});
	}

	return (
		<div className="flex flex-wrap gap-2">
			<Button onClick={buatEvent} disabled={pending}>
				{pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
				Buat Event
			</Button>
			<Button variant="outline" onClick={batal} disabled={pending}>
				<XCircle /> Tandai batal
			</Button>
		</div>
	);
}

/** Reset tanda "ada perubahan" setelah owner menyesuaikan event. */
export function InboxAckButton({ id }: { id: string }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await ackInboxChanges(id);
					if (!res.ok) {
						toast.error(res.error);
						return;
					}
					toast.success("Perubahan ditandai sudah disesuaikan");
					router.refresh();
				})
			}
		>
			{pending ? <Loader2 className="animate-spin" /> : <Check />} Sudah saya
			sesuaikan
		</Button>
	);
}
