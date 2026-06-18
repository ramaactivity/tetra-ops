"use client";

import {
	Copy,
	Download,
	ExternalLink,
	Film,
	FolderOpen,
	Image as ImageIcon,
	Loader2,
	type LucideIcon,
	Palette,
	Pencil,
	Plus,
	Trash2,
	Upload,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	addEventAsset,
	addUploadedDesignAsset,
	deleteEventAsset,
	updateEventAsset,
} from "@/lib/actions/event-assets";
import type { AssetType } from "@/lib/event-assets/types";
import { cn } from "@/lib/utils";

const INPUT_CLASS =
	"w-full rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40";

export type AssetRow = {
	id: string;
	asset_type: AssetType;
	label: string;
	url: string;
	notes: string | null;
	drive_file_id: string | null;
	uploaded_by: string | null;
	uploaded_by_name: string | null;
	created_at: string;
};

const META: Record<
	AssetType,
	{ label: string; icon: LucideIcon; placeholder: string; addLabel: string }
> = {
	design_frame: {
		label: "Design Frames",
		icon: Palette,
		placeholder: "Mockup R1 (Figma)",
		addLabel: "Tambah link",
	},
	footage_crew: {
		label: "Footage Crew",
		icon: Film,
		placeholder: "Raw footage event 1 Mei",
		addLabel: "Tambah link",
	},
	softfile: {
		label: "Softfile",
		icon: ImageIcon,
		placeholder: "Google Drive / Fotoshare",
		addLabel: "Tambah link",
	},
};

