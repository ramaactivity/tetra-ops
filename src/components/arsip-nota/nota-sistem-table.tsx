import { ExternalLink } from "lucide-react";
import { SourceBadge } from "@/components/arsip-nota/source-badge";
import type { NotaSistemRow } from "@/lib/arsip-nota/types";
import { formatDateID, formatRupiah } from "@/lib/format";

/**
 * Tabel read-only nota sistem. Tiap baris bisa diklik "Lihat" untuk buka file
 * di Drive (tab baru).
 */
export function NotaSistemTable({ rows }: { rows: NotaSistemRow[] }) {
	return (
		<div className="overflow-hidden rounded-[1.25rem] border border-border-default bg-card shadow-[var(--shadow-level-2)]">
			{/* Header — desktop only */}
			<div className="hidden grid-cols-[7rem_minmax(9rem,1.3fr)_minmax(8rem,1.4fr)_8rem_7rem_7rem_5rem] gap-3 border-b border-border-default bg-secondary/40 px-4 py-2.5 md:grid">
				<div className="eyebrow">Sumber</div>
				<div className="eyebrow">Project / Klien</div>
				<div className="eyebrow">Keterangan</div>
				<div className="eyebrow text-right">Nominal</div>
				<div className="eyebrow">Tanggal</div>
				<div className="eyebrow">Oleh</div>
				<div className="eyebrow text-right">Nota</div>
			</div>

			<ul className="divide-y divide-border-default">
				{rows.map((row) => (
					<li
						key={`${row.source_type}-${row.source_id}-${row.drive_url}`}
						className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-secondary/40 md:grid-cols-[7rem_minmax(9rem,1.3fr)_minmax(8rem,1.4fr)_8rem_7rem_7rem_5rem] md:items-center md:gap-y-0"
					>
						<div className="order-1">
							<SourceBadge source={row.source_type} />
						</div>
						<div className="order-3 col-span-2 min-w-0 md:order-2 md:col-span-1">
							<div className="truncate text-sm font-medium text-foreground">
								{row.client_name ?? "—"}
							</div>
							<div className="truncate font-mono text-xs text-muted-foreground">
								{row.project_id ?? "—"}
							</div>
						</div>
						<div className="order-4 col-span-2 min-w-0 truncate text-sm text-foreground md:order-3 md:col-span-1">
							{row.label ?? "—"}
						</div>
						<div className="order-2 text-right text-sm tabular md:order-4">
							{row.amount != null ? formatRupiah(row.amount) : "—"}
						</div>
						<div className="order-5 text-xs text-muted-foreground md:order-5 md:text-sm">
							{row.nota_date ? formatDateID(row.nota_date) : "—"}
						</div>
						<div className="order-6 truncate text-xs text-muted-foreground md:text-sm">
							{row.uploaded_by_name ?? "—"}
						</div>
						<div className="order-7 col-span-2 md:col-span-1 md:text-right">
							{row.drive_url ? (
								<a
									href={row.drive_url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex h-7 items-center gap-1 rounded-md border border-border-default bg-card px-2.5 text-xs font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary"
								>
									<ExternalLink className="size-3" aria-hidden />
									Lihat
								</a>
							) : null}
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
