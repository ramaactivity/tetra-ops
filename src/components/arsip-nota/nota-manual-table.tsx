"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteManualNota } from "@/lib/actions/arsip-nota";
import type { ManualNotaRow } from "@/lib/arsip-nota/types";
import { MONTHS_ID } from "@/lib/drive/naming";
import { formatDateID, formatRupiah } from "@/lib/format";

function uploadBucketLabel(year: number, month: number): string {
	const name = MONTHS_ID[month - 1] ?? String(month);
	return `${name} ${year}`;
}

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
		<div className="overflow-hidden rounded-[1.25rem] border border-border-default bg-card shadow-[var(--shadow-level-2)]">
			<div className="hidden grid-cols-[minmax(8rem,1fr)_minmax(9rem,1.5fr)_8rem_7rem_7rem_7rem_4.5rem] gap-3 border-b border-border-default bg-secondary/40 px-4 py-2.5 md:grid">
				<div className="eyebrow">Kategori</div>
				<div className="eyebrow">Keterangan</div>
				<div className="eyebrow text-right">Nominal</div>
				<div className="eyebrow">Tgl Nota</div>
				<div className="eyebrow">Bulan Arsip</div>
				<div className="eyebrow">Oleh</div>
				<div className="eyebrow text-right">Aksi</div>
			</div>

			<ul className="divide-y divide-border-default">
				{rows.map((row) => (
					<li
						key={row.id}
						className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-secondary/40 md:grid-cols-[minmax(8rem,1fr)_minmax(9rem,1.5fr)_8rem_7rem_7rem_7rem_4.5rem] md:items-center md:gap-y-0"
					>
						<div className="order-1 truncate text-sm font-medium text-foreground">
							{row.category}
						</div>
						<div className="order-3 col-span-2 min-w-0 truncate text-sm text-foreground md:order-2 md:col-span-1">
							{row.description}
						</div>
						<div className="order-2 text-right text-sm tabular md:order-3">
							{row.amount != null ? formatRupiah(row.amount) : "—"}
						</div>
						<div className="order-4 text-xs text-muted-foreground md:text-sm">
							{row.nota_date ? formatDateID(row.nota_date) : "—"}
						</div>
						<div className="order-5 text-xs text-muted-foreground md:text-sm">
							{uploadBucketLabel(row.upload_year, row.upload_month)}
						</div>
						<div className="order-6 truncate text-xs text-muted-foreground md:text-sm">
							{row.uploaded_by_name ?? "—"}
						</div>
						<div className="order-7 col-span-2 flex items-center gap-1.5 md:col-span-1 md:justify-end">
							<a
								href={row.drive_url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex h-7 items-center gap-1 rounded-md border border-border-default bg-card px-2.5 text-xs font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary"
							>
								<ExternalLink className="size-3" aria-hidden />
								Lihat
							</a>
							<button
								type="button"
								onClick={() => handleDelete(row)}
								disabled={pending && deletingId === row.id}
								className="inline-flex size-7 items-center justify-center rounded-md border border-border-default bg-card text-muted-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50"
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
