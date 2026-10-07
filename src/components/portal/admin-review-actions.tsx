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
	resolvePortalRequest,
} from "@/lib/actions/portal-admin";

/** Lihat bukti · Terima (buat event + catat DP) · Tolak (dengan alasan). */
export function PortalReviewActions({
	id,
	summary,
	kind = "dp",
}: {
	id: string;
	summary: string;
	kind?: string;
}) {
	const isDp = kind === "dp";
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
			title: isDp ? "Terima DP ini?" : "Terima pembayaran ini?",
			description: isDp
				? `${summary}. Event dibuat otomatis, DP dicatat ke jurnal, kuitansi terbit, dan klien dikabari lewat WA.`
				: `${summary}. Pembayaran dicatat ke jurnal, kuitansi terbit, dan klien dikabari lewat WA.`,
			confirmLabel: isDp ? "Terima DP" : "Terima pembayaran",
		});
		if (!ok) return;
		start(async () => {
			const res = await acceptPortalPayment(id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				isDp ? `DP diterima · event ${res.projectId}` : "Pembayaran diterima",
			);
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
					{pending ? <Loader2 className="animate-spin" /> : <Check />}{" "}
					{isDp ? "Terima DP" : "Terima pembayaran"}
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

/** Tutup permintaan pindah tanggal / batal setelah owner mengubah event. */
export function PortalRequestActions({ id }: { id: string }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [note, setNote] = useState("");
	const run = (status: "selesai" | "ditolak") =>
		start(async () => {
			const res = await resolvePortalRequest(id, status, note);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				status === "selesai"
					? "Ditandai selesai · klien dikabari"
					: "Ditolak · klien dikabari",
			);
			router.refresh();
		});
	return (
		<div className="flex flex-col gap-2 sm:flex-row">
			<input
				className="h-9 flex-1 rounded-full border border-border-subtle bg-card px-4 text-[13px]"
				placeholder="Catatan untuk klien (wajib kalau ditolak)"
				value={note}
				onChange={(e) => setNote(e.target.value)}
			/>
			<Button onClick={() => run("selesai")} disabled={pending}>
				{pending ? <Loader2 className="animate-spin" /> : <Check />} Selesai
			</Button>
			<Button
				variant="outline"
				onClick={() => run("ditolak")}
				disabled={pending || note.trim().length < 5}
			>
				<XCircle /> Tolak
			</Button>
		</div>
	);
}