function downloadUrl(fileId: string): string {
	return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

interface AssetSectionProps {
	eventId: string;
	projectId: string;
	assetType: AssetType;
	rows: AssetRow[];
	canEdit: boolean;
	/** Drive folder for this category (footage redirect / open folder). */
	folderUrl?: string | null;
	/** File count in the Drive folder (footage status). */
	folderFileCount?: number | null;
}

export function AssetSection({
	projectId,
	assetType,
	rows,
	canEdit,
	folderUrl,
	folderFileCount,
}: AssetSectionProps) {
	const meta = META[assetType];
	const Icon = meta.icon;
	const isDesign = assetType === "design_frame";
	const isFootage = assetType === "footage_crew";
	const folderLabel = isFootage ? "Footage" : "Softfile";

	const [showAdd, setShowAdd] = useState(false);
	const [editing, setEditing] = useState<AssetRow | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const [uploading, setUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	async function handleAdd(formData: FormData) {
		formData.set("asset_type", assetType);
		startTransition(async () => {
			const res = await addEventAsset(projectId, formData);
			if (!res.ok) toast.error(res.error);
			else {
				toast.success(`${meta.label} ditambahkan`);
				setShowAdd(false);
			}
		});
	}

	async function handleUpdate(id: string, formData: FormData) {
		startTransition(async () => {
			const res = await updateEventAsset(id, formData);
			if (!res.ok) toast.error(res.error);
			else {
				toast.success("Asset diupdate");
				setEditing(null);
			}
		});
	}

	function handleDelete(id: string) {
		startTransition(async () => {
			const res = await deleteEventAsset(id);
			if (!res.ok) toast.error(res.error);
			else {
				toast.success("Asset dihapus");
				setConfirmDeleteId(null);
			}
		});
	}

	async function copyLink(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Link disalin");
		} catch {
			toast.error("Gagal menyalin link");
		}
	}

	async function handleFile(file: File) {
		setUploading(true);
		try {
			const fd = new FormData();
			fd.set("file", file);
			fd.set("kind", "design_frame");
			const res = await fetch(`/api/drive/upload/${projectId}`, {
				method: "POST",
				body: fd,
			});
			const json = (await res.json()) as {
				ok?: boolean;
				url?: string;
				id?: string;
				name?: string;
				error?: string;
			};
			if (!res.ok || !json.ok || !json.url || !json.id) {
				toast.error(json.error ?? "Upload gagal");
				return;
			}
			const save = await addUploadedDesignAsset(projectId, {
				url: json.url,
				fileId: json.id,
				name: json.name ?? file.name,
			});
			if (!save.ok) toast.error(save.error);
			else toast.success("Design frame di-upload ke Drive");
		} catch {
			toast.error("Upload gagal");
		} finally {
			setUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	const countLabel = isFootage
		? folderFileCount != null
			? `${folderFileCount} file di Drive`
			: `${rows.length} link`
		: `${rows.length} ${isDesign ? "file/link" : "link"}`;

	return (
		<section className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
			<header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
				<div className="flex items-center gap-2.5">
					<div className="grid size-9 place-items-center rounded-xl border border-border-default bg-card text-foreground">
						<Icon className="size-4" aria-hidden />
					</div>
					<div>
						<h3 className="text-[15px] font-semibold tracking-tight text-foreground">
							{meta.label}
						</h3>
						<p className="text-[11px] text-muted-foreground">{countLabel}</p>
					</div>
				</div>
				{canEdit && (
					<div className="flex items-center gap-1.5">
						{isDesign && (
							<>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/png,image/jpeg,image/webp,application/pdf"
									hidden
									onChange={(e) => {
										const f = e.target.files?.[0];
										if (f) void handleFile(f);
									}}
								/>
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									disabled={uploading}
									className={cn(buttonVariants({ size: "sm" }))}
								>
									{uploading ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<Upload className="size-3.5" />
									)}
									{uploading ? "Upload…" : "Upload"}
								</button>
							</>
						)}
						<button
							type="button"
							onClick={() => setShowAdd((v) => !v)}
							className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
						>
							<Plus className="size-3.5" />
							{showAdd ? "Batal" : meta.addLabel}
						</button>
					</div>
				)}
			</header>

			{/* Auto Drive folder (Footage / Softfile): open + copy link for WhatsApp */}
			{folderUrl && (
				<div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
					<a
						href={folderUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
					>
						<FolderOpen className="size-4 shrink-0" />
						<span className="truncate">Buka folder {folderLabel}</span>
						<ExternalLink className="size-3.5 shrink-0" />
					</a>
					<button
						type="button"
						onClick={() => copyLink(folderUrl)}
						className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
						title="Copy link folder"
					>
						<Copy className="size-3.5" />
						Copy
					</button>
				</div>
			)}

			{showAdd && canEdit ? (
				<form
					action={handleAdd}
					className="space-y-2.5 border-b border-border-subtle px-4 py-3.5"
				>
					<div className="grid gap-2.5 sm:grid-cols-2">
						<label className="space-y-1">
							<span className="text-[11px] font-medium text-muted-foreground">
								Label
							</span>
							<input
								name="label"
								required
								placeholder={meta.placeholder}
								className={INPUT_CLASS}
							/>
						</label>
						<label className="space-y-1">
							<span className="text-[11px] font-medium text-muted-foreground">
								URL
							</span>
							<input
								name="url"
								type="url"
								required
								placeholder="https://drive.google.com/..."
								className={INPUT_CLASS}
							/>
						</label>
					</div>
					<label className="block space-y-1">
						<span className="text-[11px] font-medium text-muted-foreground">
							Catatan (opsional)
						</span>
						<input
							name="notes"
							placeholder="Versi, catatan revisi, atau info lainnya"
							className={INPUT_CLASS}
						/>
					</label>
					<div className="flex justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={() => setShowAdd(false)}
							className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending}
							className={cn(buttonVariants({ size: "sm" }))}
						>
							{pending ? "Menyimpan..." : "Simpan"}
						</button>
					</div>
				</form>
			) : null}

			<ul className="divide-y divide-border-subtle">
				{rows.length === 0 ? (
					<li className="px-4 py-6 text-center text-fluid-caption text-muted-foreground italic">
						{isFootage
							? "Footage di-upload langsung di Google Drive lewat tombol di atas."
							: `Belum ada ${meta.label.toLowerCase()}.${canEdit ? " Klik tombol di atas untuk mulai." : ""}`}
					</li>
				) : (
					rows.map((row) =>
						editing?.id === row.id ? (
							<li key={row.id} className="px-4 py-3">
								<form
									action={(fd) => handleUpdate(row.id, fd)}
									className="space-y-2.5"
								>
									<div className="grid gap-2.5 sm:grid-cols-2">
										<input
											name="label"
											defaultValue={row.label}
											required
											className={INPUT_CLASS}
										/>
										<input
											name="url"
											type="url"
											defaultValue={row.url}
											required
											className={INPUT_CLASS}
										/>
									</div>
									<input
										name="notes"
										defaultValue={row.notes ?? ""}
										placeholder="Catatan (opsional)"
										className={INPUT_CLASS}
									/>
									<div className="flex justify-end gap-2">
										<button
											type="button"
											onClick={() => setEditing(null)}
											className={cn(
												buttonVariants({ variant: "ghost", size: "sm" }),
											)}
										>
											Batal
										</button>
										<button
											type="submit"
											disabled={pending}
											className={cn(buttonVariants({ size: "sm" }))}
										>
											{pending ? "Menyimpan..." : "Simpan"}
										</button>
									</div>
								</form>
							</li>
						) : (
							<li
								key={row.id}
								className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
							>
								<a
									href={row.url}
									target="_blank"
									rel="noopener noreferrer"
									className="min-w-0 flex-1 space-y-0.5 group"
								>
									<div className="flex items-center gap-1.5">
										<span className="font-medium text-foreground group-hover:text-primary transition-colors">
											{row.label}
										</span>
										<ExternalLink className="size-3 text-muted-foreground/60 group-hover:text-primary transition-colors" />
									</div>
									<div className="text-[11px] text-muted-foreground/80 truncate">
										{row.url}
									</div>
									{row.notes ? (
										<div className="text-[11px] text-muted-foreground italic">
											{row.notes}
										</div>
									) : null}
									{row.uploaded_by_name ? (
										<div className="text-[10px] text-muted-foreground/60">
											oleh {row.uploaded_by_name} ·{" "}
											{new Date(row.created_at).toLocaleDateString("id-ID", {
												day: "numeric",
												month: "short",
											})}
										</div>
									) : null}
								</a>
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={() => copyLink(row.url)}
										className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
										aria-label="Copy link"
										title="Copy link"
									>
										<Copy className="size-3.5" />
									</button>
									{row.drive_file_id && (
										<a
											href={downloadUrl(row.drive_file_id)}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
											aria-label="Download"
											title="Download"
										>
											<Download className="size-3.5" />
										</a>
									)}
									{canEdit && (
										<>
											<button
												type="button"
												onClick={() => setEditing(row)}
												className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
												aria-label="Edit"
											>
												<Pencil className="size-3.5" />
											</button>
											<button
												type="button"
												onClick={() => setConfirmDeleteId(row.id)}
												className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
												aria-label="Hapus"
											>
												<Trash2 className="size-3.5" />
											</button>
										</>
									)}
								</div>
							</li>
						),
					)
				)}
			</ul>

			<ConfirmDialog
				open={confirmDeleteId !== null}
				onOpenChange={(open) => !open && setConfirmDeleteId(null)}
				title="Hapus asset ini?"
				description="Link akan hilang dari hub. Aksi ini tidak bisa di-undo."
				confirmLabel="Hapus"
				variant="destructive"
				onConfirm={() => {
					if (confirmDeleteId) handleDelete(confirmDeleteId);
				}}
			/>
		</section>
	);
}
