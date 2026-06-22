"use client";

import {
	FileText,
	Loader2,
	RotateCw,
	UploadCloud,
	X,
	XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { compressImage } from "@/lib/crew/image-compression";
import { uploadToDrive } from "@/lib/crew/upload";
import { driveThumbnailUrl } from "@/lib/drive/thumbnail";

const ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf";

export type RekapProofItem = {
	url: string;
	name: string;
	id?: string;
};

// A file that failed to upload — kept so crew can retry with one tap instead of
// re-picking it from the gallery (the #1 frustration on weak networks).
type FailedItem = {
	file: File;
	name: string;
	error: string;
};

/**
 * <RekapProofUpload /> — multi-file Drive upload with thumbnail previews.
 *
 * Reuses /api/drive/upload/[projectId] with kind=rekap_proof so files are
 * auto-renamed and dropped into the event's Drive folder. Uploads go through
 * uploadToDrive() (session refresh + timeout + retry). Uploaded photos render
 * as a thumbnail grid (tap to zoom) so crew can confirm they sent the right
 * shot; files that still fail land in a retry queue with one-tap "Coba lagi".
 */
export function RekapProofUpload({
	projectId,
	initial = [],
	onChange,
	disabled,
}: {
	projectId: string;
	initial?: RekapProofItem[];
	onChange: (urls: string[]) => void;
	disabled?: boolean;
}) {
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [items, setItems] = useState<RekapProofItem[]>(initial);
	const [uploading, setUploading] = useState<string[]>([]); // filenames currently uploading
	const [failed, setFailed] = useState<FailedItem[]>([]);
	const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null);

	function emit(next: RekapProofItem[]) {
		setItems(next);
		onChange(next.map((it) => it.url));
	}

	// Upload one already-compressed-or-raw file. Returns true on success.
	async function uploadOne(file: File, displayName: string): Promise<boolean> {
		// seq is best-effort ordering for the Drive filename; computed from the
		// current count so concurrent retries don't all claim "01".
		const seq = String(items.length + 1).padStart(2, "0");
		const res = await uploadToDrive(projectId, file, {
			kind: "rekap_proof",
			seq,
		});
		if (res.ok) {
			setItems((prev) => {
				const next = [...prev, { url: res.url, name: res.name, id: res.id }];
				onChange(next.map((it) => it.url));
				return next;
			});
			toast.success(`✓ ${res.name}`);
			return true;
		}
		setFailed((prev) => [
			...prev.filter((f) => f.name !== displayName),
			{ file, name: displayName, error: res.error },
		]);
		toast.error(`${displayName}: ${res.error}`);
		return false;
	}

	async function handleFiles(files: FileList) {
		const filesArr = Array.from(files);
		// Sequential to avoid Drive rate limits + keep seq numbers predictable.
		for (const rawFile of filesArr) {
			setUploading((prev) => [...prev, rawFile.name]);
			let file = rawFile;
			try {
				file = await compressImage(rawFile);
			} catch {
				file = rawFile;
			}
			try {
				await uploadOne(file, rawFile.name);
			} finally {
				setUploading((prev) => prev.filter((n) => n !== rawFile.name));
			}
		}
	}

	async function retryFailed(target: FailedItem) {
		setFailed((prev) => prev.filter((f) => f.name !== target.name));
		setUploading((prev) => [...prev, target.name]);
		try {
			await uploadOne(target.file, target.name);
		} finally {
			setUploading((prev) => prev.filter((n) => n !== target.name));
		}
	}

	function removeItem(idx: number) {
		const next = items.filter((_, i) => i !== idx);
		emit(next);
	}

	const isUploading = uploading.length > 0;
	const hasUploaded = items.length > 0;

	return (
		<div className="space-y-3">
			<button
				type="button"
				onClick={() => fileRef.current?.click()}
				disabled={disabled || isUploading}
				className="press-down inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-3 px-3 text-fluid-body font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isUploading ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<UploadCloud className="size-4" />
				)}
				{isUploading
					? `Mengunggah ${uploading.length} foto…`
					: hasUploaded
						? "Tambah foto lagi"
						: "Upload foto bukti"}
			</button>

			<input
				ref={fileRef}
				type="file"
				accept={ACCEPT}
				multiple
				className="hidden"
				onChange={(e) => {
					const fs = e.target.files;
					if (fs && fs.length > 0) {
						void handleFiles(fs);
					}
					e.currentTarget.value = "";
				}}
			/>

			{/* Thumbnail grid — uploaded photos + in-progress placeholder tiles */}
			{(hasUploaded || isUploading) && (
				<ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
					{items.map((it, idx) => (
						<Thumb
							key={it.url}
							item={it}
							onZoom={() => {
								const big = driveThumbnailUrl(it.id ?? it.url, 1200);
								if (big) setZoom({ url: big, name: it.name });
								else window.open(it.url, "_blank", "noopener,noreferrer");
							}}
							onRemove={() => removeItem(idx)}
						/>
					))}
					{uploading.map((name) => (
						<li
							key={`uploading-${name}`}
							className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border-default bg-surface-3"
						>
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</li>
					))}
				</ul>
			)}

			{/* Failed uploads — retry without re-picking from gallery */}
			{failed.length > 0 && (
				<ul className="space-y-1.5">
					{failed.map((f) => (
						<li
							key={f.name}
							className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-fluid-caption text-destructive"
						>
							<XCircle className="h-4 w-4 shrink-0" />
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium text-foreground">
									{f.name}
								</span>
								<span className="block truncate text-[11px]">{f.error}</span>
							</span>
							<button
								type="button"
								onClick={() => void retryFailed(f)}
								disabled={isUploading}
								className="press-down inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-50"
							>
								<RotateCw className="h-3.5 w-3.5" />
								Coba lagi
							</button>
						</li>
					))}
				</ul>
			)}

			<p className="text-[11px] text-muted-foreground">
				Foto counter mesin / area event / consumable. Boleh lebih dari satu.
				Otomatis dikompres biar hemat kuota & cepat.
			</p>

			{/* Lightbox — tap a thumbnail to verify the shot full-size */}
			{zoom && (
				<button
					type="button"
					onClick={() => setZoom(null)}
					className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4 backdrop-blur-sm"
					aria-label="Tutup preview"
				>
					{/* biome-ignore lint/performance/noImgElement: external Drive thumbnail, dynamic URL — next/image would need remote-pattern config + optimization cost for a throwaway proof preview */}
					<img
						src={zoom.url}
						alt={zoom.name}
						className="max-h-[80vh] max-w-full rounded-lg object-contain"
					/>
					<span className="max-w-full truncate text-center font-mono text-[11px] text-white/80">
						{zoom.name}
					</span>
					<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-medium text-white">
						<X className="size-3.5" /> Tutup
					</span>
				</button>
			)}
		</div>
	);
}

