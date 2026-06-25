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

/** Qty cell — base unit primary + "≈ bulk" secondary, mirroring the warehouse
 *  Persediaan display ("9 roll ≈ 4,5 Box") so both surfaces read identically.
 *  flagNegative highlights minus stock (Stok Awal/Akhir only). */
function QtyStack({
	q,
	mult,
	baseUnit,
	bulkLabel,
	flagNegative = false,
}: {
	q: number;
	mult: number;
	baseUnit: string;
	bulkLabel: string | null;
	flagNegative?: boolean;
}) {
	if (q === 0) return DASH;
	const negative = flagNegative && q < 0;
	const showBulk = mult > 1 && !!bulkLabel;
	return (
		<span
			className={`inline-flex flex-col items-end leading-tight ${
				negative ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
			}`}
			title={
				negative ? "Stok minus — lakukan opname untuk koreksi." : undefined
			}
		>
			<span className="inline-flex items-center gap-1 whitespace-nowrap tabular">
				{negative && <AlertTriangle className="size-3" />}
				{fmtQty(q)} {baseUnit}
			</span>
			{showBulk && (
				<span className="whitespace-nowrap text-[10px] text-muted-foreground/70">
					≈ {fmtQty(q / mult)} {bulkLabel}
				</span>
			)}
		</span>
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
			scope="colgroup"
			className="eyebrow border-l border-border-subtle px-3 py-2 text-center"
		>
			{label}
		</th>
	);
}
function SubHead() {
	return (
		<>
			<th
				scope="col"
				className="border-l border-border-subtle px-3 py-2 text-right font-medium text-muted-foreground"
			>
				Qty
			</th>
			<th
				scope="col"
				className="px-3 py-2 text-right font-medium text-muted-foreground"
			>
				Total
			</th>
		</>
	);
}

/** A right-aligned Qty + Total pair of body cells. */
function NumPair({
	qty,
	total,
	strongTotal = false,
}: {
	qty: React.ReactNode;
	total: number;
	strongTotal?: boolean;
}) {
	return (
		<>
			<td className="border-l border-border-subtle px-3 py-2.5 text-right tabular">
				{qty}
			</td>
			<td className="px-3 py-2.5 text-right">
				<Money v={total} strong={strongTotal} />
			</td>
		</>
	);
}

export function RollforwardTable({ data }: { data: RollforwardResult }) {
	// Always show the Pembelian group, even when the month has no purchases —
	// owner prefers the column visible (empty shows as "—") over it disappearing.
	const showPurchases = true;
	const colCount = 10;

	return (
		<div className="overflow-hidden rounded-2xl border border-border-default bg-card shadow-[var(--shadow-level-2)]">
			<div className="overflow-x-auto">
				<table
					className={`w-full text-[13px] ${showPurchases ? "min-w-[860px]" : "min-w-[720px]"}`}
				>
					<thead className="text-[11px]">
						<tr className="border-b border-border-default bg-card">
							<th
								rowSpan={2}
								scope="col"
								className="eyebrow sticky left-0 z-10 bg-card px-4 py-2 text-left"
							>
								Item
							</th>
							<GroupHead label="Stok Awal" />
							{showPurchases && <GroupHead label="Pembelian" />}
							<GroupHead label="Stok Akhir" />
							<GroupHead label="Pemakaian" />
							<th
								rowSpan={2}
								scope="col"
								className="eyebrow border-l border-border-subtle px-3 py-2 text-right"
							>
								Selisih
							</th>
						</tr>
						<tr className="border-b border-border-default bg-card tabular">
							<SubHead />
							{showPurchases && <SubHead />}
							<SubHead />
							<SubHead />
						</tr>
					</thead>
					<tbody>
						{data.buckets.map((bucket) => (
							<BucketSection
								key={bucket.key}
								bucket={bucket}
								showPurchases={showPurchases}
								colCount={colCount}
							/>
						))}

						<tr className="border-t-2 border-border-strong bg-secondary/50 font-semibold">
							<th
								scope="row"
								className="sticky left-0 z-10 bg-secondary/50 px-4 py-2.5 text-left font-semibold"
							>
								Total Keseluruhan
							</th>
							<NumPair qty={DASH} total={data.grand.openingTotal} strongTotal />
							{showPurchases && (
								<NumPair
									qty={DASH}
									total={data.grand.purchasesTotal}
									strongTotal
								/>
							)}
							<NumPair qty={DASH} total={data.grand.closingTotal} strongTotal />
							<NumPair qty={DASH} total={data.grand.usageTotal} strongTotal />
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
	showPurchases,
	colCount,
}: {
	bucket: RollforwardResult["buckets"][number];
	showPurchases: boolean;
	colCount: number;
}) {
	// Single-item buckets: the subtotal would just repeat the row — skip it.
	const showSubtotal = bucket.items.length > 1;
	return (
		<>
			<tr className="bg-secondary/30">
				<td
					colSpan={colCount}
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
						className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-normal"
					>
						<div className="font-medium text-foreground">{it.name}</div>
						<div className="tabular text-[11px] text-muted-foreground">
							{it.sku} · {it.bulkLabel ?? it.unit}
							{it.wac > 0 && (
								<>
									{" "}
									· WAC {formatRupiah(it.wac * it.bulkMultiplier)}/
									{it.bulkLabel ?? it.unit}
								</>
							)}
						</div>
					</th>
					<NumPair
						qty={
							<QtyStack
								q={it.openingQty}
								mult={it.bulkMultiplier}
								baseUnit={it.unit}
								bulkLabel={it.bulkLabel}
								flagNegative
							/>
						}
						total={it.openingTotal}
					/>
					{showPurchases && (
						<NumPair
							qty={
								<QtyStack
									q={it.purchasesQty}
									mult={it.bulkMultiplier}
									baseUnit={it.unit}
									bulkLabel={it.bulkLabel}
								/>
							}
							total={it.purchasesTotal}
						/>
					)}
					<NumPair
						qty={
							<QtyStack
								q={it.closingQty}
								mult={it.bulkMultiplier}
								baseUnit={it.unit}
								bulkLabel={it.bulkLabel}
								flagNegative
							/>
						}
						total={it.closingTotal}
					/>
					<NumPair
						qty={
							<QtyStack
								q={it.usageQty}
								mult={it.bulkMultiplier}
								baseUnit={it.unit}
								bulkLabel={it.bulkLabel}
							/>
						}
						total={it.usageTotal}
						strongTotal
					/>
					<td className="border-l border-border-subtle px-3 py-2.5 text-right">
						<Variance v={it.varianceTotal} />
					</td>
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
					<NumPair qty={DASH} total={bucket.subtotal.openingTotal} />
					{showPurchases && (
						<NumPair qty={DASH} total={bucket.subtotal.purchasesTotal} />
					)}
					<NumPair qty={DASH} total={bucket.subtotal.closingTotal} />
					<NumPair qty={DASH} total={bucket.subtotal.usageTotal} />
					<td className="border-l border-border-subtle px-3 py-2 text-right">
						<Variance v={bucket.subtotal.varianceTotal} />
					</td>
				</tr>
			)}
		</>
	);
}
