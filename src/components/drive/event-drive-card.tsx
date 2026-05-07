"use client";

import { ExternalLink, FolderOpen, Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { createEventFolder } from "@/lib/actions/drive";

export function EventDriveCard({
	projectId,
	folderUrl: initialFolderUrl,
	folderCreatedAt,
	canEdit,
	driveConfigured,
	driveConfigMissing,
}: {
	projectId: string;
	folderUrl: string | null;
	folderCreatedAt: string | null;
	canEdit: boolean;
	driveConfigured: boolean;
	driveConfigMissing: string[];
}) {
	const [folderUrl, setFolderUrl] = useState<string | null>(initialFolderUrl);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	function handleCreate() {
		setError(null);
		startTransition(async () => {
			const r = await createEventFolder(projectId);
			if (r.error) {
				setError(r.error);
				return;
			}
			if (r.folder_url) setFolderUrl(r.folder_url);
		});
	}

	return (
		<div className="border-border-default bg-surface-2 md:col-span-2 space-y-3 rounded-xl border p-5">
			<div className="flex items-baseline justify-between gap-2">
				<div className="flex items-center gap-2">
					<FolderOpen className="text-primary h-4 w-4" />
					<h3 className="text-sm font-semibold tracking-tight">
						Drive folder event
					</h3>
				</div>
				{folderCreatedAt && folderUrl && (
					<span className="text-muted-foreground text-xs">
						Auto-created {formatRel(folderCreatedAt)}
					</span>
				)}
			</div>

			{folderUrl ? (
				<a
					href={folderUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="border-border-default bg-background hover:bg-muted text-primary flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
				>
					<span className="inline-flex items-center gap-2 truncate">
						<FolderOpen className="h-3.5 w-3.5 shrink-0" />
						<span className="truncate">Buka folder di Drive</span>
					</span>
					<ExternalLink className="h-3.5 w-3.5 shrink-0" />
				</a>
			) : (
				<div className="text-muted-foreground inline-flex items-center gap-2 text-xs">
					<Sparkles className="h-3.5 w-3.5" />
					Belum ada folder
				</div>
			)}

			{!folderUrl && canEdit && (
				<>
					{driveConfigured ? (
						<button
							type="button"
							onClick={handleCreate}
							disabled={pending}
							className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:opacity-50"
						>
							{pending ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<FolderOpen className="h-3.5 w-3.5" />
							)}
							{pending ? "Membuat folder…" : "Create Drive folder"}
						</button>
					) : (
						<div className="border-border-default bg-muted/50 rounded-md border p-3">
							<p className="text-foreground text-xs font-medium">
								Drive belum di-set di env
							</p>
							<p className="text-muted-foreground mt-0.5 text-xs">
								Missing: {driveConfigMissing.join(", ") || "konfigurasi"}.
								Jalankan{" "}
								<code className="bg-muted rounded px-1">
									node scripts/get-drive-refresh-token.mjs
								</code>{" "}
								lalu paste ke Vercel env.
							</p>
						</div>
					)}
				</>
			)}

			{error && <p className="text-destructive text-xs">{error}</p>}

			<p className="text-muted-foreground text-xs">
				Folder ini dipakai untuk simpan asset event (design brief, foto rekap,
				PDF, dll). Dibuat otomatis saat event dibuat.
			</p>
		</div>
	);
}

function formatRel(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}
