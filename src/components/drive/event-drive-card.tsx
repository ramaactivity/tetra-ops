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
		<div className="border-border-default bg-card md:col-span-2 space-y-4 rounded-2xl border p-5 shadow-[var(--shadow-level-2)]">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<FolderOpen className="text-primary size-4" />
					<h3 className="type-heading">Drive folder event</h3>
				</div>
				{folderCreatedAt && folderUrl && (
					<span className="type-caption shrink-0">
						Auto-created {formatRel(folderCreatedAt)}
					</span>
				)}
			</div>

			{folderUrl ? (
				<>
					<a
						href={folderUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="press tap text-primary flex h-11 items-center justify-between gap-2 rounded-xl border border-border-default bg-background px-3.5 text-sm font-medium transition-colors active:bg-surface-3"
					>
						<span className="inline-flex items-center gap-2 truncate">
							<FolderOpen className="size-4 shrink-0" />
							<span className="truncate">Buka folder di Drive</span>
						</span>
						<ExternalLink className="size-4 shrink-0" />
					</a>
					<p className="type-caption">
						Folder ini dipakai untuk simpan asset event (design brief, foto
						rekap, PDF, dll).
					</p>
				</>
			) : (
				<div className="rounded-2xl border border-dashed border-border-default bg-surface-3/50 p-5">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0">
							<p className="type-body-strong flex items-center gap-2">
								<Sparkles className="size-4 shrink-0 text-muted-foreground" />
								Belum ada folder
							</p>
							<p className="type-secondary mt-1.5 max-w-md">
								Folder buat simpan asset event (design brief, foto rekap, PDF,
								dll). Biasanya dibuat otomatis saat event dibuat.
							</p>
						</div>
						{canEdit && driveConfigured && (
							<button
								type="button"
								onClick={handleCreate}
								disabled={pending}
								className="press tap inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 dark:bg-emerald-500 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50"
							>
								{pending ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<FolderOpen className="size-4" />
								)}
								{pending ? "Membuat folder…" : "Buat Drive folder"}
							</button>
						)}
					</div>

					{canEdit && !driveConfigured && (
						<div className="mt-4 rounded-xl border border-border-default bg-muted/50 p-3">
							<p className="type-label text-foreground">
								Drive belum di-set di env
							</p>
							<p className="type-caption mt-1">
								Missing: {driveConfigMissing.join(", ") || "konfigurasi"}.
								Jalankan{" "}
								<code className="rounded bg-muted px-1">
									node scripts/get-drive-refresh-token.mjs
								</code>{" "}
								lalu paste ke Vercel env.
							</p>
						</div>
					)}
				</div>
			)}

			{error && <p className="text-destructive text-xs">{error}</p>}
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
