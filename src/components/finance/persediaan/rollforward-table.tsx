"use client";

import { AlertTriangle } from "lucide-react";
import type { RollforwardResult } from "@/lib/finance/inventory-rollforward";
import { formatRupiah, formatRupiahCompact } from "@/lib/format";

function fmtQty(q: number): string {
	return q.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

const DASH = <span className="text-foreground/25">—</span>;

/** Qty sub-line under a stage's value: base unit + "≈ bulk" (matches the
 *  warehouse display), muted. Negative stock flagged. Returns null when zero. */
function QtyLine({
	q,
	mult,
	baseUnit,
	bulkLabel,
}: {
	q: number;
	mult: number;
	baseUnit: string;
	bulkLabel: string | null;
}) {
	if (q === 0) return null;
	const bulk =
		mult > 1 && bulkLabel ? ` ≈ ${fmtQty(q / mult)} ${bulkLabel}` : "";
	if (q < 0)
		return (
			<div
				className="mt-0.5 inline-flex items-center justify-end gap-1 whitespace-nowrap tabular text-[10px] text-rose-600 dark:text-rose-400"
				title="Stok minus — lakukan opname untuk koreksi."
			>
				<AlertTriangle className="size-2.5" />
				{fmtQty(q)} {baseUnit}
				{bulk}
			</div>
		);
	return (
		<div className="mt-0.5 whitespace-nowrap tabular text-[10px] text-muted-foreground/70">
			{fmtQty(q)} {baseUnit}
			{bulk}
		</div>
	);
}

/** One stage cell — value (compact Rp, primary) stacked over its qty sub-line.
 *  Everything stays visible; the dense Qty/Total column pair collapses into a
 *  single legible cell. Pass `qty=undefined` for subtotal/grand (value only). */
function StageCell({
	total,
	qty,
	mult = 1,
	baseUnit = "",
	bulkLabel = null,
	strong = false,
	tint = false,
}: {
	total: number;
	qty?: number;
	mult?: number;
	baseUnit?: string;
	bulkLabel?: string | null;
	strong?: boolean;
	tint?: boolean;
}) {
	const hasQty = qty !== undefined;
	const empty = total === 0 && (!hasQty || qty === 0);
	return (
		<td
			className={`border-l border-border-subtle px-3 py-2.5 text-right align-top ${
				tint ? "bg-secondary/25" : ""
			}`}
		>
			{empty ? (
				DASH
			) : (
				<>
					<div
						className={`whitespace-nowrap tabular ${
							strong ? "font-semibold text-foreground" : "text-foreground/90"
						}`}
						title={total !== 0 ? formatRupiah(total) : undefined}
					>
						{total === 0 ? DASH : formatRupiahCompact(total)}
					</div>
					{hasQty && (
						<QtyLine
							q={qty as number}
							mult={mult}
							baseUnit={baseUnit}
							bulkLabel={bulkLabel}
						/>
					)}
				</>
			)}
		</td>
	);
}

/** Selisih (variance) cell — any non-zero is an unreconciled gap, amber. */
function VarianceCell({ v }: { v: number }) {
	return (
		<td className="border-l border-border-strong/40 px-3 py-2.5 text-right align-top">
			{v === 0 ? (
				DASH
			) : (
				<span
					className="inline-flex items-center gap-1 whitespace-nowrap tabular text-amber-700 dark:text-amber-400"
					title={`${formatRupiah(v)} — mutasi stok yang belum dijelaskan pemakaian event (penyesuaian/settlement/shrinkage). Jalankan opname untuk mengoreksi.`}
				>
					<AlertTriangle className="size-3" />
					{formatRupiahCompact(v)}
				</span>
			)}
		</td>
	);
}

/** Column header — eyebrow, right-aligned, optional faint tint to chunk the
 *  4 stages into snapshot | flow | snapshot | flow rhythm. */
function ColHead({ label, tint = false }: { label: string; tint?: boolean }) {
	return (
		<th
			scope="col"
			className={`eyebrow border-l border-border-subtle px-3 py-2.5 text-right ${
				tint ? "bg-secondary/25" : ""
			}`}
		>
			{label}
		</th>
	);
}

export function RollforwardTable({ data }: { data: RollforwardResult }) {
	return (
		<div className="overflow-hidden rounded-2xl border border-border-default bg-card shadow-[var(--shadow-level-2)]">
			<div className="overflow-x-auto">
				<table className="w-full min-w-[680px] text-[13px]">
					<thead className="text-[11px]">
						<tr className="border-b border-border-default bg-card">
							<th
								scope="col"
								className="eyebrow sticky left-0 z-10 bg-card px-4 py-2.5 text-left"
							>
								Item
							</th>
							<ColHead label="Stok Awal" />
							<ColHead label="Pembelian" tint />
							<ColHead label="Stok Akhir" />
							<ColHead label="Pemakaian" tint />
							<th
								scope="col"
								className="eyebrow border-l border-border-strong/40 px-3 py-2.5 text-right"
							>
								Selisih
							</th>
						</tr>
					</thead>
					<tbody>
						{data.buckets.map((bucket) => (
							<BucketSection key={bucket.key} bucket={bucket} />
						))}

						<tr className="border-t-2 border-border-strong bg-secondary/50 font-semibold">
							<th
								scope="row"
								className="sticky left-0 z-10 bg-secondary/50 px-4 py-2.5 text-left font-semibold"
							>
								Total Keseluruhan
							</th>
							<StageCell total={data.grand.openingTotal} strong />
							<StageCell total={data.grand.purchasesTotal} strong />
							<StageCell total={data.grand.closingTotal} strong />
							<StageCell total={data.grand.usageTotal} strong />
							<VarianceCell v={data.grand.varianceTotal} />
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}

function BucketSection({
	bucket,
}: {
	bucket: RollforwardResult["buckets"][number];
}) {
	// Single-item buckets: the subtotal would just repeat the row — skip it.
	const showSubtotal = bucket.items.length > 1;
	return (
		<>
			<tr className="bg-secondary/30">
				<td
					colSpan={6}
					className="eyebrow sticky left-0 px-4 py-1.5 text-left text-muted-foreground"
				>
					{bucket.label}
				</td>
			</tr>
			{bucket.items.map((it) => (
				<tr
					key={it.item_id}
					className="border-b border-border-subtle last:border-0 hover:bg-secondary/30"
				>
					<th
						scope="row"
						className="sticky left-0 z-10 max-w-[240px] bg-card px-4 py-2.5 text-left font-normal"
					>
						<div className="truncate font-medium text-foreground">
							{it.name}
						</div>
						<div className="truncate tabular text-[11px] text-muted-foreground">
							{it.sku}
							{it.wac > 0 && (
								<>
									{" · WAC "}
									{formatRupiahCompact(it.wac * it.bulkMultiplier)}/
									{it.bulkLabel ?? it.unit}
								</>
							)}
						</div>
					</th>
					<StageCell
						total={it.openingTotal}
						qty={it.openingQty}
						mult={it.bulkMultiplier}
						baseUnit={it.unit}
						bulkLabel={it.bulkLabel}
					/>
					<StageCell
						total={it.purchasesTotal}
						qty={it.purchasesQty}
						mult={it.bulkMultiplier}
						baseUnit={it.unit}
						bulkLabel={it.bulkLabel}
						tint
					/>
					<StageCell
						total={it.closingTotal}
						qty={it.closingQty}
						mult={it.bulkMultiplier}
						baseUnit={it.unit}
						bulkLabel={it.bulkLabel}
					/>
					<StageCell
						total={it.usageTotal}
						qty={it.usageQty}
						mult={it.bulkMultiplier}
						baseUnit={it.unit}
						bulkLabel={it.bulkLabel}
						strong
						tint
					/>
					<VarianceCell v={it.varianceTotal} />
				</tr>
			))}

			{showSubtotal && (
				<tr className="border-b border-border-default bg-surface-3/30 text-[12px] font-medium">
					<th
						scope="row"
						className="sticky left-0 z-10 bg-surface-3/30 px-4 py-2 text-left font-medium text-muted-foreground"
					>
						Subtotal {bucket.label}
					</th>
					<StageCell total={bucket.subtotal.openingTotal} />
					<StageCell total={bucket.subtotal.purchasesTotal} />
					<StageCell total={bucket.subtotal.closingTotal} />
					<StageCell total={bucket.subtotal.usageTotal} />
					<VarianceCell v={bucket.subtotal.varianceTotal} />
				</tr>
			)}
		</>
	);
}
