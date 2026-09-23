"use client";

import {
	Check,
	ImagePlus,
	Loader2,
	PenLine,
	Plus,
	Star,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
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
import { TextField } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import {
	archiveSigner,
	saveSigner,
	setDefaultSigner,
} from "@/lib/actions/document-signers";
import type { DocumentSigner } from "@/lib/documents/types";
import { cn } from "@/lib/utils";

/**
 * Gambar tanda tangan → PNG kecil (maks 600px, latar transparan dipertahankan)
 * di browser, supaya yang tersimpan di DB cuma belasan KB.
 */
async function toSignatureDataUrl(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, 600 / bitmap.width, 300 / bitmap.height);
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas tidak tersedia");
	ctx.drawImage(bitmap, 0, 0, w, h);
	return canvas.toDataURL("image/png");
}

export function SignerSettings({ signers }: { signers: DocumentSigner[] }) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [editing, setEditing] = useState<Partial<DocumentSigner> | null>(null);

	function makeDefault(id: string) {
		start(async () => {
			const res = await setDefaultSigner(id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Penanda tangan default diubah");
			router.refresh();
		});
	}
	async function remove(s: DocumentSigner) {
		const ok = await confirm({
			title: `Hapus ${s.name}?`,
			description: "Dokumen lama tetap menyimpan nama & jabatannya.",
			confirmLabel: "Hapus",
			variant: "destructive",
		});
		if (!ok) return;
		start(async () => {
			const res = await archiveSigner(s.id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Dihapus");
			router.refresh();
		});
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-[13.5px] text-muted-foreground">
					Preset nama, jabatan, dan gambar tanda tangan yang tercetak di
					quotation, invoice, kuitansi, nota, dan BAST.
				</p>
				<Button size="sm" onClick={() => setEditing({})}>
					<Plus /> Tambah
				</Button>
			</div>
			<ul className="grid gap-3 sm:grid-cols-2">
				{signers.map((s) => (
					<li
						key={s.id}
						className={cn(
							"flex gap-3 rounded-2xl border bg-card p-4 shadow-[var(--shadow-level-2)]",
							s.is_default ? "border-emerald-400" : "border-border-subtle",
						)}
					>
						<div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-default bg-background">
							{s.signature_data ? (
								// biome-ignore lint/performance/noImgElement: data URL kecil, bukan aset next/image
								<img
									src={s.signature_data}
									alt={`Tanda tangan ${s.name}`}
									className="max-h-14 max-w-24 object-contain"
								/>
							) : (
								<span className="text-[11px] text-muted-foreground">
									belum ada ttd
								</span>
							)}
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<p className="truncate text-[14.5px] font-semibold">{s.name}</p>
								{s.is_default ? (
									<span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
										<Check className="size-3" /> Default
									</span>
								) : null}
							</div>
							<p className="text-[13px] text-muted-foreground">{s.position}</p>
							<div className="mt-2 flex flex-wrap gap-1">
								<Button variant="ghost" size="xs" onClick={() => setEditing(s)}>
									<PenLine /> Edit
								</Button>
								{!s.is_default ? (
									<Button
										variant="ghost"
										size="xs"
										onClick={() => makeDefault(s.id)}
										disabled={pending}
									>
										<Star /> Jadikan default
									</Button>
								) : null}
								<Button
									variant="ghost"
									size="xs"
									onClick={() => remove(s)}
									disabled={pending}
									className="text-rose-700"
								>
									<Trash2 /> Hapus
								</Button>
							</div>
						</div>
					</li>
				))}
			</ul>
			{editing ? (
				<SignerDialog signer={editing} onClose={() => setEditing(null)} />
			) : null}
		</div>
	);
}

export function SignerDialog({
	signer,
	onClose,
}: {
	signer: Partial<DocumentSigner>;
	onClose: () => void;
}) {
	const router = useRouter();
	const fileId = useId();
	const fileRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(signer.name ?? "");
	const [position, setPosition] = useState(signer.position ?? "Owner");
	const [signature, setSignature] = useState<string | null>(
		signer.signature_data ?? null,
	);
	const [replaced, setReplaced] = useState(false);
	const [pending, start] = useTransition();

	async function onFile(file: File | null) {
		if (!file) return;
		try {
			setSignature(await toSignatureDataUrl(file));
			setReplaced(true);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Gagal membaca gambar");
		}
	}

	function submit() {
		start(async () => {
			const res = await saveSigner({
				id: signer.id ?? null,
				name,
				position,
				signature_data: signature,
				replace_signature: replaced,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Tersimpan");
			onClose();
			router.refresh();
		});
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{signer.id ? "Edit penanda tangan" : "Penanda tangan baru"}
					</DialogTitle>
					<DialogDescription>
						Gambar tanda tangan: PNG latar transparan paling bagus. Foto tanda
						tangan di kertas putih juga bisa.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<label
							htmlFor={`${fileId}-name`}
							className="text-[13px] font-medium"
						>
							Nama
						</label>
						<TextField
							id={`${fileId}-name`}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Ramadan Saputra"
						/>
					</div>
					<div className="space-y-1.5">
						<label
							htmlFor={`${fileId}-position`}
							className="text-[13px] font-medium"
						>
							Jabatan
						</label>
						<TextField
							id={`${fileId}-position`}
							value={position}
							onChange={(e) => setPosition(e.target.value)}
							placeholder="Owner"
						/>
					</div>
					<div className="space-y-1.5">
						<span className="text-[13px] font-medium">Tanda tangan</span>
						<button
							type="button"
							onClick={() => fileRef.current?.click()}
							className="flex h-28 w-full items-center justify-center rounded-xl border border-dashed border-border-default bg-background transition-colors hover:bg-secondary"
						>
							{signature ? (
								// biome-ignore lint/performance/noImgElement: data URL kecil
								<img
									src={signature}
									alt="Pratinjau tanda tangan"
									className="max-h-24 max-w-[80%] object-contain"
								/>
							) : (
								<span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
									<ImagePlus className="size-4" /> Pilih gambar (PNG/JPG)
								</span>
							)}
						</button>
						<input
							id={fileId}
							ref={fileRef}
							type="file"
							accept="image/png,image/jpeg"
							className="hidden"
							onChange={(e) => onFile(e.target.files?.[0] ?? null)}
						/>
						{signature ? (
							<Button
								variant="ghost"
								size="xs"
								onClick={() => {
									setSignature(null);
									setReplaced(true);
								}}
							>
								Kosongkan
							</Button>
						) : null}
					</div>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={pending}>
						Batal
					</Button>
					<Button onClick={submit} disabled={pending || name.trim().length < 2}>
						{pending ? <Loader2 className="animate-spin" /> : null} Simpan
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
