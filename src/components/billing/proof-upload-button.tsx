"use client";

import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";

const ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf";

/**
 * Upload bukti transfer ke Drive folder event. On success, calls
 * onUploaded(url) so caller (PaymentForm) bisa auto-fill input
 * Bukti URL. File pertama-tama dikirim ke
 * POST /api/drive/upload/{projectId} sebagai multipart; route lazy-
 * create folder kalau belum ada.
 */
export type PaymentProofMeta = {
	paymentType?: string; // "dp" | "partial" | "pelunasan"
	paymentDate?: string; // ISO YYYY-MM-DD
	amount?: number; // IDR
};

export function ProofUploadButton({
	projectId,
	onUploaded,
	onFileSelected,
	disabled = false,
	meta,
}: {
	projectId: string;
	onUploaded: (url: string, fileName?: string) => void;
	/** Fired the moment a file is picked, before upload — lets the caller preview. */
	onFileSelected?: (file: File) => void;
	disabled?: boolean;
	meta?: PaymentProofMeta;
}) {
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [state, setState] = useState<
		| { phase: "idle" }
		| { phase: "uploading"; name: string }
		| { phase: "success"; name: string; renamedTo: string | null }
		| { phase: "error"; message: string }
	>({ phase: "idle" });

	function trigger() {
		if (disabled || state.phase === "uploading") return;
		fileRef.current?.click();
	}

	async function handleFile(file: File) {
		onFileSelected?.(file);
		setState({ phase: "uploading", name: file.name });
		const fd = new FormData();
		fd.set("file", file);
		fd.set("kind", "payment_proof");
		if (meta?.paymentType) fd.set("payment_type", meta.paymentType);
		if (meta?.paymentDate) fd.set("payment_date", meta.paymentDate);
		if (meta?.amount !== undefined && meta.amount > 0) {
			fd.set("amount", String(meta.amount));
		}
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
				setState({ phase: "error", message: msg });
				toast.error(msg);
				return;
			}
			setState({
				phase: "success",
				name: file.name,
				renamedTo: data.name ?? null,
			});
			toast.success(
				data.name
					? `Ter-upload sebagai "${data.name}"`
					: "Bukti ter-upload ke Drive",
			);
			onUploaded(data.url, data.name);
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
				? "Terunggah"
				: state.phase === "error"
					? "Coba lagi"
					: "Upload";

	return (
		<div className="shrink-0">
			<button
				type="button"
				onClick={trigger}
				disabled={disabled || state.phase === "uploading"}
				title="Upload bukti transfer ke Drive"
				className={`press tap inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
			>
				<Icon
					className={`size-4 ${state.phase === "uploading" ? "animate-spin" : ""}`}
				/>
				{label}
			</button>
			{state.phase === "uploading" ? (
				<p className="mt-1 truncate text-[11px] italic text-muted-foreground">
					{state.name}
				</p>
			) : state.phase === "success" ? (
				<p className="mt-1 truncate text-[11px] text-emerald-700 dark:text-emerald-400">
					{state.renamedTo ? `→ ${state.renamedTo}` : state.name}
				</p>
			) : state.phase === "error" ? (
				<p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
					{state.message}
				</p>
			) : null}
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
