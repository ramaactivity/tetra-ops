"use client";

import {
	AlertTriangle,
	CheckCheck,
	FileText,
	Loader2,
	Send,
} from "lucide-react";
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
	penerimaKirim,
	samakanNomorDokumen,
	sendDocumentToClient,
} from "@/lib/actions/documents";
import type { InfoPenerima } from "@/lib/documents/penerima";
import type { DocType } from "@/lib/documents/types";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
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
	// PDF selalu terkirim; pesan teks di gelembung terpisah, boleh tidak ada.
	const [withText, setWithText] = useState(true);
	const [nomor, setNomor] = useState("");
	// Penerima (owner 25 Nov): tujuan bawaan + pilihan dari event; "" = nomor lain.
	const [info, setInfo] = useState<InfoPenerima | null>(null);
	const [pilih, setPilih] = useState<string>("");
	const [pending, start] = useTransition();

	async function muatPenerima(docId: string) {
		const i = await penerimaKirim(docId);
		setInfo(i);
		setPilih(i.tujuan?.nomor ?? "");
	}

	async function openDialog() {
		if (blockedBy.length > 0) {
			toast.error(`Isi dulu harga: ${blockedBy.join(", ")}`);
			return;
		}
		const savedId = ensureSaved ? await ensureSaved() : documentId;
		if (!savedId) return;
		setId(savedId);
		setOpen(true);
		setInfo(null);
		start(async () => {
			const [m] = await Promise.all([
				defaultSendMessage(savedId),
				muatPenerima(savedId),
			]);
			setPesan(m);
		});
	}

	function kirim() {
		if (!id) return;
		start(async () => {
			const res = await sendDocumentToClient(
				id,
				withText ? pesan : "",
				pilih || nomor || null,
			);
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
							Perubahan disimpan dulu, lalu bot WA Tetra mengirim PDF versi
							terbaru ke klien.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-1">
							{(
								[
									[true, "PDF + pesan"],
									[false, "PDF saja"],
								] as const
							).map(([v, text]) => (
								<button
									key={text}
									type="button"
									onClick={() => setWithText(v)}
									aria-pressed={withText === v}
									className={cn(
										"inline-flex h-7 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
										withText === v
											? "bg-[#059669] text-white"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{text}
								</button>
							))}
						</div>
						{withText ? (
							<div className="space-y-1.5">
								<span className="text-[13px] font-medium">
									Pesan (dikirim dulu, lalu PDF)
								</span>
								<RichTextarea
									value={pesan}
									onChange={setPesan}
									rows={7}
									maxLength={1500}
									disabled={pending && !pesan}
								/>
							</div>
						) : (
							<p className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-2.5 text-[13px] text-muted-foreground">
								<FileText className="size-4 shrink-0" />
								Hanya file PDF yang dikirim, tanpa pesan teks.
							</p>
						)}
						<PenerimaPicker
							info={info}
							pilih={pilih}
							onPilih={setPilih}
							nomor={nomor}
							onNomor={setNomor}
							disabled={pending}
							onSamakan={() =>
								id &&
								start(async () => {
									const r = await samakanNomorDokumen(id);
									if (!r.ok) return void toast.error(r.error);
									toast.success(`Nomor diperbarui di ${r.jumlah} dokumen`);
									await muatPenerima(id);
									router.refresh();
								})
							}
						/>
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
							disabled={
								pending ||
								(withText && !pesan.trim()) ||
								(!pilih && !nomor.trim())
							}
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
	/** "Nama · nomor (peran)" — tujuan bawaan tombol kirim. */
	tujuan?: string | null;
	peringatan?: string | null;
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
						{r.tujuan || r.peringatan ? (
							<p className="w-full text-[12.5px] text-muted-foreground">
								{r.tujuan ? (
									<>
										Dikirim ke{" "}
										<span className="font-medium text-foreground">
											{r.tujuan}
										</span>
									</>
								) : null}
								{r.peringatan ? (
									<span className="ml-1 inline-flex items-center gap-1 text-amber-800">
										<AlertTriangle className="size-3.5" /> {r.peringatan} Ganti
										lewat Setujui & kirim.
									</span>
								) : null}
							</p>
						) : null}
					</li>
				))}
			</ul>
		</section>
	);
}

