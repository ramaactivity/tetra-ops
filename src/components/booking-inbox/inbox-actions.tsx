"use client";

import { CalendarPlus, Check, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	ackInboxChanges,
	cancelInbox,
	checkInboxRefresh,
	markInboxProcessing,
	requestInboxRefresh,
} from "@/lib/actions/booking-inbox";

/**
 * Buat Event (→ form booking terisi) + Tandai batal. sourceDoc = invoice /
 * quotation klien yang belum punya event → form digabung (harga dari dokumen,
 * jam/PIC dari chat) dan dokumennya tertaut ke event (nomor tetap).
 */
export function InboxOpenActions({
	id,
	sourceDoc,
}: {
	id: string;
	sourceDoc?: { id: string; type: string; number: string } | null;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();

	function buatEvent() {
		start(async () => {
			await markInboxProcessing(id);
			const doc = sourceDoc
				? `&${sourceDoc.type === "invoice" ? "fromInvoice" : "fromQuotation"}=${sourceDoc.id}`
				: "";
			router.push(`/operations/new?fromInbox=${id}${doc}`);
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
				{sourceDoc ? `Buat Event dari ${sourceDoc.number}` : "Buat Event"}
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

const POLL_MS = 2500;
const POLL_MAX = 40; // ±100 detik

/**
 * "Perbarui dari chat" — bot membaca ulang seluruh chat lalu mengisi ulang
 * isian (merge; nilai bot menimpa isian dari dokumen). Tanpa pesan ke klien.
 */
export function InboxRefreshButton({ id }: { id: string }) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	async function run() {
		setBusy(true);
		try {
			const res = await requestInboxRefresh(id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			for (let i = 0; i < POLL_MAX; i++) {
				await new Promise((r) => setTimeout(r, POLL_MS));
				const st = await checkInboxRefresh(res.commandId);
				if (st.status === "done") {
					toast.success(st.result || "Isian diperbarui dari chat");
					router.refresh();
					return;
				}
				if (st.status === "error") {
					toast.error(st.result || "Bot gagal membaca chat");
					return;
				}
			}
			toast.error(
				"Bot belum menjawab. Isian akan berubah sendiri setelah bot selesai — muat ulang halaman nanti.",
			);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Gagal meminta bot");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button variant="outline" onClick={run} disabled={busy}>
			{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
			{busy ? "Membaca chat…" : "Perbarui dari chat"}
		</Button>
	);
}
