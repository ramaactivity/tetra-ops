"use client";

import {
	CheckCircle2,
	ExternalLink,
	Image as ImageIcon,
	Loader2,
	UploadCloud,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { compressImage } from "@/lib/crew/image-compression";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif";

/**
 * Drive upload zone untuk item image (Aset Tetap photo).
 *
 * Cara kerja: drag-and-drop ATAU klik area → POST ke
 * /api/drive/upload/item/[itemId] → backend upload ke folder "Tetra Items"
 * di Drive + auto-set inventory_items.image_url.
 *
 * Cuma dipakai di EDIT mode (butuh itemId). Di create mode form fallback
 * ke text URL input.
 */
export function ItemImageUpload({
	itemId,
	value,
	onChange,
	disabled,
}: {
	itemId: string;
	value: string | null;
	onChange: (url: string | null) => void;
	disabled?: boolean;
}) {
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [uploading, setUploading] = useState(false);
	const [dragOver, setDragOver] = useState(false);

	async function handleFile(rawFile: File) {
		setUploading(true);
		let file = rawFile;
		try {
			file = await compressImage(rawFile);
		} catch {
			// keep original file kalau compression gagal (e.g. PDF/HEIC tanpa decoder)
			file = rawFile;
		}
		const fd = new FormData();
		fd.set("file", file);
		try {
			const res = await fetch(`/api/drive/upload/item/${itemId}`, {
				method: "POST",
				body: fd,
			});
			const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
			if (!res.ok || !json.ok || !json.url) {
				throw new Error(json.error || `HTTP ${res.status}`);
			}
			onChange(json.url);
			toast.success("Foto terupload ke Drive");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Upload gagal";
			toast.error(msg);
		} finally {
			setUploading(false);
			if (fileRef.current) fileRef.current.value = "";
		}
	}

	function pick() {
		if (disabled || uploading) return;
		fileRef.current?.click();
	}

	function clear() {
		onChange(null);
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragOver(false);
		if (disabled || uploading) return;
		const f = e.dataTransfer.files?.[0];
		if (f) handleFile(f);
	}

	return (
		<div className="space-y-2">
			<input
				ref={fileRef}
				type="file"
				accept={ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handleFile(f);
				}}
			/>

			{value ? (
				<div className="bg-surface-3 flex items-center gap-3 rounded-lg p-3">
					<div className="bg-surface-2 inline-flex size-12 shrink-0 items-center justify-center rounded-md">
						<CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium text-foreground">
							Foto sudah terupload
						</div>
						<a
							href={value}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary inline-flex items-center gap-1 truncate text-[11px] hover:underline"
						>
							<ExternalLink className="size-3" />
							Buka di Drive
						</a>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onClick={pick}
							disabled={disabled || uploading}
							className="press-down bg-surface-2 hover:bg-surface-1 inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium disabled:opacity-50"
						>
							{uploading ? (
								<Loader2 className="size-3 animate-spin" />
							) : (
								<UploadCloud className="size-3" />
							)}
							Ganti
						</button>
						<button
							type="button"
							onClick={clear}
							disabled={disabled || uploading}
							className="text-muted-foreground/60 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 inline-flex size-8 items-center justify-center rounded-md disabled:opacity-50"
							title="Hapus foto"
						>
							<X className="size-3.5" />
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={pick}
					onDragOver={(e) => {
						e.preventDefault();
						setDragOver(true);
					}}
					onDragLeave={() => setDragOver(false)}
					onDrop={handleDrop}
					disabled={disabled || uploading}
					className={`bg-surface-3 hover:bg-surface-2 group flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
						dragOver
							? "border-primary bg-primary/5"
							: "border-foreground/15 hover:border-foreground/30"
					}`}
				>
					{uploading ? (
						<>
							<Loader2 className="text-muted-foreground size-7 animate-spin" />
							<span className="text-muted-foreground text-[12px]">
								Mengupload ke Drive…
							</span>
						</>
					) : (
						<>
							<div className="bg-surface-2 group-hover:bg-surface-1 inline-flex size-11 items-center justify-center rounded-lg transition-colors">
								<ImageIcon className="text-muted-foreground size-5" />
							</div>
							<div className="space-y-0.5">
								<div className="text-sm font-medium">
									Klik atau drop foto di sini
								</div>
								<div className="text-muted-foreground text-[11px]">
									JPG, PNG, WEBP, HEIC · max 8 MB · auto-compressed
								</div>
							</div>
						</>
					)}
				</button>
			)}
		</div>
	);
}
