"use client";

import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog";

/**
 * <RekapProofGallery /> — owner-side photo grid for the "Bukti" tab.
 * Renders thumbnails (img with referrer-policy=no-referrer so Drive
 * webViewLink images work) and a click-to-enlarge Dialog.
 */
export function RekapProofGallery({ urls }: { urls: string[] }) {
	const [activeIdx, setActiveIdx] = useState<number | null>(null);

	if (urls.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
				Belum ada foto bukti.
			</div>
		);
	}

	const active = activeIdx !== null ? urls[activeIdx] : null;

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{urls.map((url, i) => (
					<button
						type="button"
						key={`${url}-${i}`}
						onClick={() => setActiveIdx(i)}
						className="group relative aspect-square overflow-hidden rounded-lg border border-border-default bg-surface-2 transition-colors hover:border-primary"
					>
						<ProofThumbnail url={url} />
						<div className="absolute inset-0 flex items-end justify-between gap-1 bg-black/45 p-2 opacity-0 transition-opacity group-hover:opacity-100">
							<span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
								#{i + 1}
							</span>
							<a
								href={url}
								target="_blank"
								rel="noopener noreferrer"
								onClick={(e) => e.stopPropagation()}
								className="rounded bg-white/90 p-1 text-foreground hover:bg-white"
								title="Buka di Drive"
							>
								<ExternalLink className="h-3 w-3" />
							</a>
						</div>
					</button>
				))}
			</div>

			<Dialog
				open={active !== null}
				onOpenChange={(o) => !o && setActiveIdx(null)}
			>
				<DialogContent className="max-w-3xl">
					<DialogTitle className="sr-only">
						Foto bukti rekap #{activeIdx !== null ? activeIdx + 1 : ""}
					</DialogTitle>
					{active && (
						<div className="space-y-3">
							<div className="overflow-hidden rounded-lg bg-black">
								<ProofThumbnail url={active} large />
							</div>
							<div className="flex items-center justify-between gap-2">
								<p className="font-mono text-xs text-muted-foreground">
									#{(activeIdx ?? 0) + 1} dari {urls.length}
								</p>
								<a
									href={active}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
								>
									Buka di Drive <ExternalLink className="h-3 w-3" />
								</a>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function ProofThumbnail({
	url,
	large = false,
}: {
	url: string;
	large?: boolean;
}) {
	// Drive webViewLink format: https://drive.google.com/file/d/{ID}/view?usp=…
	// Direct image render is unreliable for sharing-permission reasons, but
	// the thumbnail endpoint usually works:
	//   https://drive.google.com/thumbnail?id={ID}&sz=w400
	const driveId = extractDriveId(url);
	if (driveId) {
		const src = `https://drive.google.com/thumbnail?id=${driveId}&sz=${large ? "w1024" : "w400"}`;
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={src}
				alt="Foto bukti"
				referrerPolicy="no-referrer"
				className={
					large
						? "max-h-[70vh] w-auto object-contain"
						: "h-full w-full object-cover"
				}
				onError={(e) => {
					// If Drive thumbnail blocked, fallback to icon
					(e.target as HTMLImageElement).style.display = "none";
				}}
			/>
		);
	}
	return (
		<div className="flex h-full w-full items-center justify-center bg-surface-3 text-muted-foreground">
			<ImageIcon className="h-8 w-8" />
		</div>
	);
}

function extractDriveId(url: string): string | null {
	const m =
		url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
		url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
	return m?.[1] ?? null;
}
