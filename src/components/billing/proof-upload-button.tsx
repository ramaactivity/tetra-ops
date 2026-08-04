"use client";

import {
	CheckCircle2,
	Loader2,
	Paperclip,
	UploadCloud,
	XCircle,
} from "lucide-react";
import { useImperativeHandle, useRef, useState } from "react";
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

/**
 * Upload satu bukti (payment_proof) ke Drive folder event via API route.
 * Dipakai langsung oleh tombol (mode instan) dan oleh PaymentForm saat
 * submit (mode ditunda — file baru naik setelah klik "Log payment", supaya
 * tidak ada file yatim kalau owner batal). Throw kalau gagal.
 */
export async function uploadProofToDrive(
	projectId: string,
	file: File,
	meta?: PaymentProofMeta,
): Promise<{ url: string; name: string | null }> {
	const fd = new FormData();
	fd.set("file", file);
	fd.set("kind", "payment_proof");
	if (meta?.paymentType) fd.set("payment_type", meta.paymentType);
	if (meta?.paymentDate) fd.set("payment_date", meta.paymentDate);
	if (meta?.amount !== undefined && meta.amount > 0) {
		fd.set("amount", String(meta.amount));
	}
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
		throw new Error(data.error ?? `Upload gagal (HTTP ${res.status})`);
	}
	return { url: data.url, name: data.name ?? null };
}

/**
 * Kendali imperatif untuk entry-point lain (mis. dropzone di panel preview)
 * supaya file yang masuk lewat jalur mana pun tetap melewati state machine
 * yang sama — label tombol ("Terpilih", "Mengunggah…") jadi tidak pernah
 * desync dengan isi panel preview.
 */
export type ProofUploadHandle = {
	/** Buka file picker milik tombol ini. */
	open: () => void;
	/** Suapkan file yang sudah didapat dari luar (mis. hasil drag & drop). */
	accept: (file: File) => void;
};

export function ProofUploadButton({
	projectId,
	onUploaded,
	onFileSelected,
	disabled = false,
	deferred = false,
	meta,
	controlRef,
}: {
	projectId: string;
	onUploaded: (url: string, fileName?: string) => void;
	/** Fired the moment a file is picked, before upload — lets the caller preview. */
	onFileSelected?: (file: File) => void;
	disabled?: boolean;
	/** Pick-only: cukup teruskan file ke caller (buat preview), JANGAN upload
	    sekarang. Caller yang upload saat submit → tak ada file yatim di Drive. */
	deferred?: boolean;
	meta?: PaymentProofMeta;
	/** Beri akses ke picker/handler dari luar — lihat ProofUploadHandle. */
	controlRef?: React.Ref<ProofUploadHandle>;
}) {
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [state, setState] = useState<
		| { phase: "idle" }
		| { phase: "selected"; name: string }
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
		// Mode ditunda: berhenti di sini — file di-upload oleh caller saat submit.
		if (deferred) {
			setState({ phase: "selected", name: file.name });
			return;
		}
		setState({ phase: "uploading", name: file.name });
		try {
			const { url, name } = await uploadProofToDrive(projectId, file, meta);
			setState({ phase: "success", name: file.name, renamedTo: name });
			toast.success(
				name ? `Ter-upload sebagai "${name}"` : "Bukti ter-upload ke Drive",
			);
			onUploaded(url, name ?? undefined);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Upload gagal";
			setState({ phase: "error", message: msg });
			toast.error(msg);
		}
	}

	// Sengaja TANPA dependency array: handle harus selalu memakai closure
	// terbaru. `meta` (tipe/tanggal/nominal) berubah tiap ketikan owner, dan
	// itulah yang dipakai untuk menamai file di Drive — handle yang dibekukan
	// akan mengunggah dengan nama dari nilai lama.
	useImperativeHandle(controlRef, () => ({
		open: trigger,
		accept: (file: File) => {
			if (disabled || state.phase === "uploading") return;
			handleFile(file);
		},
	}));

	const Icon =
		state.phase === "uploading"
			? Loader2
			: state.phase === "success"
				? CheckCircle2
				: state.phase === "selected"
					? Paperclip
					: state.phase === "error"
						? XCircle
						: UploadCloud;
	const tone =
		state.phase === "success"
			? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
			: state.phase === "selected"
				? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
				: state.phase === "error"
					? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
					: "border-border-default bg-surface-2 text-foreground hover:bg-surface-3";

	const label =
		state.phase === "uploading"
			? "Mengunggah…"
			: state.phase === "success"
				? "Terunggah"
				: state.phase === "selected"
					? "Terpilih"
					: state.phase === "error"
						? "Coba lagi"
						: "Upload";

	return (
		// max-w cap: tanpa ini, nama file panjang (nowrap) memaksa kolom melebar
		// dan teksnya bocor menembus ke panel Preview di sebelahnya. Dengan batas
		// lebar, `truncate` di bawah bekerja dan teks terpotong rapi.
		<div className="max-w-[11rem] shrink-0">
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
			) : state.phase === "selected" ? (
				<p className="mt-1 truncate text-[11px] text-muted-foreground">
					{state.name} · naik saat disimpan
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
