"use client";

import { CalendarDays, ChevronRight, Download, FileText } from "lucide-react";
import Link from "next/link";
import {
	RecordCard,
	StatusChip,
	type StatusTone,
} from "@/components/ui/mobile";
import { computeTotals } from "@/lib/documents/totals";
import {
	DOC_STATUS_LABEL,
	DOC_TYPE_LABEL,
	type DocStatus,
	type DocumentRow,
} from "@/lib/documents/types";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocStatusBadge, DocTypeBadge } from "./document-status-badge";

export type DocumentListRow = Pick<
	DocumentRow,
	| "id"
	| "doc_type"
	| "doc_number"
	| "client"
	| "items"
	| "discount"
	| "gross_up_enabled"
	| "gross_up_rate"
	| "issued_at"
	| "status"
> & { event_project_id: string | null; event_date: string | null };

const STATUS_TONE: Record<DocStatus, StatusTone> = {
	draft: "neutral",
	sent: "teal",
	accepted: "emerald",
	rejected: "rose",
	void: "neutral",
};

const COLS =
	"grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1.2fr)_minmax(7rem,0.7fr)_minmax(8rem,0.7fr)_minmax(6rem,0.5fr)_auto]";

export function DocumentList({ rows }: { rows: DocumentListRow[] }) {
	const total = (r: DocumentListRow) =>
		computeTotals(r.items, r.discount, {
			enabled: r.gross_up_enabled,
			ratePct: r.gross_up_rate,
		}).total;

	return (
		<div className="md:overflow-hidden md:rounded-2xl md:border md:border-border-subtle md:bg-card md:shadow-[var(--shadow-level-2)]">
			{/* Desktop */}
			<div className="hidden md:block">
				<div
					className={cn(
						"grid items-center gap-4 border-b border-border-default px-5 py-3",
						COLS,
					)}
				>
					<span className="eyebrow">Dokumen</span>
					<span className="eyebrow">Klien</span>
					<span className="eyebrow">Terbit</span>
					<span className="eyebrow text-right">Total</span>
					<span className="eyebrow">Status</span>
					<span />
				</div>
				{rows.map((r) => (
					<Link
						key={r.id}
						href={`/finance/dokumen/${r.id}`}
						className={cn(
							"grid items-center gap-4 border-b border-border-subtle px-5 py-3 transition-colors last:border-b-0 hover:bg-secondary/60",
							COLS,
							r.status === "void" && "opacity-60",
						)}
					>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<DocTypeBadge type={r.doc_type} />
								<span className="truncate text-[13.5px] font-semibold">
									{r.doc_number}
								</span>
							</div>
							{r.event_project_id ? (
								<p className="mt-0.5 text-[12px] text-muted-foreground">
									{r.event_project_id}
									{r.event_date ? ` · ${formatDateID(r.event_date)}` : ""}
								</p>
							) : null}
						</div>
						<div className="min-w-0">
							<p className="truncate text-[13.5px] font-medium">
								{r.client.name || "—"}
							</p>
							{r.client.org ? (
								<p className="truncate text-[12px] text-muted-foreground">
									{r.client.org}
								</p>
							) : null}
						</div>
						<span className="tabular text-[13px] text-muted-foreground">
							{formatDateID(r.issued_at)}
						</span>
						<span className="tabular text-right text-[13.5px] font-medium">
							{formatRupiah(total(r))}
						</span>
						<DocStatusBadge status={r.status} />
						<div className="flex items-center justify-end gap-1">
							{/* Bukan <a>: baris ini sudah <Link>, <a> bersarang = hydration error. */}
							<button
								type="button"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									window.open(`/api/pdf/document/${r.id}`, "_blank");
								}}
								className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
								title="Buka PDF"
								aria-label="Buka PDF"
							>
								<Download className="size-4" />
							</button>
							<ChevronRight className="size-4 text-muted-foreground/50" />
						</div>
					</Link>
				))}
			</div>

			{/* Mobile */}
			<div className="space-y-3 md:hidden">
				{rows.map((r) => (
					<RecordCard
						key={r.id}
						href={`/finance/dokumen/${r.id}`}
						category={
							<span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								<FileText className="size-3.5" />
								{DOC_TYPE_LABEL[r.doc_type]} · {r.doc_number}
							</span>
						}
						title={r.client.name || "—"}
						status={
							<StatusChip tone={STATUS_TONE[r.status]}>
								{DOC_STATUS_LABEL[r.status]}
							</StatusChip>
						}
						meta={
							<p className="flex items-center gap-2 text-[14px]">
								<CalendarDays className="size-4 text-muted-foreground" />
								<span className="tabular">{formatDateID(r.issued_at)}</span>
								{r.client.org ? (
									<span className="truncate text-muted-foreground">
										· {r.client.org}
									</span>
								) : null}
							</p>
						}
						footer={
							<>
								<span className="tabular text-[15px] font-semibold">
									{formatRupiah(total(r))}
								</span>
								<ChevronRight className="size-4 text-muted-foreground/60" />
							</>
						}
					/>
				))}
			</div>
		</div>
	);
}
