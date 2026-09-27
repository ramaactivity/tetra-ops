"use client";

import { CheckCheck, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
	markDeliveredManual,
	sendDocumentToClient,
} from "@/lib/actions/documents";
import { formatDateID } from "@/lib/format";

/**
 * "Kirim ke klien via WA" (B1) — owner memeriksa & mengubah pesan, lalu bot WA
 * Tetra mengirim PDF-nya. Tertolak selama masih ada harga "diisi admin".
 */
export function SendToClientButton({
	documentId,
	blockedBy,
	ensureSaved,
	disabled,
}: {
	documentId: string | null;
	/** Nama item yang harganya belum diisi admin. */
	blockedBy: string[];
	/** Editor: simpan perubahan dulu, kembalikan id dokumen. */
	ensureSaved?: () => Promise<string | null>;
	disabled?: boolean;
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
				variant="outline"
				onClick={openDialog}
				disabled={disabled}
			>
				<Send className="size-3.5" /> Kirim ke klien via WA
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Kirim ke klien via WA</DialogTitle>
						<DialogDescription>
							Bot WA Tetra mengirim pesan ini + PDF dokumen ke klien. Periksa
							dulu isinya.
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
			{pending ? "Menyimpan…" : "Belum dikirim · tandai sudah dikirim manual"}
		</button>
	);
}
