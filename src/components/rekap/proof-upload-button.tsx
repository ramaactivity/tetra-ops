"use client";

import { CheckCircle2, ExternalLink, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";

/**
 * Tombol upload bukti transfer/nota ke folder Drive event — satu komponen untuk
 * semua jenis bukti di halaman rekap (komisi, transaksi lain, dst).
 *
 * File-nya di-rename otomatis di server sesuai `kind` (lihat
 * src/lib/drive/naming.ts); `meta` cuma bahan namanya. Selalu opsional: kalau
 * tidak diisi, transaksinya tetap bisa disimpan.
 */
export function ProofUploadButton({
	projectId,
	kind,
	meta,
	url,
	onChange,
	label = "Bukti transfer (opsional)",
	disabled,
}: {
	projectId: string;
	/** Jenis bukti — menentukan pola nama file & folder di Drive. */
	kind: "commission" | "event_txn";
	meta?: { name?: string | null; role?: string | null; amount?: number | null };
	url: string | null;
	onChange: (url: string | null) => void;
	label?: string;
	disabled?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		setUploading(true);
		try {
			const fd = new FormData();
			fd.set("file", files[0]);
			fd.set("kind", kind);
			if (meta?.name) fd.set("crew_name", meta.name);
			if (meta?.role) fd.set("role", meta.role);
			fd.set("payment_date", new Date().toISOString().slice(0, 10));
			fd.set("amount", String(meta?.amount ?? 0));
			const res = await fetch(`/api/drive/upload/${projectId}`, {
				method: "POST",
				body: fd,
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(text || `HTTP ${res.status}`);
			}
			const { url: uploadedUrl, name } = (await res.json()) as {
				url: string;
				name?: string;
			};
			onChange(uploadedUrl);
			toast.success(name ? `Bukti tersimpan: ${name}` : "Bukti ter-upload");
		} catch (err) {
			toast.error(
				`Upload gagal: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		} finally {
			setUploading(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	return (
		<div className="space-y-1">
			<span className="block text-xs font-medium text-muted-foreground">
				{label}
			</span>
			<input
				ref={inputRef}
				type="file"
				accept="image/*,application/pdf"
				className="hidden"
				onChange={(e) => handleFiles(e.target.files)}
				disabled={disabled || uploading}
			/>
			{url ? (
				<div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
					<CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 truncate text-emerald-900 hover:underline dark:text-emerald-200"
					>
						Lihat bukti
					</a>
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
					>
						<ExternalLink className="h-3 w-3" />
					</a>
					<button
						type="button"
						onClick={() => onChange(null)}
						className="text-emerald-700 hover:text-rose-700 dark:text-emerald-300"
						aria-label="Hapus bukti"
					>
						<X className="h-3 w-3" />
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					disabled={disabled || uploading}
					className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-default bg-surface-1 px-3 text-xs text-muted-foreground hover:border-border-strong hover:bg-surface-3 disabled:opacity-50"
				>
					{uploading ? (
						<>
							<Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
						</>
					) : (
						<>
							<Upload className="h-3.5 w-3.5" /> Upload bukti
						</>
					)}
				</button>
			)}
		</div>
	);
}
