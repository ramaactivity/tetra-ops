"use client";

import {
	Camera,
	ExternalLink,
	Film,
	type LucideIcon,
	Palette,
	Pencil,
	Plus,
	Trash2,
	Video,
} from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	addEventAsset,
	deleteEventAsset,
	updateEventAsset,
} from "@/lib/actions/event-assets";
import type { AssetType } from "@/lib/event-assets/types";

export type AssetRow = {
	id: string;
	asset_type: AssetType;
	label: string;
	url: string;
	notes: string | null;
	uploaded_by: string | null;
	uploaded_by_name: string | null;
	created_at: string;
};

const META: Record<
	AssetType,
	{ label: string; icon: LucideIcon; tone: string; placeholder: string }
> = {
	// Icons distinguish asset type; tone stays neutral ink — no second
	// brand color per DESIGN.md §867. Previous violet/amber/sky/emerald
	// palette removed as decorative-color leak.
	design_frame: {
		label: "Design Frames",
		icon: Palette,
		tone: "text-foreground",
		placeholder: "Mockup R1 (Figma)",
	},
	footage_crew: {
		label: "Footage Crew",
		icon: Film,
		tone: "text-foreground",
		placeholder: "Raw footage event 1 Mei",
	},
	softfile_photo: {
		label: "Softfile Foto",
		icon: Camera,
		tone: "text-foreground",
		placeholder: "Gallery photobooth final",
	},
	softfile_video: {
		label: "Softfile Video",
		icon: Video,
		tone: "text-foreground",
		placeholder: "Boomerang & slow-mo final",
	},
};

interface AssetSectionProps {
	eventId: string;
	projectId: string;
	assetType: AssetType;
	rows: AssetRow[];
	canEdit: boolean;
}

export function AssetSection({
	eventId,
	projectId,
	assetType,
	rows,
	canEdit,
}: AssetSectionProps) {
	const meta = META[assetType];
	const Icon = meta.icon;
	const [showAdd, setShowAdd] = useState(false);
	const [editing, setEditing] = useState<AssetRow | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	async function handleAdd(formData: FormData) {
		formData.set("asset_type", assetType);
		startTransition(async () => {
			const res = await addEventAsset(projectId, formData);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(`${meta.label} ditambahkan`);
				setShowAdd(false);
			}
		});
	}

	async function handleUpdate(id: string, formData: FormData) {
		startTransition(async () => {
			const res = await updateEventAsset(id, formData);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("Asset diupdate");
				setEditing(null);
			}
		});
	}

	function handleDelete(id: string) {
		startTransition(async () => {
			const res = await deleteEventAsset(id);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("Asset dihapus");
				setConfirmDeleteId(null);
			}
		});
	}

	return (
		<section className="rounded-xl border border-border-default bg-surface-2">
			<header className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
				<div className="flex items-center gap-2.5">
					<div
						className={`grid size-8 place-items-center rounded-lg bg-surface-3 ${meta.tone}`}
					>
						<Icon className="size-4" aria-hidden />
					</div>
					<div>
						<h3 className="text-fluid-body font-semibold tracking-tight">
							{meta.label}
						</h3>
						<p className="text-[11px] text-muted-foreground">
							{rows.length} link
						</p>
					</div>
				</div>
				{canEdit && (
					<button
						type="button"
						onClick={() => setShowAdd((v) => !v)}
						className="press-down inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-3 px-2.5 py-1 text-fluid-caption font-medium hover:bg-surface-4"
					>
						<Plus className="size-3.5" />
						{showAdd ? "Batal" : "Tambah"}
					</button>
				)}
			</header>

			{showAdd && canEdit ? (
				<form
					action={handleAdd}
					className="space-y-2 border-b border-border-default bg-surface-3/30 px-4 py-3"
				>
					<div className="grid gap-2 sm:grid-cols-2">
						<label className="space-y-1">
							<span className="text-[11px] font-medium text-muted-foreground">
								Label
							</span>
							<input
								name="label"
								required
								placeholder={meta.placeholder}
								className="w-full rounded-md border border-border-default bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
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
								className="w-full rounded-md border border-border-default bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
							/>
						</label>
					</div>
					<label className="space-y-1 block">
						<span className="text-[11px] font-medium text-muted-foreground">
							Catatan (opsional)
						</span>
						<input
							name="notes"
							placeholder="Versi, catatan revisi, atau info lainnya"
							className="w-full rounded-md border border-border-default bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
						/>
					</label>
					<div className="flex justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={() => setShowAdd(false)}
							className="rounded-md px-3 py-1.5 text-fluid-caption font-medium text-muted-foreground hover:bg-muted"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending}
							className="press-down rounded-md bg-primary px-3 py-1.5 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
						>
							{pending ? "Menyimpan..." : "Simpan"}
						</button>
					</div>
				</form>
			) : null}

			<ul className="divide-y divide-border-default/40">
				{rows.length === 0 ? (
					<li className="px-4 py-5 text-center text-fluid-caption text-muted-foreground italic">
						Belum ada {meta.label.toLowerCase()}.
						{canEdit && " Klik Tambah untuk mulai."}
					</li>
				) : (
					rows.map((row) =>
						editing?.id === row.id ? (
							<li key={row.id} className="px-4 py-3 bg-surface-3/30">
								<form
									action={(fd) => handleUpdate(row.id, fd)}
									className="space-y-2"
								>
									<div className="grid gap-2 sm:grid-cols-2">
										<input
											name="label"
											defaultValue={row.label}
											required
											className="w-full rounded-md border border-border-default bg-background px-2.5 py-1.5 text-sm"
										/>
										<input
											name="url"
											type="url"
											defaultValue={row.url}
											required
											className="w-full rounded-md border border-border-default bg-background px-2.5 py-1.5 text-sm"
										/>
									</div>
									<input
										name="notes"
										defaultValue={row.notes ?? ""}
										placeholder="Catatan (opsional)"
										className="w-full rounded-md border border-border-default bg-background px-2.5 py-1.5 text-sm"
									/>
									<div className="flex justify-end gap-2">
										<button
											type="button"
											onClick={() => setEditing(null)}
											className="rounded-md px-3 py-1.5 text-fluid-caption font-medium text-muted-foreground hover:bg-muted"
										>
											Batal
										</button>
										<button
											type="submit"
											disabled={pending}
											className="press-down rounded-md bg-primary px-3 py-1.5 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
										>
											{pending ? "Menyimpan..." : "Simpan"}
										</button>
									</div>
								</form>
							</li>
						) : (
							<li
								key={row.id}
								className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
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
								{canEdit && (
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => setEditing(row)}
											className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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
									</div>
								)}
							</li>
						),
					)
				)}
			</ul>

			<ConfirmDialog
				open={confirmDeleteId !== null}
				onOpenChange={(open) => !open && setConfirmDeleteId(null)}
				title="Hapus asset ini?"
				description="URL akan hilang dari Visual Asset Hub. Aksi ini tidak bisa di-undo."
				confirmLabel="Hapus"
				variant="destructive"
				onConfirm={() => {
					if (confirmDeleteId) handleDelete(confirmDeleteId);
				}}
			/>
		</section>
	);
}
