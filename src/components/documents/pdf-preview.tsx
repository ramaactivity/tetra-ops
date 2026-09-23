"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Preview PDF live. Draft dikirim ke /api/pdf/document/preview (renderer yang
 * sama dengan unduhan final) → blob → iframe. Debounce supaya ketikan cepat
 * tidak memicu render bertubi-tubi; request lama dibatalkan saat ada yang baru.
 */
export function PdfPreview({
	draft,
	className,
}: {
	draft: unknown;
	className?: string;
}) {
	const [url, setUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const key = JSON.stringify(draft);

	useEffect(() => {
		const timer = setTimeout(async () => {
			abortRef.current?.abort();
			const ctrl = new AbortController();
			abortRef.current = ctrl;
			setLoading(true);
			try {
				const res = await fetch("/api/pdf/document/preview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: key,
					signal: ctrl.signal,
				});
				if (!res.ok) throw new Error(`Preview gagal (${res.status})`);
				const blob = await res.blob();
				const next = URL.createObjectURL(blob);
				setUrl((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return next;
				});
				setError(null);
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					setError(e instanceof Error ? e.message : "Preview gagal");
				}
			} finally {
				if (!ctrl.signal.aborted) setLoading(false);
			}
		}, 650);
		return () => clearTimeout(timer);
	}, [key]);

	useEffect(() => () => abortRef.current?.abort(), []);

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl border border-border-subtle bg-[#5b5b57] shadow-[var(--shadow-level-2)]",
				className,
			)}
		>
			{url ? (
				<iframe
					title="Preview PDF"
					src={`${url}#toolbar=0&navpanes=0&view=FitH`}
					className="block h-full w-full"
				/>
			) : (
				<div className="flex h-full items-center justify-center text-sm text-white/70">
					{error ?? "Menyiapkan preview…"}
				</div>
			)}
			<div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2">
				<span
					className={cn(
						"inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur transition-opacity",
						loading ? "opacity-100" : "opacity-0",
					)}
				>
					<Loader2 className="size-3 animate-spin" />
					Memperbarui…
				</span>
				{url ? (
					<a
						href={url}
						target="_blank"
						rel="noreferrer"
						className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur hover:bg-black/80"
					>
						<ExternalLink className="size-3" />
						Buka
					</a>
				) : null}
			</div>
			{error && url ? (
				<div className="absolute inset-x-0 bottom-0 bg-rose-600/90 px-3 py-1.5 text-[12px] text-white">
					{error}
				</div>
			) : null}
		</div>
	);
}
