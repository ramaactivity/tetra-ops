"use client";

import {
	CheckCircle2,
	ExternalLink,
	Loader2,
	UploadCloud,
	X,
	XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { compressImage } from "@/lib/crew/image-compression";

const ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf";

export type RekapProofItem = {
	url: string;
	name: string;
};

/**
 * <RekapProofUpload /> — multi-file Drive upload. Reuses
 * /api/drive/upload/[projectId] with kind=rekap_proof so files are
 * auto-renamed and dropped into the event's Drive folder.
 *
 * Maintains a list of uploaded {url, name} items in component state.
 * Parent gets the URLs via onChange(urls). Crew can remove an item from
 * the list (just unlinks from form — file remains on Drive).
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
	const [lastError, setLastError] = useState<string | null>(null);

	function emit(next: RekapProofItem[]) {
		setItems(next);
		onChange(next.map((it) => it.url));
	}

	async function handleFiles(files: FileList) {
		setLastError(null);
		const filesArr = Array.from(files);
		// Sequential to avoid Drive rate limits + so seq numbers are
		// predictable. Item state is updated after each successful upload.
		for (let i = 0; i < filesArr.length; i++) {
			const rawFile = filesArr[i];
			const seq = String(items.length + i + 1).padStart(2, "0");
			setUploading((prev) => [...prev, rawFile.name]);
			let file = rawFile;
			try {
				file = await compressImage(rawFile);
			} catch {
				file = rawFile;
			}
			const fd = new FormData();
			fd.set("file", file);
			fd.set("kind", "rekap_proof");
			fd.set("seq", seq);
			try {
				const res = await fetch(`/api/drive/upload/${projectId}`, {
					method: "POST",
					body: fd,
				});
				const data = (await res.json()) as {
					ok?: boolean;
					url?: string;
					name?: string;
					error?: string;
				};
				if (!res.ok || !data.ok || !data.url) {
					const msg = data.error ?? `Upload gagal (HTTP ${res.status})`;
					setLastError(`${rawFile.name}: ${msg}`);
					toast.error(`${rawFile.name}: ${msg}`);
					continue;
				}
				const newItem: RekapProofItem = {
					url: data.url,
					name: data.name ?? rawFile.name,
				};
				setItems((prev) => {
					const next = [...prev, newItem];
					onChange(next.map((it) => it.url));
					return next;
				});
				toast.success(`✓ ${newItem.name}`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : "Upload gagal";
				setLastError(`${rawFile.name}: ${msg}`);
				toast.error(`${rawFile.name}: ${msg}`);
			} finally {
				setUploading((prev) => prev.filter((n) => n !== rawFile.name));
			}
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
				className="press-down inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border-default bg-surface-3 px-3 text-fluid-body font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
			>
				{isUploading ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<UploadCloud className="size-4" />
				)}
				{isUploading
					? `Mengunggah ${uploading.length} file…`
					: hasUploaded
						? "Tambah foto lagi"
						: "Upload foto bukti ke Drive"}
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

			{/* Uploading queue (in-progress filenames) */}
			{isUploading && (
				<ul className="space-y-1">
					{uploading.map((name) => (
						<li
							key={name}
							className="flex items-center gap-2 text-fluid-caption text-muted-foreground"
						>
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							<span className="truncate italic">{name}</span>
						</li>
					))}
				</ul>
			)}

			{lastError && (
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-fluid-caption text-destructive">
					<XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>{lastError}</span>
				</div>
			)}

			{/* Uploaded items */}
			{hasUploaded && (
				<ul className="space-y-1.5">
					{items.map((it, idx) => (
						<li
							key={`${it.url}-${idx}`}
							className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 text-fluid-caption dark:border-emerald-900 dark:bg-emerald-950/30"
						>
							<CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
							<a
								href={it.url}
								target="_blank"
								rel="noopener noreferrer"
								className="flex-1 truncate font-mono text-[11px] text-foreground hover:underline"
								title={it.name}
							>
								{it.name}
							</a>
							<a
								href={it.url}
								target="_blank"
								rel="noopener noreferrer"
								title="Buka di Drive"
								className="text-muted-foreground hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
							>
								<ExternalLink className="h-3.5 w-3.5" />
							</a>
							<button
								type="button"
								onClick={() => removeItem(idx)}
								title="Hapus dari rekap"
								className="text-muted-foreground hover:text-destructive inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</li>
					))}
				</ul>
			)}

			<p className="text-[11px] text-muted-foreground">
				Foto counter mesin / area event / consumable. Multi-file boleh. Foto
				di-kompres otomatis sebelum upload (hemat data). Auto-rename:{" "}
				<span className="font-mono">PRJ-… - REKAP - YYYY-MM-DD - NN</span>
			</p>
		</div>
	);
}
