"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteManualNota } from "@/lib/actions/arsip-nota";
import type { ManualNotaRow } from "@/lib/arsip-nota/types";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

// Grid kolom (literal — Tailwind JIT butuh string utuh). Bulan Arsip di-hide.
// Urutan: Tgl Nota | Kategori | Keterangan | Nominal | Oleh | Aksi.
const HEADER_COLS =
	"hidden grid-cols-[6.5rem_minmax(7.5rem,0.8fr)_minmax(9rem,1fr)_minmax(6.5rem,auto)_11rem_7.5rem] md:grid";
const ROW_COLS =
	"grid-cols-[1fr_auto] md:grid-cols-[6.5rem_minmax(7.5rem,0.8fr)_minmax(9rem,1fr)_minmax(6.5rem,auto)_11rem_7.5rem]";

export function NotaManualTable({ rows }: { rows: ManualNotaRow[] }) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, startTransition] = useTransition();
	const [deletingId, setDeletingId] = useState<string | null>(null);

	async function handleDelete(row: ManualNotaRow) {
		const ok = await confirm({
			title: "Hapus nota ini?",
			description:
				"Catatan akan dihapus dari arsip. File aslinya tetap tersimpan di Google Drive.",
			confirmLabel: "Hapus",
			variant: "destructive",
		});
		if (!ok) return;
		setDeletingId(row.id);
		startTransition(async () => {
			const res = await deleteManualNota(row.id);
			setDeletingId(null);
			if (res.ok) {
				toast.success("Nota dihapus dari arsip");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	return (
		<div className="overflow-hidden rounded-lg border border-border-default bg-card">
			{/* Header — desktop only */}
			<div
				className={cn(
					HEADER_COLS,
					"items-center gap-5 border-b border-border-default bg-secondary px-5 py-2.5",
				)}
			>
				<div className="eyebrow">Tgl Nota</div>
				<div className="eyebrow">Kategori</div>
				<div className="eyebrow">Keterangan</div>
				<div className="eyebrow text-right">Nominal</div>
				<div className="eyebrow">Oleh</div>
				<div className="eyebrow text-right">Aksi</div>
			</div>

			<ul>
				{rows.map((row) => (
					<li
						key={row.id}
						className={cn(
							ROW_COLS,
							"grid items-center gap-x-5 gap-y-2 border-b border-border-subtle px-4 py-3.5 transition-colors last:border-b-0 hover:bg-secondary/60 md:px-5",
						)}
					>
						{/* Tgl Nota */}
						<div className="order-4 whitespace-nowrap text-xs tabular text-muted-foreground md:order-1 md:text-[13px]">
							{row.nota_date ? formatDateID(row.nota_date) : "—"}
						</div>

						{/* Kategori */}
						<div className="order-1 min-w-0 truncate text-sm font-medium text-foreground md:order-2">
							{row.category}
						</div>

						{/* Keterangan */}
						<div className="order-3 col-span-2 min-w-0 truncate text-sm text-muted-foreground md:order-3 md:col-span-1 md:text-foreground">
							{row.description}
						</div>

						{/* Nominal */}
						<div className="order-2 whitespace-nowrap text-right text-sm font-medium tabular text-foreground md:order-4">
							{row.amount != null ? formatRupiah(row.amount) : "—"}
						</div>

						{/* Oleh */}
						<div className="order-5 min-w-0 truncate text-xs text-muted-foreground md:order-5 md:text-[13px]">
							{row.uploaded_by_name ?? "—"}
						</div>

						{/* Aksi */}
						<div className="order-6 col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
							<a
								href={row.drive_url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 text-[13px] font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary"
							>
								<ExternalLink className="size-3.5" aria-hidden />
								Lihat
							</a>
							<button
								type="button"
								onClick={() => handleDelete(row)}
								disabled={pending && deletingId === row.id}
								className="inline-flex size-8 items-center justify-center rounded-md border border-border-default bg-card text-muted-foreground shadow-[var(--shadow-level-1)] transition-colors hover:border-rose-200 hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50"
								aria-label="Hapus nota"
							>
								<Trash2 className="size-3.5" aria-hidden />
							</button>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
