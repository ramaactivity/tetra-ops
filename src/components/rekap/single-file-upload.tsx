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

const ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf";

/**
 * <SingleFileUpload /> — single-slot Drive upload variant. Posts to
 * /api/drive/upload/[projectId] with custom `kind` + `seq` (used as a
 * leg/label identifier, e.g. "berangkat" / "pulang" for transport).
 *
 * Re-uploading replaces the link (previous file remains on Drive). Crew
 * can clear the slot via the X button.
 */
export function SingleFileUpload({
	projectId,
	kind,
	seq,
	label,
	value,
	onChange,
	disabled,
}: {
	projectId: string;
	kind: string;
	seq?: string;
	label: string;
	value: string | null;
	onChange: (url: string | null) => void;
	disabled?: boolean;
}) {
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [uploading, setUploading] = useState(false);
	const [lastError, setLastError] = useState<string | null>(null);

	async function handleFile(file: File) {
		setLastError(null);
		setUploading(true);
		const fd = new FormData();
		fd.set("file", file);
		fd.set("kind", kind);
		if (seq) fd.set("seq", seq);
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
				setLastError(msg);
				toast.error(`${label}: ${msg}`);
				return;
			}
			onChange(data.url);
			toast.success(`✓ ${label} tersimpan`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Upload gagal";
			setLastError(msg);
			toast.error(`${label}: ${msg}`);
		} finally {
			setUploading(false);
		}
	}

	const hasFile = Boolean(value);

	return (
		<div className="space-y-2">
			<p className="text-xs font-medium text-foreground/80">{label}</p>
			{hasFile ? (
				<div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
					<CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
					<a
						href={value ?? "#"}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 truncate font-mono text-[11px] text-foreground hover:underline"
					>
						Bukti tersimpan
					</a>
					<a
						href={value ?? "#"}
						target="_blank"
						rel="noopener noreferrer"
						title="Buka di Drive"
						className="text-muted-foreground hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
					>
						<ExternalLink className="h-3.5 w-3.5" />
					</a>
					<button
						type="button"
						onClick={() => fileRef.current?.click()}
						disabled={disabled || uploading}
						className="text-muted-foreground hover:text-primary inline-flex h-7 px-2 items-center justify-center rounded-md text-[10px] font-medium transition-colors disabled:opacity-50"
					>
						Replace
					</button>
					<button
						type="button"
						onClick={() => onChange(null)}
						disabled={disabled || uploading}
						title="Hapus"
						className="text-muted-foreground hover:text-destructive inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					disabled={disabled || uploading}
					className="press-down inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-default bg-surface-3 px-3 text-fluid-caption font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
				>
					{uploading ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<UploadCloud className="size-4" />
					)}
					{uploading ? "Mengunggah…" : `Upload ${label.toLowerCase()}`}
				</button>
			)}

			<input
				ref={fileRef}
				type="file"
				accept={ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) void handleFile(f);
					e.currentTarget.value = "";
				}}
			/>

			{lastError && (
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-fluid-caption text-destructive">
					<XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>{lastError}</span>
				</div>
			)}
		</div>
	);
}
