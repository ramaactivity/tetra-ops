"use client";

import { CheckCheck, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PhoneInput } from "@/components/ui/form-fields";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toaster";
import {
	defaultSendMessage,
	dismissSendApproval,
	markDeliveredManual,
	sendDocumentToClient,
} from "@/lib/actions/documents";
import type { DocType } from "@/lib/documents/types";
import { formatDateID, formatRupiah } from "@/lib/format";
import { DocTypeBadge } from "./document-status-badge";

/**
 * "Kirim ke klien via WA" (B1) — owner memeriksa & mengubah pesan, lalu bot WA
 * Tetra mengirim PDF-nya. Tertolak selama masih ada harga "diisi admin".
 */
export function SendToClientButton({
	documentId,
	blockedBy,
	ensureSaved,
	disabled,
	label = "Kirim ke klien via WA",
	primary = false,
}: {
	documentId: string | null;
	/** Nama item yang harganya belum diisi admin. */
	blockedBy: string[];
	/** Editor: simpan perubahan dulu, kembalikan id dokumen. */
	ensureSaved?: () => Promise<string | null>;
	disabled?: boolean;
	label?: string;
	primary?: boolean;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [id, setId] = useState<string | null>(documentId);
	const [pesan, setPesan] = useState("");
	const [nomor, setNomor] = useState("");
	const [pending, start] = useTransition();

	async function openDialog() {
		if (blockedBy.length > 0) {
			toast.error(`Isi dulu harga: ${blockedBy.join(", ")}`);
			return;
		}
		const savedId = ensureSaved ? await ensureSaved() : documentId;
		if (!savedId) return;
		setId(savedId);
		setOpen(true);
		start(async () => setPesan(await defaultSendMessage(savedId)));
	}

	function kirim() {
		if (!id) return;
		start(async () => {
			const res = await sendDocumentToClient(id, pesan, nomor || null);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			if (res.status === "terkirim") toast.success(res.message);
			else if (res.status === "gagal") toast.error(res.message);
			else toast.info(res.message);
			setOpen(false);
			router.refresh();
		});
	}

	return (
		<>
			<Button
				size="sm"
				variant={primary ? "default" : "outline"}
				onClick={openDialog}
				disabled={disabled}
			>
				<Send className="size-3.5" /> {label}
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Kirim ke klien via WA</DialogTitle>
						<DialogDescription>
							Perubahan disimpan dulu, lalu bot WA Tetra mengirim pesan ini +
							PDF versi terbaru ke klien. Periksa dulu isinya.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">Pesan</span>
							<RichTextarea
								value={pesan}
								onChange={setPesan}
								rows={7}
								maxLength={1500}
								disabled={pending && !pesan}
							/>
						</div>
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">
								Nomor WA (opsional)
							</span>
							<PhoneInput
								value={nomor}
								onChange={(e) => setNomor(e.target.value)}
								placeholder="Kosong = nomor klien di dokumen/event"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							onClick={kirim}
							disabled={pending || pesan.trim().length < 20}
						>
							{pending ? <Loader2 className="animate-spin" /> : <Send />} Kirim
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

/** "Dikirim ke klien <tgl>" atau tombol kecil "Tandai sudah dikirim manual". */
export function DeliveredInfo({
	documentId,
	deliveredAt,
	deliveredVia,
}: {
	documentId: string | null;
	deliveredAt: string | null | undefined;
	deliveredVia: string | null | undefined;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	if (deliveredAt)
		return (
			<span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-700">
				<CheckCheck className="size-3.5" />
				Dikirim ke klien {formatDateID(deliveredAt)}
				{deliveredVia === "manual" ? " (manual)" : " (bot WA)"}
			</span>
		);
	if (!documentId) return null;
	return (
		<button
			type="button"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await markDeliveredManual(documentId);
					if (!res.ok) toast.error(res.error);
					else {
						toast.success("Ditandai sudah dikirim ke klien");
						router.refresh();
					}
				})
			}
			className="text-[11.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
		>
			{pending ? "Menyimpan…" : "Tandai sudah diterima klien"}
		</button>
	);
}

/**
 * Pasangan tombol Telegram "Kirim ke klien": Abaikan / Setujui & kirim.
 * Kirim memakai dialog yang sama (pesan bisa diubah dulu); setelah terkirim,
 * permintaan Telegram-nya ikut tertutup (closePendingSends) — tidak dobel.
 */
function ApprovalActions({
	documentId,
	blockedBy,
	ensureSaved,
	disabled,
}: {
	documentId: string;
	blockedBy: string[];
	ensureSaved?: () => Promise<string | null>;
	disabled?: boolean;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();

	async function dismiss() {
		const ok = await confirm({
			title: "Abaikan permintaan kirim?",
			description:
				"Dokumen tetap tersimpan, hanya tidak dikirim bot ke klien. Tombol di Telegram ikut tidak berlaku.",
			confirmLabel: "Abaikan",
		});
		if (!ok) return;
		start(async () => {
			await dismissSendApproval(documentId);
			toast.success("Permintaan kirim diabaikan");
			router.refresh();
		});
	}

	return (
		<div className="ml-auto flex shrink-0 items-center gap-1.5">
			<Button
				size="sm"
				variant="ghost"
				onClick={dismiss}
				disabled={pending || disabled}
			>
				Abaikan
			</Button>
			<SendToClientButton
				documentId={documentId}
				blockedBy={blockedBy}
				ensureSaved={ensureSaved}
				disabled={pending || disabled}
				label="Setujui & kirim"
				primary
			/>
		</div>
	);
}

/** Banner di halaman dokumen yang masih menunggu persetujuan owner. */
export function ApprovalBanner({
	documentId,
	fromBot,
	blockedBy,
	ensureSaved,
	disabled,
}: {
	documentId: string;
	fromBot: boolean;
	blockedBy: string[];
	ensureSaved?: () => Promise<string | null>;
	disabled?: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5">
			<span className="size-2 shrink-0 rounded-full bg-amber-500" />
			<p className="min-w-0 flex-1 basis-[240px] text-[13.5px] text-amber-950">
				<span className="font-semibold">Menunggu persetujuan</span>
				{fromBot ? " · disiapkan bot WA" : ""} — periksa isinya, lalu kirim ke
				klien.
			</p>
			<ApprovalActions
				documentId={documentId}
				blockedBy={blockedBy}
				ensureSaved={ensureSaved}
				disabled={disabled}
			/>
		</div>
	);
}

export type ApprovalQueueRow = {
	id: string;
	doc_type: DocType;
	doc_number: string;
	client_name: string;
	total: number;
	blockedBy: string[];
	fromBot: boolean;
};

/** Daftar Dokumen: semua yang menunggu persetujuan, paling atas. */
export function ApprovalQueue({ rows }: { rows: ApprovalQueueRow[] }) {
	if (rows.length === 0) return null;
	return (
		<section className="overflow-hidden rounded-2xl border border-amber-200 bg-card shadow-[var(--shadow-level-2)]">
			<div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5">
				<span className="size-2 shrink-0 rounded-full bg-amber-500" />
				<h2 className="text-[14px] font-semibold text-amber-950">
					Perlu persetujuan
				</h2>
				<span className="tabular text-[13px] font-medium text-amber-800">
					{rows.length}
				</span>
				<span className="hidden truncate text-[12.5px] text-amber-800/80 sm:inline">
					· periksa, lalu kirim ke klien lewat bot WA
				</span>
			</div>
			<ul className="divide-y divide-border-subtle">
				{rows.map((r) => (
					<li
						key={r.id}
						className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
					>
						<Link
							href={`/finance/dokumen/${r.id}`}
							className="flex min-w-0 flex-1 basis-[260px] items-center gap-2 hover:underline"
						>
							<DocTypeBadge type={r.doc_type} />
							<span className="tabular shrink-0 text-[13.5px] font-semibold">
								{r.doc_number}
							</span>
							<span className="truncate text-[13px] text-muted-foreground">
								{r.client_name || "—"}
								{r.fromBot ? " · dari bot WA" : ""}
							</span>
						</Link>
						<span className="tabular text-[13.5px] font-medium">
							{formatRupiah(r.total)}
						</span>
						<ApprovalActions documentId={r.id} blockedBy={r.blockedBy} />
					</li>
				))}
			</ul>
		</section>
	);
}
