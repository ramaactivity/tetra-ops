"use client";

import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { StatusChip, type StatusTone } from "@/components/ui/mobile";
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
	| "delivered_at"
> & {
	event_project_id: string | null;
	event_date: string | null;
	/** Kuitansi: nominal pembayaran yang diterima (bukan total tagihan). */
	payment_amount: number | null;
};

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
		r.payment_amount ??
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
							<p className="tabular truncate text-[13.5px] font-semibold">
								{r.doc_number}
							</p>
							<div className="mt-1 flex min-w-0 items-center gap-2">
								<DocTypeBadge type={r.doc_type} />
								{r.event_project_id ? (
									<span
										className="tabular truncate text-[12px] text-muted-foreground"
										title={
											r.event_date
												? `Acara ${formatDateID(r.event_date)}`
												: undefined
										}
									>
										{r.event_project_id}
									</span>
								) : null}
							</div>
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
						<div className="min-w-0">
							<DocStatusBadge status={r.status} />
							{r.delivered_at ? (
								<p className="mt-0.5 truncate text-[11.5px] text-emerald-700">
									Dikirim {formatDateID(r.delivered_at)}
								</p>
							) : null}
						</div>
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

			{/* Mobile — satu daftar ringkas (dulu kartu tinggi per dokumen) */}
			<div className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-card md:hidden">
				{rows.map((r) => (
					<Link
						key={r.id}
						href={`/finance/dokumen/${r.id}`}
						className={cn(
							"flex items-center gap-3 px-4 py-3 transition-colors active:bg-secondary/60",
							r.status === "void" && "opacity-60",
						)}
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<span className="tabular truncate text-[11.5px] font-medium text-muted-foreground">
									{DOC_TYPE_LABEL[r.doc_type]} · {r.doc_number}
								</span>
								<StatusChip tone={STATUS_TONE[r.status]}>
									{DOC_STATUS_LABEL[r.status]}
								</StatusChip>
							</div>
							<p className="mt-0.5 truncate text-[14px] font-semibold text-foreground">
								{r.client.name || "—"}
							</p>
							<p className="mt-0.5 flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
								<span className="tabular truncate">
									{formatDateID(r.issued_at)}
									{r.delivered_at
										? ` · dikirim ${formatDateID(r.delivered_at)}`
										: ""}
								</span>
								<span
									className="tabular shrink-0 font-semibold text-foreground"
									data-nominal
								>
									{formatRupiah(total(r))}
								</span>
							</p>
						</div>
						<ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
					</Link>
				))}
			</div>
		</div>
	);
}