/** A single proof thumbnail tile. Falls back to a file icon if Drive's
 * thumbnail can't render (e.g. brand-new file still processing, or a PDF). */
function Thumb({
	item,
	onZoom,
	onRemove,
}: {
	item: RekapProofItem;
	onZoom: () => void;
	onRemove: () => void;
}) {
	const [broken, setBroken] = useState(false);
	const thumb = driveThumbnailUrl(item.id ?? item.url, 400);

	return (
		<li className="group relative aspect-square overflow-hidden rounded-lg border border-emerald-200 bg-surface-3 dark:border-emerald-900">
			<button
				type="button"
				onClick={onZoom}
				className="press-down block h-full w-full"
				title={item.name}
			>
				{thumb && !broken ? (
					// biome-ignore lint/performance/noImgElement: external Drive thumbnail, dynamic URL — next/image would need remote-pattern config + optimization cost for a throwaway proof preview
					<img
						src={thumb}
						alt={item.name}
						loading="lazy"
						onError={() => setBroken(true)}
						className="h-full w-full object-cover"
					/>
				) : (
					<span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
						<FileText className="size-6" />
						<span className="px-1 text-center text-[9px] leading-tight">
							Lihat
						</span>
					</span>
				)}
			</button>
			<button
				type="button"
				onClick={onRemove}
				title="Hapus dari rekap"
				className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-destructive"
			>
				<X className="size-3.5" />
			</button>
		</li>
	);
}
