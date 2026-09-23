"use client";

import {
	Download,
	ExternalLink,
	FileText,
	MessageCircle,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { setDocumentStatus } from "@/lib/actions/documents";
import { DOC_TYPE_LABEL, type DocumentRow } from "@/lib/documents/types";
import { formatDateID } from "@/lib/format";
import { whatsappUrl } from "@/lib/whatsapp";
import { DocStatusBadge } from "./document-status-badge";

/**
 * Dokumen turunan (kuitansi / nota lunas / BAST) tidak diedit — isinya
 * potret event & pembayaran saat terbit. Halaman ini cuma: lihat, unduh,
 * kirim WA, batalkan.
 */
export function DocumentViewer({
	doc,
	eventProjectId,
}: {
	doc: DocumentRow;
	eventProjectId: string | null;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const label = DOC_TYPE_LABEL[doc.doc_type];
	const pdf = `/api/pdf/document/${doc.id}`;

	function sendWa() {
		const msg = [
			`Halo ${doc.client.name},`,
			"",
			`Berikut ${label.toLowerCase()} *${doc.doc_number}* dari Tetra Photobooth.`,
			"",
			"File PDF terlampir. Terima kasih 🙏",
		].join("\n");
		window.open(`${pdf}?download=1`, "_blank");
		if (doc.client.phone)
			window.open(whatsappUrl(doc.client.phone, msg), "_blank");
		else toast.info("Nomor WA klien kosong — PDF diunduh.");
	}

	async function voidDoc() {
		const ok = await confirm({
			title: `Batalkan ${label.toLowerCase()} ini?`,
			description: `Nomor ${doc.doc_number} tetap tercatat. Kalau dibuat ulang nanti, nomornya baru.`,
			confirmLabel: "Batalkan",
			variant: "destructive",
		});
		if (!ok) return;
		start(async () => {
			const res = await setDocumentStatus(doc.id, "void");
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Dokumen dibatalkan");
			router.refresh();
		});
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-subtle bg-card px-3 py-2 shadow-[var(--shadow-level-2)]">
				<FileText className="size-4 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-[14px] font-semibold">{doc.doc_number}</span>
						<DocStatusBadge status={doc.status} />
					</div>
					<p className="truncate text-[12px] text-muted-foreground">
						{label} · {doc.client.name} · terbit {formatDateID(doc.issued_at)}
						{eventProjectId ? (
							<>
								{" · "}
								<Link
									href={`/operations/${eventProjectId}`}
									className="text-link hover:underline"
								>
									{eventProjectId}
								</Link>
							</>
						) : null}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onClick={() => window.open(`${pdf}?download=1`, "_blank")}
					>
						<Download /> PDF
					</Button>
					<Button variant="outline" size="sm" onClick={sendWa}>
						<MessageCircle /> WA
					</Button>
					{doc.status !== "void" ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={voidDoc}
							disabled={pending}
							className="text-rose-700"
						>
							<X /> Batalkan
						</Button>
					) : null}
				</div>
			</div>
			<div className="overflow-hidden rounded-2xl border border-border-subtle bg-[#5b5b57] shadow-[var(--shadow-level-2)]">
				<iframe
					title={`${label} ${doc.doc_number}`}
					src={`${pdf}#toolbar=0&navpanes=0&view=FitH`}
					className="aspect-[210/297] w-full max-h-[85vh]"
				/>
			</div>
			<a
				href={pdf}
				target="_blank"
				rel="noreferrer"
				className="inline-flex items-center gap-1 text-[13px] text-link hover:underline"
			>
				<ExternalLink className="size-3.5" /> Buka di tab baru
			</a>
		</div>
	);
}
