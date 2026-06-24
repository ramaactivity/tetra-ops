"use client";

import { AlertTriangle } from "lucide-react";
import type { RollforwardResult } from "@/lib/finance/inventory-rollforward";
import { formatRupiah } from "@/lib/format";

function fmtQty(q: number): string {
	return q.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

const DASH = <span className="text-foreground/25">—</span>;

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

// One group = 3 sub-columns (Qty / Harga / Total) with a left divider.
function GroupHead({ label }: { label: string }) {
	return (
		<th
			colSpan={3}
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
				Harga
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
				<table className="w-full min-w-[1080px] text-[13px]">
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
							<GroupHead label="COGS / Pemakaian" />
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

						{/* Grand total */}
						<tr className="border-t-2 border-border-strong bg-secondary/50 font-semibold">
							<td className="sticky left-0 z-10 bg-secondary/50 px-4 py-2.5 text-left">
								Total Keseluruhan
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">{DASH}</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.openingTotal} strong />
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">{DASH}</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.purchasesTotal} strong />
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">{DASH}</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.closingTotal} strong />
							</td>
							<td className="border-l border-border-subtle px-3 py-2.5 text-right">
								{DASH}
							</td>
							<td className="px-3 py-2.5 text-right">{DASH}</td>
							<td className="px-3 py-2.5 text-right">
								<Money v={data.grand.usageTotal} strong />
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
					colSpan={13}
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
						</div>
					</td>

					{/* Stok Awal */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.openingQty === 0 ? DASH : fmtQty(it.openingQty)}
					</td>
					<td className="px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.wac === 0 ? DASH : formatRupiah(it.wac)}
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.openingTotal} />
					</td>

					{/* Pembelian */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.purchasesQty === 0 ? DASH : fmtQty(it.purchasesQty)}
					</td>
					<td className="px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.purchasesQty === 0 ? DASH : formatRupiah(it.purchasesPrice)}
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.purchasesTotal} />
					</td>

					{/* Stok Akhir — negative qty flagged */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular">
						{it.closingQty === 0 ? (
							DASH
						) : it.closingQty < 0 ? (
							<span
								className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"
								title="Stok minus — konsumsi tercatat tanpa pembelian/opname pembanding. Lakukan opname untuk koreksi."
							>
								<AlertTriangle className="size-3" />
								{fmtQty(it.closingQty)}
							</span>
						) : (
							<span className="text-muted-foreground">
								{fmtQty(it.closingQty)}
							</span>
						)}
					</td>
					<td className="px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.wac === 0 ? DASH : formatRupiah(it.wac)}
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.closingTotal} />
					</td>

					{/* COGS / Pemakaian — recorded event consumption (always ≥ 0) */}
					<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.usageQty === 0 ? DASH : fmtQty(it.usageQty)}
					</td>
					<td className="px-3 py-2.5 text-right tabular whitespace-nowrap text-muted-foreground">
						{it.usageQty === 0 ? DASH : formatRupiah(it.wac)}
					</td>
					<td className="px-3 py-2.5 text-right">
						<Money v={it.usageTotal} strong />
					</td>
				</tr>
			))}

			{/* Bucket subtotal — Rupiah Total columns only (units may be mixed) */}
			<tr className="border-b border-border-default bg-surface-3/30 text-[12px] font-medium">
				<td className="sticky left-0 z-10 bg-surface-3/30 px-4 py-2 text-left text-muted-foreground">
					Subtotal {bucket.label}
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">{DASH}</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.openingTotal} />
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">{DASH}</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.purchasesTotal} />
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">{DASH}</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.closingTotal} />
				</td>
				<td className="border-l border-border-subtle px-3 py-2 text-right">
					{DASH}
				</td>
				<td className="px-3 py-2 text-right">{DASH}</td>
				<td className="px-3 py-2 text-right">
					<Money v={bucket.subtotal.usageTotal} />
				</td>
			</tr>
		</>
	);
}
