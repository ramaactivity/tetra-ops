"use client";

import {
	CheckCircle2,
	Download,
	ExternalLink,
	FileCheck2,
	Loader2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { SendToClientButton } from "@/components/documents/send-to-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { issueBast } from "@/lib/actions/documents";
import type { IssuedPaymentDoc } from "@/lib/finance/payment-core";
import { cn } from "@/lib/utils";

type Doc = { id: string; docType: string; docNumber: string };

const LABEL: Record<string, string> = {
	receipt: "Kuitansi pembayaran ini",
	invoice: "Invoice (sisa tagihan)",
	nota_lunas: "Nota lunas",
	bast: "BAST",
};

/**
 * Setelah "Catat pembayaran": dokumen yang langsung terbit, siap diunduh atau
 * dikirim ke klien — tanpa mencari tombol kuitansi di riwayat. Lunas → tombol
 * BAST (berita acara biasanya diminta klien setelah acara & pelunasan).
 */
export function PaymentDocsResult({
	eventId,
	docs,
	lunas,
	onDone,
}: {
	eventId: string;
	docs: IssuedPaymentDoc[];
	lunas: boolean;
	onDone: () => void;
}) {
	const [list, setList] = useState<Doc[]>(docs);
	const [pending, start] = useTransition();
	const hasBast = list.some((d) => d.docType === "bast");

	function bast() {
		start(async () => {
			const res = await issueBast(eventId);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			setList((l) => [
				...l,
				{ id: res.id, docType: "bast", docNumber: res.docNumber ?? "BAST" },
			]);
			toast.success("BAST diterbitkan");
		});
	}

	return (
		<div className="space-y-3">
			<p className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-[13px] text-emerald-800 dark:text-emerald-300">
				<CheckCircle2 className="size-4 shrink-0" aria-hidden />
				{lunas
					? "Pembayaran tercatat — tagihan lunas."
					: "Pembayaran tercatat."}
			</p>

			{list.length === 0 ? (
				<p className="text-[13px] text-muted-foreground">
					Dokumen belum terbit otomatis. Terbitkan kuitansi dari riwayat
					pembayaran (ikon kuitansi) di halaman Payments.
				</p>
			) : (
				<ul className="divide-y divide-border-subtle rounded-xl border border-border-default bg-card">
					{list.map((d) => (
						<li
							key={d.id}
							className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="min-w-0">
								<p className="text-[13px] font-medium">
									{LABEL[d.docType] ?? d.docType}
								</p>
								<p className="font-mono text-[12px] text-muted-foreground">
									{d.docNumber}
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<a
									href={`/api/pdf/document/${d.id}?download=1`}
									className={cn(
										buttonVariants({ variant: "outline", size: "sm" }),
									)}
								>
									<Download className="size-3.5" /> Unduh
								</a>
								<a
									href={`/api/pdf/document/${d.id}`}
									target="_blank"
									rel="noreferrer"
									className={cn(
										buttonVariants({ variant: "ghost", size: "sm" }),
									)}
								>
									<ExternalLink className="size-3.5" /> Lihat
								</a>
								<SendToClientButton documentId={d.id} blockedBy={[]} />
							</div>
						</li>
					))}
				</ul>
			)}

			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				{lunas && !hasBast ? (
					<Button variant="outline" onClick={bast} disabled={pending}>
						{pending ? (
							<Loader2 className="animate-spin" />
						) : (
							<FileCheck2 className="size-4" />
						)}
						Terbitkan BAST
					</Button>
				) : null}
				<Button onClick={onDone}>Selesai</Button>
			</div>
		</div>
	);
}
