"use client";

import { AlertTriangle } from "lucide-react";
import type { RollforwardResult } from "@/lib/finance/inventory-rollforward";
import { formatRupiah } from "@/lib/format";

function fmtQty(q: number): string {
	return q.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

const DASH = <span className="text-foreground/25">—</span>;

// 10 columns: Item + (Qty,Total)×4 groups + Selisih.
const COLSPAN_ALL = 10;

function Money({ v, strong = false }: { v: number; strong?: boolean }) {
	if (v === 0) return DASH;
	return (
		<span
			className={`tabular whitespace-nowrap ${strong ? "font-semibold" : ""} ${
				v < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
			}`}
		>
			{formatRupiah(v)}
		</span>
	);
}

/** Qty cell — negative qty (data artifact) flagged rose with a warning icon. */
function QtyCell({ q }: { q: number }) {
	if (q === 0) return DASH;
	if (q < 0)
		return (
			<span
				className="inline-flex items-center gap-1 whitespace-nowrap text-rose-600 dark:text-rose-400"
				title="Stok minus — konsumsi tercatat tanpa pembelian/opname pembanding. Lakukan opname untuk koreksi."
			>
				<AlertTriangle className="size-3" />
				{fmtQty(q)}
			</span>
		);
	return (
		<span className="whitespace-nowrap text-muted-foreground">{fmtQty(q)}</span>
	);
}

/** Selisih (variance) cell — anything non-zero is an unreconciled gap, amber. */
function Variance({ v }: { v: number }) {
	if (v === 0) return DASH;
	return (
		<span
			className="inline-flex items-center gap-1 whitespace-nowrap tabular text-amber-700 dark:text-amber-400"
			title="Mutasi stok yang belum dijelaskan pemakaian event (penyesuaian/settlement/shrinkage). Jalankan opname untuk mengoreksi."
		>
			<AlertTriangle className="size-3" />
			{formatRupiah(v)}
		</span>
	);
}

function GroupHead({ label }: { label: string }) {
	return (
		<th
			colSpan={2}
			className="eyebrow border-l border-border-subtle px-3 py-2 text-center"
		>
			{label}
		</th>
	);
}
function SubHead() {
	return (
		<>
			<th className="border-l border-border-subtle px-3 py-2 text-right font-medium text-muted-foreground">
				Qty
			</th>
			<th className="px-3 py-2 text-right font-medium text-muted-foreground">
				Total
			</th>
		</>
	);
}

export function RollforwardTable({ data }: { data: RollforwardResult }) {
	return (
		<div className="overflow-hidden rounded-2xl border border-border-default bg-card shadow-[var(--shadow-level-2)]">
			<div className="overflow-x-auto">
				<table className="w-full min-w-[860px] text-[13px]">
					<thead className="text-[11px]">
						<tr className="border-b border-border-default bg-card">
							<th
								rowSpan={2}
								className="eyebrow sticky left-0 z-10 bg-card px-4 py-2 text-left"
							>
								Item
							</th>
							<GroupHead label="Stok Awal" />
							<GroupHead label="Pembelian" />
							<GroupHead label="Stok Akhir" />
							<GroupHead label="Pemakaian" />
							<th
								rowSpan={2}
								className="eyebrow border-l border-border-subtle px-3 py-2 text-right"
							>
								Selisih
							</th>
						</tr>
						<tr className="border-b border-border-default bg-card tabular">
							<SubHead />
							<SubHead />
							<SubHead />
							<SubHead />
						</tr>
					</thead>
					<tbody>
						{data.buckets.map((bucket) => (
							<BucketSection key={bucket.key} bucket={bucket} />
						))}

						<tr className="border-t-2 border-border-strong bg-secondary/50 font-semibold">
							<td className="sticky left-0 z-10 bg-secondary/50 px-4 py-2.5 text-left">
								Total Keseluruhan
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.openingTotal} strong />
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.purchasesTotal} strong />
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.closingTotal} strong />
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.usageTotal} strong />
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								<Variance v={data.grand.varianceTotal} />
							</td>
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
	return (
		<>
			<tr className="bg-secondary/30">
				<td
					colSpan={COLSPAN_ALL}
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
					<td className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left">
						<div className="font-medium text-foreground">{it.name}</div>
						<div className="tabular text-[11px] text-muted-foreground">
							{it.sku} · {it.unit}
							{it.wac > 0 && <> · WAC {formatRupiah(it.wac)}</>}
						</div>
					</td>

					{/* Stok Awal */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular">
						<QtyCell q={it.openingQty} />
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.openingTotal} />
					</td>

					{/* Pembelian */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.purchasesQty === 0 ? DASH : fmtQty(it.purchasesQty)}
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.purchasesTotal} />
					</td>

					{/* Stok Akhir */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular">
						<QtyCell q={it.closingQty} />
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.closingTotal} />
					</td>

					{/* Pemakaian (recorded, ≥ 0) */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.usageQty === 0 ? DASH : fmtQty(it.usageQty)}
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.usageTotal} strong />
					</td>

					{/* Selisih */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right">
						<Variance v={it.varianceTotal} />
					</td>
				</tr>
			))}

			{/* Subtotal — Rupiah Total columns only */}
			<tr className="border-b border-border-default bg-surface-3/30 text-[12px] font-medium">
				<td className="sticky left-0 z-10 bg-surface-3/30 px-4 py-2 text-left text-muted-foreground">
					Subtotal {bucket.label}
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.openingTotal} />
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.purchasesTotal} />
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.closingTotal} />
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.usageTotal} />
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					<Variance v={bucket.subtotal.varianceTotal} />
				</td>
			</tr>
		</>
	);
}