const fmtNomor = (n: string) => n.replace(/^62/, "0");

/**
 * Kirim ke siapa — pilihan dari event (WO/EO, pemesan, klien, PIC) + pengirim
 * bukti transfer + nomor di dokumen. Bukan nomor klien → peringatan dulu.
 */
function PenerimaPicker({
	info,
	pilih,
	onPilih,
	nomor,
	onNomor,
	disabled,
	onSamakan,
}: {
	info: InfoPenerima | null;
	pilih: string;
	onPilih: (v: string) => void;
	nomor: string;
	onNomor: (v: string) => void;
	disabled: boolean;
	onSamakan: () => void;
}) {
	if (!info)
		return (
			<p className="flex items-center gap-2 text-[13px] text-muted-foreground">
				<Loader2 className="size-3.5 animate-spin" /> Memuat nomor tujuan…
			</p>
		);
	const dipilih = info.pilihan.find((p) => p.nomor === pilih) ?? null;
	const adaKlien = info.pilihan.some((p) => /Klien/.test(p.label));
	const peringatan = !pilih
		? null
		: dipilih && adaKlien && !/Klien/.test(dipilih.label)
			? `${dipilih.label} — bukan nomor klien di event. Pastikan memang dikirim ke sini.`
			: !adaKlien
				? info.peringatan
				: null;
	return (
		<div className="space-y-2">
			<span className="text-[13px] font-medium">Kirim ke</span>
			<div className="flex flex-wrap gap-1.5">
				{info.pilihan.map((p) => (
					<button
						key={p.nomor}
						type="button"
						disabled={disabled}
						aria-pressed={pilih === p.nomor}
						onClick={() => onPilih(p.nomor)}
						className={cn(
							"rounded-2xl border px-3 py-1.5 text-left text-[13px] transition-colors",
							pilih === p.nomor
								? "border-[#059669] bg-[#059669]/10 text-foreground"
								: "border-border-default text-muted-foreground hover:bg-secondary",
						)}
					>
						<span className="font-medium text-foreground">
							{p.nama ?? fmtNomor(p.nomor)}
						</span>
						<span className="block text-[12px]">
							{p.label}
							{p.nama ? ` · ${fmtNomor(p.nomor)}` : ""}
						</span>
					</button>
				))}
				<button
					type="button"
					disabled={disabled}
					aria-pressed={pilih === ""}
					onClick={() => onPilih("")}
					className={cn(
						"rounded-2xl border px-3 py-1.5 text-[13px] font-medium transition-colors",
						pilih === ""
							? "border-[#059669] bg-[#059669]/10"
							: "border-border-default text-muted-foreground hover:bg-secondary",
					)}
				>
					Nomor lain
				</button>
			</div>
			{pilih === "" ? (
				<PhoneInput
					value={nomor}
					onChange={(e) => onNomor(e.target.value)}
					placeholder="08…"
				/>
			) : null}
			{peringatan ? (
				<p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
					{peringatan}
				</p>
			) : null}
			{info.nomorDokumenBeda ? (
				<div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
					<span>
						Nomor di dokumen ({fmtNomor(info.nomorDokumenBeda.lama)}) beda
						dengan nomor klien di event ({fmtNomor(info.nomorDokumenBeda.baru)}
						).
					</span>
					<Button
						size="sm"
						variant="outline"
						className="rounded-full"
						disabled={disabled}
						onClick={onSamakan}
					>
						Samakan nomor dokumen
					</Button>
				</div>
			) : null}
		</div>
	);
}
