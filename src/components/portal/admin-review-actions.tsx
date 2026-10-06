"use client";

import { Check, Eye, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	acceptPortalPayment,
	proofSignedUrl,
	rejectPortalPayment,
} from "@/lib/actions/portal-admin";

/** Lihat bukti · Terima (buat event + catat DP) · Tolak (dengan alasan). */
export function PortalReviewActions({
	id,
	summary,
}: {
	id: string;
	summary: string;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");

	async function lihat() {
		const url = await proofSignedUrl(id);
		if (url) window.open(url, "_blank", "noopener");
		else toast.error("Bukti tidak ditemukan");
	}

	async function terima() {
		const ok = await confirm({
			title: "Terima DP ini?",
			description: `${summary}. Event dibuat otomatis, DP dicatat ke jurnal, kuitansi terbit, dan klien dikabari lewat WA.`,
			confirmLabel: "Terima DP",
		});
		if (!ok) return;
		start(async () => {
			const res = await acceptPortalPayment(id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(`DP diterima · event ${res.projectId}`);
			if (res.note) toast.info(res.note);
			router.refresh();
		});
	}

	function tolak() {
		start(async () => {
			const res = await rejectPortalPayment(id, reason);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Ditolak · klien dikabari lewat WA");
			setRejecting(false);
			router.refresh();
		});
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-2">
				<Button variant="outline" onClick={lihat}>
					<Eye /> Lihat bukti
				</Button>
				<Button onClick={terima} disabled={pending}>
					{pending ? <Loader2 className="animate-spin" /> : <Check />} Terima DP
				</Button>
				<Button
					variant="outline"
					onClick={() => setRejecting(!rejecting)}
					disabled={pending}
				>
					<XCircle /> Tolak
				</Button>
			</div>
			{rejecting && (
				<div className="flex flex-col gap-2 sm:flex-row">
					<input
						className="h-9 flex-1 rounded-full border border-border-subtle bg-card px-4 text-[13px]"
						placeholder="Alasan, mis. nominal di bukti tidak sesuai"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
					<Button
						variant="destructive"
						onClick={tolak}
						disabled={pending || reason.trim().length < 5}
					>
						Kirim penolakan
					</Button>
				</div>
			)}
		</div>
	);
}
