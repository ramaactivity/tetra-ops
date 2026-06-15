import { ExternalLink } from "lucide-react";
import { SourceBadge } from "@/components/arsip-nota/source-badge";
import type { NotaSistemRow } from "@/lib/arsip-nota/types";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

// Grid kolom (literal untuk Tailwind JIT).
// Urutan: Tanggal | Sumber | Project/Klien | Keterangan | Nominal | Oleh | Nota.
const HEADER_COLS =
	"hidden grid-cols-[6.5rem_6.5rem_minmax(9rem,1.1fr)_minmax(8rem,1fr)_minmax(6.5rem,auto)_11rem_5.5rem] md:grid";
const ROW_COLS =
	"grid-cols-[1fr_auto] md:grid-cols-[6.5rem_6.5rem_minmax(9rem,1.1fr)_minmax(8rem,1fr)_minmax(6.5rem,auto)_11rem_5.5rem]";

/**
 * Tabel read-only nota sistem. Tiap baris bisa diklik "Lihat" untuk buka file
 * di Drive (tab baru).
 */
export function NotaSistemTable({ rows }: { rows: NotaSistemRow[] }) {
	return (
		<div className="overflow-hidden rounded-lg border border-border-default bg-card">
			{/* Header — desktop only */}
			<div
				className={cn(
					HEADER_COLS,
					"items-center gap-5 border-b border-border-default bg-secondary px-5 py-2.5",
				)}
			>
				<div className="eyebrow">Tanggal</div>
				<div className="eyebrow">Sumber</div>
				<div className="eyebrow">Project / Klien</div>
				<div className="eyebrow">Keterangan</div>
				<div className="eyebrow text-right">Nominal</div>
				<div className="eyebrow">Oleh</div>
				<div className="eyebrow text-right">Nota</div>
			</div>

			<ul>
				{rows.map((row) => (
					<li
						key={`${row.source_type}-${row.source_id}-${row.drive_url}`}
						className={cn(
							ROW_COLS,
							"grid items-center gap-x-5 gap-y-2 border-b border-border-subtle px-4 py-3.5 transition-colors last:border-b-0 hover:bg-secondary/60 md:px-5",
						)}
					>
						{/* Tanggal */}
						<div className="order-5 whitespace-nowrap text-xs tabular text-muted-foreground md:order-1 md:text-[13px]">
							{row.nota_date ? formatDateID(row.nota_date) : "—"}
						</div>

						{/* Sumber */}
						<div className="order-1 md:order-2">
							<SourceBadge source={row.source_type} />
						</div>

						{/* Project / Klien */}
						<div className="order-3 col-span-2 min-w-0 md:order-3 md:col-span-1">
							<div className="truncate text-sm font-medium text-foreground">
								{row.client_name ?? "—"}
							</div>
							<div className="truncate font-mono text-[11px] text-muted-foreground">
								{row.project_id ?? "—"}
							</div>
						</div>

						{/* Keterangan */}
						<div className="order-4 col-span-2 min-w-0 truncate text-sm text-muted-foreground md:order-4 md:col-span-1 md:text-foreground">
							{row.label ?? "—"}
						</div>

						{/* Nominal */}
						<div className="order-2 whitespace-nowrap text-right text-sm font-medium tabular text-foreground md:order-5">
							{row.amount != null ? formatRupiah(row.amount) : "—"}
						</div>

						{/* Oleh */}
						<div className="order-6 min-w-0 truncate text-xs text-muted-foreground md:order-6 md:text-[13px]">
							{row.uploaded_by_name ?? "—"}
						</div>

						{/* Nota */}
						<div className="order-7 col-span-2 flex justify-end md:order-7 md:col-span-1">
							{row.drive_url ? (
								<a
									href={row.drive_url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-2.5 text-[13px] font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary"
								>
									<ExternalLink className="size-3.5" aria-hidden />
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
