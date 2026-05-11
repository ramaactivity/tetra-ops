"use client";

import {
	CheckCircle2,
	Loader2,
	UploadCloud,
	XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf";

/**
 * Upload bukti transfer ke Drive folder event. On success, calls
 * onUploaded(url) so caller (PaymentForm) bisa auto-fill input
 * Bukti URL. File pertama-tama dikirim ke
 * POST /api/drive/upload/{projectId} sebagai multipart; route lazy-
 * create folder kalau belum ada.
 */
export function ProofUploadButton({
	projectId,
	onUploaded,
	disabled = false,
}: {
	projectId: string;
	onUploaded: (url: string) => void;
	disabled?: boolean;
}) {
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [state, setState] = useState<
		| { phase: "idle" }
		| { phase: "uploading"; name: string }
		| { phase: "success"; name: string }
		| { phase: "error"; message: string }
	>({ phase: "idle" });

	function trigger() {
		if (disabled || state.phase === "uploading") return;
		fileRef.current?.click();
	}

	async function handleFile(file: File) {
		setState({ phase: "uploading", name: file.name });
		const fd = new FormData();
		fd.set("file", file);
		try {
			const res = await fetch(`/api/drive/upload/${projectId}`, {
				method: "POST",
				body: fd,
			});
			const data = (await res.json()) as {
				ok?: boolean;
				url?: string;
				error?: string;
			};
			if (!res.ok || !data.ok || !data.url) {
				const msg = data.error ?? `Upload gagal (HTTP ${res.status})`;
				setState({ phase: "error", message: msg });
				toast.error(msg);
				return;
			}
			setState({ phase: "success", name: file.name });
			toast.success("Bukti ter-upload ke Drive");
			onUploaded(data.url);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Upload gagal";
			setState({ phase: "error", message: msg });
			toast.error(msg);
		}
	}

	const Icon =
		state.phase === "uploading"
			? Loader2
			: state.phase === "success"
				? CheckCircle2
				: state.phase === "error"
					? XCircle
					: UploadCloud;
	const tone =
		state.phase === "success"
			? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
			: state.phase === "error"
				? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
				: "border-border-default bg-surface-2 text-foreground hover:bg-surface-3";

	const label =
		state.phase === "uploading"
			? "Mengunggah…"
			: state.phase === "success"
				? "Bukti ter-upload"
				: state.phase === "error"
					? "Coba lagi"
					: "Upload bukti ke Drive";

	return (
		<div className="space-y-1">
			<button
				type="button"
				onClick={trigger}
				disabled={disabled || state.phase === "uploading"}
				className={`press-down inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border px-3 text-fluid-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${tone}`}
			>
				<Icon
					className={`size-4 ${state.phase === "uploading" ? "animate-spin" : ""}`}
				/>
				{label}
			</button>
			{state.phase === "uploading" || state.phase === "success" ? (
				<p className="text-[11px] text-muted-foreground italic truncate">
					{state.name}
				</p>
			) : state.phase === "error" ? (
				<p className="text-[11px] text-rose-700 dark:text-rose-300">
					{state.message}
				</p>
			) : (
				<p className="text-[11px] text-muted-foreground">
					JPG / PNG / WEBP / HEIC / PDF · max 8 MB
				</p>
			)}
			<input
				ref={fileRef}
				type="file"
				accept={ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) {
						handleFile(f);
					}
					// Reset so same file can be re-picked
					e.currentTarget.value = "";
				}}
			/>
		</div>
	);
}
