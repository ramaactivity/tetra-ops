"use client";

import { AlertTriangle, Check, Equal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { updateStockTakeLine } from "@/lib/actions/stock-takes";
import {
	type Bundle,
	listCapacityBreakdown,
	normalizeConversion,
	sumBundles,
} from "@/lib/inventory/unit-conversion";
import { StockBundleInput } from "./stock-bundle-input";
import type { StockOpnameRow } from "./stock-opname-table";

function formatQty(value: number, fractional: boolean): string {
	const opts: Intl.NumberFormatOptions = fractional
		? { maximumFractionDigits: 4, minimumFractionDigits: 0 }
		: { maximumFractionDigits: 0 };
	return value.toLocaleString("id-ID", opts);
}

function formatIDR(value: number): string {
	const abs = Math.abs(value);
	const sign = value > 0 ? "+" : value < 0 ? "−" : "";
	return `${sign}Rp ${abs.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

function bundlesEqual(a: Bundle[], b: Bundle[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (Number(x.qty) !== Number(y.qty)) return false;
		if (x.unit !== y.unit) return false;
		if ((x.note ?? null) !== (y.note ?? null)) return false;
	}
	return true;
}

export function StockTakeLineRow({
	line,
	editable,
	layout,
}: {
	line: StockOpnameRow;
	editable: boolean;
	layout: "row" | "card";
}) {
	const conversionMap = useMemo(
		() => normalizeConversion(line.item.unit_conversion, line.item.unit),
		[line.item.unit_conversion, line.item.unit],
	);
	const isFractional = conversionMap.base_unit === "roll";

	// Initialize bundles from persisted breakdown or fallback to single-bundle.
	const initialBundles: Bundle[] = useMemo(() => {
		if (line.counted_breakdown && line.counted_breakdown.length > 0) {
			return line.counted_breakdown;
		}
		if (line.counted_qty !== null) {
			return [{ qty: line.counted_qty, unit: line.item.unit }];
		}
		return [];
	}, [line.counted_breakdown, line.counted_qty, line.item.unit]);

	const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
	const [notes, setNotes] = useState<string>(line.notes ?? "");
	const [pending, startTransition] = useTransition();
	const [flashSaved, setFlashSaved] = useState(false);

	const savedBundlesRef = useRef<Bundle[]>(initialBundles);
	const savedNotesRef = useRef<string | null>(line.notes);

	useEffect(() => {
		setBundles(initialBundles);
		setNotes(line.notes ?? "");
		savedBundlesRef.current = initialBundles;
		savedNotesRef.current = line.notes;
	}, [initialBundles, line.notes]);

	const hasAnyInput = bundles.some(
		(b) => Number(b.qty) > 0 || (b.qty === 0 && b.unit),
	);
	const countedNum: number | null = useMemo(() => {
		if (bundles.length === 0) return null;
		return sumBundles(bundles, conversionMap);
	}, [bundles, conversionMap]);

	const variance =
		countedNum === null ? null : countedNum - line.system_qty;
	const valueImpact =
		variance === null ? null : variance * line.item.purchase_price_avg;

	const isDirty =
		!bundlesEqual(bundles, savedBundlesRef.current) ||
		(notes.trim() || null) !== (savedNotesRef.current ?? null);

	function persist(targetBundles?: Bundle[], targetNotesArg?: string) {
		const bs = targetBundles ?? bundles;
		const ns = (targetNotesArg ?? notes).trim();
		const computedCounted = bs.length === 0 ? null : sumBundles(bs, conversionMap);

		startTransition(async () => {
			const fd = new FormData();
			fd.set("stock_take_id", line.stock_take_id);
			fd.set("item_id", line.item_id);
			fd.set(
				"counted_qty",
				computedCounted === null || !Number.isFinite(computedCounted)
					? ""
					: String(computedCounted),
			);
			fd.set(
				"counted_breakdown",
				bs.length === 0 ? "" : JSON.stringify(bs),
			);
			fd.set("notes", ns);
			const res = await updateStockTakeLine(fd);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			savedBundlesRef.current = bs;
			savedNotesRef.current = ns ? ns : null;
			setFlashSaved(true);
			setTimeout(() => setFlashSaved(false), 1200);
		});
	}

	function handleMatch() {
		const matched: Bundle[] = [
			{ qty: line.system_qty, unit: line.item.unit },
		];
		setBundles(matched);
		persist(matched);
	}

	const state: "pending" | "ok" | "variance" =
		countedNum === null
			? "pending"
			: variance === 0
				? "ok"
				: "variance";

	const dotTone =
		state === "pending"
			? "bg-muted-foreground/30"
			: state === "ok"
				? "bg-emerald-500"
				: variance && variance > 0
					? "bg-emerald-500"
					: "bg-rose-500";
	const dotTitle =
		state === "pending"
			? "Belum dihitung"
			: state === "ok"
				? "Sesuai sistem"
				: variance && variance > 0
					? "Stok lebih (gain)"
					: "Stok kurang (loss)";

	const isLowStock =
		line.item.min_stock_alert > 0 &&
		line.system_qty > 0 &&
		line.system_qty <= line.item.min_stock_alert;
	const isOutOfStock = line.system_qty <= 0;

	const varianceLabel =
		variance === null
			? "—"
			: variance === 0
				? "0"
				: `${variance > 0 ? "+" : ""}${formatQty(variance, isFractional)} ${line.item.unit}`;
	const varianceTone =
		variance === null
			? "text-muted-foreground/40"
			: variance === 0
				? "text-muted-foreground/60"
				: variance > 0
					? "text-emerald-600 dark:text-emerald-400"
					: "text-rose-600 dark:text-rose-400";

	const valueLabel =
		valueImpact === null || line.item.purchase_price_avg === 0
			? "—"
			: valueImpact === 0
				? "Rp 0"
				: formatIDR(valueImpact);
	const valueTone =
		valueImpact === null || valueImpact === 0
			? "text-muted-foreground/50"
			: valueImpact > 0
				? "text-emerald-600 dark:text-emerald-400"
				: "text-rose-600 dark:text-rose-400";

	const avgCostLabel =
		line.item.purchase_price_avg > 0
			? `Rp ${line.item.purchase_price_avg.toLocaleString("id-ID", { maximumFractionDigits: 0 })}/${line.item.unit}`
			: null;

	// Capacity breakdown (consumption units only) — e.g. roll → lembar 4R/2R.
	const systemCapacity = listCapacityBreakdown(line.system_qty, conversionMap);
	const countedCapacity =
		countedNum !== null
			? listCapacityBreakdown(countedNum, conversionMap)
			: [];

	function renderCapacity(
		entries: Array<{ code: string; label: string; value: number }>,
	) {
		if (entries.length === 0) return null;
		return entries
			.map((e) => `${Math.floor(e.value).toLocaleString("id-ID")} ${e.label}`)
			.join(" · ");
	}

	const systemCapStr = renderCapacity(systemCapacity);
	const countedCapStr = renderCapacity(countedCapacity);

	// ─── Mobile card ─────────────────────────────────────────────────────────
	if (layout === "card") {
		return (
			<div
				className={`rounded-lg bg-surface-2 ring-1 ${
					state === "variance"
						? "ring-amber-500/30"
						: "ring-foreground/[0.04]"
				}`}
			>
				{/* Item header */}
				<div className="flex items-start justify-between gap-3 px-3 pt-3 pb-2.5">
					<div className="flex min-w-0 flex-1 items-start gap-2">
						<span
							className={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone}`}
							title={dotTitle}
							aria-label={dotTitle}
						/>
						<div className="min-w-0">
							<div className="line-clamp-2 text-fluid-caption font-semibold text-foreground">
								{line.item.name}
							</div>
							<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular text-[10px] text-muted-foreground">
								<span>{line.item.sku}</span>
								<span className="text-muted-foreground/40">·</span>
								<span>{line.item.unit}</span>
								{avgCostLabel && (
									<>
										<span className="text-muted-foreground/40">·</span>
										<span>{avgCostLabel}</span>
									</>
								)}
								{line.item.min_stock_alert > 0 && (
									<>
										<span className="text-muted-foreground/40">·</span>
										<span>min {line.item.min_stock_alert}</span>
									</>
								)}
							</div>
						</div>
					</div>
					{flashSaved && (
						<Badge
							variant="outline"
							className="h-5 gap-0.5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
						>
							<Check className="size-2.5" />
							Saved
						</Badge>
					)}
				</div>

				{/* System stock */}
				<div className="px-3 pb-2.5 text-fluid-caption">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Stok Sistem
					</div>
					<div className="mt-0.5 flex items-center gap-1.5">
						<span className="tabular text-fluid-body font-semibold text-foreground">
							{formatQty(line.system_qty, isFractional)}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{line.item.unit}
						</span>
						{isOutOfStock ? (
							<Badge
								variant="outline"
								className="border-rose-500/30 bg-rose-500/10 px-1.5 text-[9px] text-rose-700 dark:text-rose-300"
							>
								HABIS
							</Badge>
						) : isLowStock ? (
							<Badge
								variant="outline"
								className="border-amber-500/30 bg-amber-500/10 px-1.5 text-[9px] text-amber-700 dark:text-amber-300"
							>
								KRITIS
							</Badge>
						) : null}
					</div>
					{systemCapStr && (
						<div className="mt-0.5 text-[10px] text-muted-foreground/80">
							≈ {systemCapStr}
						</div>
					)}
				</div>

				{/* Physical bundles */}
				<div className="space-y-2 px-3 pb-3">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Hitung Stok Aktual
					</div>
					{editable ? (
						<StockBundleInput
							bundles={bundles}
							onChange={(next) => {
								setBundles(next);
								persist(next);
							}}
							map={conversionMap}
						/>
					) : (
						<div className="rounded-md bg-surface-1 p-2 text-fluid-caption tabular text-foreground">
							{countedNum === null
								? "—"
								: `${formatQty(countedNum, isFractional)} ${line.item.unit}`}
						</div>
					)}
					{hasAnyInput && countedNum !== null && (
						<div className="rounded-md bg-surface-1/60 px-3 py-2 text-[11px]">
							<span className="text-muted-foreground">Total tersimpan: </span>
							<span className="tabular font-semibold text-foreground">
								{formatQty(countedNum, isFractional)} {line.item.unit}
							</span>
							{countedCapStr && (
								<div className="mt-0.5 text-[10px] text-muted-foreground/80">
									≈ {countedCapStr}
								</div>
							)}
						</div>
					)}
				</div>

				{/* Variance + value */}
				<div className="grid grid-cols-2 gap-3 px-3 pb-2.5 text-fluid-caption">
					<div>
						<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Selisih
						</div>
						<div className={`mt-0.5 tabular font-semibold ${varianceTone}`}>
							{varianceLabel}
						</div>
					</div>
					<div>
						<div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
							Dampak Nilai
							{line.item.purchase_price_avg === 0 && (
								<AlertTriangle
									className="size-2.5 text-amber-600 dark:text-amber-400"
									aria-label="Avg cost belum di-set"
								/>
							)}
						</div>
						<div className={`mt-0.5 tabular font-semibold ${valueTone}`}>
							{valueLabel}
						</div>
					</div>
				</div>

				{/* Actions + notes */}
				{editable && (
					<div className="flex items-center gap-2 px-3 pb-3">
						<button
							type="button"
							onClick={handleMatch}
							disabled={pending || countedNum === line.system_qty}
							className="press-down inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-surface-1 px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
							title={`Set Stok Fisik = ${formatQty(line.system_qty, isFractional)} ${line.item.unit}`}
						>
							<Equal className="size-3" />
							Match
						</button>
						<input
							type="text"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							onBlur={() => {
								if (isDirty) persist();
							}}
							placeholder="Catatan (opsional)"
							maxLength={200}
							className="h-8 min-w-0 flex-1 rounded-md bg-surface-1 px-2 text-[12px] focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
						/>
					</div>
				)}
			</div>
		);
	}

	// ─── Desktop row ─────────────────────────────────────────────────────────
	return (
		<tr
			className={`transition-colors hover:bg-muted/20 ${
				state === "variance" ? "bg-amber-500/5" : ""
			}`}
		>
			<td className="px-3 py-2.5 align-top">
				<div className="flex items-start gap-2">
					<span
						className={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone}`}
						title={dotTitle}
						aria-label={dotTitle}
					/>
					<div className="min-w-0 space-y-0.5">
						<div className="text-fluid-caption font-medium text-foreground">
							{line.item.name}
						</div>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular text-[10px] text-muted-foreground/80">
							<span>{line.item.sku}</span>
							{avgCostLabel && (
								<>
									<span className="text-muted-foreground/40">·</span>
									<span>{avgCostLabel}</span>
								</>
							)}
							{line.item.min_stock_alert > 0 && (
								<>
									<span className="text-muted-foreground/40">·</span>
									<span>min {line.item.min_stock_alert}</span>
								</>
							)}
							{isOutOfStock ? (
								<Badge
									variant="outline"
									className="ml-0.5 h-4 border-rose-500/30 bg-rose-500/10 px-1 text-[9px] text-rose-700 dark:text-rose-300"
								>
									HABIS
								</Badge>
							) : isLowStock ? (
								<Badge
									variant="outline"
									className="ml-0.5 h-4 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] text-amber-700 dark:text-amber-300"
								>
									KRITIS
								</Badge>
							) : null}
						</div>
					</div>
				</div>
			</td>
			<td className="px-3 py-2.5 align-top text-right">
				<div>
					<span className="tabular text-fluid-caption font-medium text-foreground">
						{formatQty(line.system_qty, isFractional)}
					</span>
					<span className="ml-1 text-[10px] text-muted-foreground/70">
						{line.item.unit}
					</span>
				</div>
				{systemCapStr && (
					<div className="text-[10px] text-muted-foreground/70">
						≈ {systemCapStr}
					</div>
				)}
			</td>
			<td className="px-3 py-2.5 align-top">
				{editable ? (
					<div className="space-y-1.5">
						<StockBundleInput
							bundles={bundles}
							onChange={(next) => {
								setBundles(next);
								persist(next);
							}}
							map={conversionMap}
						/>
						{hasAnyInput && countedNum !== null && (
							<div className="rounded-md bg-surface-1/60 px-3 py-1.5 text-right text-[11px]">
								<span className="text-muted-foreground">Total: </span>
								<span className="tabular font-semibold text-foreground">
									{formatQty(countedNum, isFractional)} {line.item.unit}
								</span>
								{countedCapStr && (
									<div className="text-[10px] text-muted-foreground/70">
										≈ {countedCapStr}
									</div>
								)}
							</div>
						)}
					</div>
				) : (
					<div className="text-center tabular text-fluid-caption">
						{countedNum === null
							? "—"
							: `${formatQty(countedNum, isFractional)} ${line.item.unit}`}
						{countedCapStr && (
							<div className="text-[10px] text-muted-foreground/70">
								≈ {countedCapStr}
							</div>
						)}
					</div>
				)}
			</td>
			<td className="px-3 py-2.5 align-top text-right">
				<span
					className={`tabular text-fluid-caption font-medium ${varianceTone}`}
				>
					{varianceLabel}
				</span>
			</td>
			<td className="px-3 py-2.5 align-top text-right">
				<span className={`tabular text-fluid-caption font-medium ${valueTone}`}>
					{valueLabel}
				</span>
			</td>
			<td className="px-3 py-2.5 align-top">
				{editable ? (
					<input
						type="text"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						onBlur={() => {
							if (isDirty) persist();
						}}
						placeholder="(opsional)"
						maxLength={200}
						className="h-8 w-full rounded-md bg-surface-1 px-2 text-sm focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				) : (
					<span className="text-fluid-caption italic text-muted-foreground">
						{line.notes ?? "—"}
					</span>
				)}
			</td>
			{editable && (
				<td className="px-3 py-2.5 align-top text-right">
					<div className="flex items-center justify-end gap-1.5">
						{flashSaved && (
							<Badge
								variant="outline"
								className="h-5 gap-0.5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
							>
								<Check className="size-2.5" />
								Saved
							</Badge>
						)}
						<button
							type="button"
							onClick={handleMatch}
							disabled={pending || countedNum === line.system_qty}
							className="press-down inline-flex h-7 items-center gap-1 rounded-md bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
							title={`Set Stok Fisik = ${formatQty(line.system_qty, isFractional)} ${line.item.unit}`}
						>
							<Equal className="size-3" />
							Match
						</button>
					</div>
				</td>
			)}
		</tr>
	);
}
