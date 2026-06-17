"use client";

import { FileText, ImageIcon, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { FileDrop } from "@/components/ui/file-drop";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
	MANUAL_CATEGORY_PRESETS,
	MANUAL_UPLOAD_ACCEPT,
	MANUAL_UPLOAD_MAX_BYTES,
} from "@/lib/arsip-nota/types";
import { compressImage } from "@/lib/crew/image-compression";
import { formatRupiah } from "@/lib/format";

/** Modal upload nota manual. File di-kompres (image) sebelum dikirim. */
export function UploadNotaModal() {
	const router = useRouter();
	const formId = useId();
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const [category, setCategory] = useState("");
	const [notaDate, setNotaDate] = useState("");
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	// Buat object URL untuk preview gambar; revoke saat ganti / unmount.
	useEffect(() => {
		if (file && file.type.startsWith("image/")) {
			const url = URL.createObjectURL(file);
			setPreviewUrl(url);
			return () => URL.revokeObjectURL(url);
		}
		setPreviewUrl(null);
	}, [file]);

	function reset() {
		setCategory("");
		setNotaDate("");
		setAmount("");
		setDescription("");
		setFile(null);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!category.trim()) return toast.error("Kategori wajib diisi");
		if (!description.trim()) return toast.error("Keterangan wajib diisi");
		if (!file) return toast.error("File nota wajib di-upload");

		setSubmitting(true);
		try {
			// Kompres gambar (PDF & file kecil dilewati otomatis).
			const prepared = await compressImage(file);
			if (prepared.size > MANUAL_UPLOAD_MAX_BYTES) {
				toast.error(
					"File masih > 8 MB setelah kompres. Coba file lebih kecil.",
				);
				setSubmitting(false);
				return;
			}

			const fd = new FormData();
			fd.set("file", prepared);
			fd.set("category", category.trim());
			fd.set("description", description.trim());
			if (notaDate) fd.set("nota_date", notaDate);
			if (amount) fd.set("amount", amount);

			const res = await fetch("/api/drive/upload/manual", {
				method: "POST",
				body: fd,
			});
			const data = (await res.json()) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) {
				toast.error(data.error ?? "Upload gagal");
				setSubmitting(false);
				return;
			}

			toast.success("Nota tersimpan & ter-rename rapi di Drive");
			reset();
			setOpen(false);
			router.refresh();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Upload gagal");
		} finally {
			setSubmitting(false);
		}
	}

	const amountNum = amount ? Number(amount) : null;

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!submitting) setOpen(o);
			}}
		>
			<DialogTrigger className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#059669] dark:bg-[#0b9e6a] px-3 text-sm font-medium text-white transition-colors hover:bg-[#047857] dark:hover:bg-[#059669]">
				<Upload className="size-4" aria-hidden />
				Upload Nota
			</DialogTrigger>
			<DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Upload Nota Manual</DialogTitle>
					<DialogDescription>
						Nota di luar sistem (belanja pasar, operasional, dll). File otomatis
						di-rename rapi & disimpan ke Drive folder bulanan.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{/* ── Kiri: form ── */}
						<div className="space-y-4">
							<div className="space-y-1.5">
								<label
									htmlFor={`${formId}-cat`}
									className="block text-[13px] font-medium text-foreground"
								>
									Kategori <span className="text-destructive">*</span>
								</label>
								<Input
									id={`${formId}-cat`}
									list={`${formId}-cat-list`}
									value={category}
									onChange={(e) => setCategory(e.target.value)}
									placeholder="Pilih atau ketik sendiri…"
									required
								/>
								<datalist id={`${formId}-cat-list`}>
									{MANUAL_CATEGORY_PRESETS.map((c) => (
										<option key={c} value={c} />
									))}
								</datalist>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<label
										htmlFor={`${formId}-date`}
										className="block text-[13px] font-medium text-foreground"
									>
										Tanggal Nota
									</label>
									<DatePicker
										id={`${formId}-date`}
										value={notaDate}
										onValueChange={setNotaDate}
										placeholder="Pilih tanggal"
									/>
								</div>

								<div className="space-y-1.5">
									<label
										htmlFor={`${formId}-amount`}
										className="block text-[13px] font-medium text-foreground"
									>
										Nominal (opsional)
									</label>
									<Input
										id={`${formId}-amount`}
										type="number"
										inputMode="numeric"
										min={0}
										value={amount}
										onChange={(e) => setAmount(e.target.value)}
										placeholder="Rp"
									/>
								</div>
							</div>

							<div className="space-y-1.5">
								<label
									htmlFor={`${formId}-desc`}
									className="block text-[13px] font-medium text-foreground"
								>
									Keterangan <span className="text-destructive">*</span>
								</label>
								<Input
									id={`${formId}-desc`}
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder='Contoh: "Belanja kopi & gula @Pak Slamet"'
									maxLength={200}
									required
								/>
							</div>

							<div className="space-y-1.5">
								<span className="block text-[13px] font-medium text-foreground">
									Foto / File Nota <span className="text-destructive">*</span>
								</span>
								<FileDrop
									accept={MANUAL_UPLOAD_ACCEPT}
									maxSizeBytes={MANUAL_UPLOAD_MAX_BYTES}
									hint="JPG / PNG / PDF · maks 8 MB (gambar otomatis dikompres)"
									onFileChange={(f) => setFile(f)}
								/>
							</div>
						</div>

						{/* ── Kanan: preview ── */}
						<div className="space-y-1.5">
							<span className="block text-[13px] font-medium text-foreground">
								Preview Nota
							</span>
							<div className="flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-border-default bg-secondary/30">
								{previewUrl ? (
									// biome-ignore lint/performance/noImgElement: blob preview, not a remote asset
									<img
										src={previewUrl}
										alt="Preview nota"
										className="max-h-[340px] w-full flex-1 object-contain"
									/>
								) : file ? (
									<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
										<FileText
											className="size-10 text-muted-foreground"
											aria-hidden
										/>
										<p className="text-sm font-medium text-foreground">
											{file.name}
										</p>
										<p className="text-xs text-muted-foreground">
											PDF tidak bisa di-preview di sini — akan tersimpan utuh.
										</p>
									</div>
								) : (
									<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
										<ImageIcon
											className="size-10 text-muted-foreground/60"
											aria-hidden
										/>
										<p className="text-sm text-muted-foreground">
											Pilih file di kiri — preview & nominal muncul di sini biar
											nggak salah upload.
										</p>
									</div>
								)}

								{file ? (
									<div className="flex items-center justify-between gap-2 border-t border-border-default bg-card px-3 py-2">
										<span className="truncate text-xs text-muted-foreground">
											{(file.size / 1024).toFixed(0)} KB
										</span>
										<span className="text-sm font-medium tabular text-foreground">
											{amountNum && amountNum > 0
												? formatRupiah(amountNum)
												: "Nominal —"}
										</span>
									</div>
								) : null}
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={submitting}
						>
							Batal
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? "Mengupload…" : "Upload Nota"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
