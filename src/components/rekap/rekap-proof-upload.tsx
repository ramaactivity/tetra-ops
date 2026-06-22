"use client";

import {
	CheckCircle2,
	ExternalLink,
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

const ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf";

export type RekapProofItem = {
	url: string;
	name: string;
};

// A file that failed to upload — kept so crew can retry with one tap instead of
// re-picking it from the gallery (the #1 frustration on weak networks).
type FailedItem = {
	file: File;
	name: string;
	error: string;
};

/**
 * <RekapProofUpload /> — multi-file Drive upload. Reuses
 * /api/drive/upload/[projectId] with kind=rekap_proof so files are
 * auto-renamed and dropped into the event's Drive folder.
 *
 * Uploads go through uploadToDrive() which refreshes the session, times out,
 * and retries transient failures — so crew don't have to reload the app.
 * Files that still fail land in a retry queue with a one-tap "Coba lagi".
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
				const next = [...prev, { url: res.url, name: res.name }];
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

			{/* Uploaded items */}
			{hasUploaded && (
				<ul className="space-y-1.5">
					{items.map((it, idx) => (
						<li
							key={it.url}
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
				Foto counter mesin / area event / consumable. Boleh lebih dari satu.
				Otomatis dikompres biar hemat kuota & cepat.
			</p>
		</div>
	);
}
