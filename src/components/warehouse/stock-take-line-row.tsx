"use client";

import { AlertTriangle, Check, Equal } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { updateStockTakeLine } from "@/lib/actions/stock-takes";
import type { StockOpnameRow } from "./stock-opname-table";

const ROLL_STEP_UNITS = new Set(["roll"]);

function formatQty(value: number, unit: string): string {
	const isFractional = ROLL_STEP_UNITS.has(unit);
	const opts: Intl.NumberFormatOptions = isFractional
		? { maximumFractionDigits: 4, minimumFractionDigits: 0 }
		: { maximumFractionDigits: 0 };
	return value.toLocaleString("id-ID", opts);
}

function formatIDR(value: number): string {
	const abs = Math.abs(value);
	const sign = value > 0 ? "+" : value < 0 ? "−" : "";
	return `${sign}Rp ${abs.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

function lembarLabel(key: string): string {
	if (!key.startsWith("lembar_")) return key.replace(/_/g, " ");
	const suffix = key.slice("lembar_".length);
	if (suffix === "4r") return "lembar 4R";
	if (suffix === "2r") return "lembar 2R";
	if (suffix === "polaroid") return "lembar Polaroid";
	return `lembar ${suffix.toUpperCase()}`;
}

/**
 * For roll-based mediaset items, returns the alt-unit capacity breakdown
 * (e.g. "0 lembar 4R · 0 lembar 2R" or "1.400 lembar 4R · 2.800 lembar 2R").
 * Always shows the conversion even when capacity is 0 so owner sees the
 * conversion logic at a glance. Returns null for non-roll items or items
 * with no unit_conversion JSONB.
 */
function rollConversionBreakdown(
	qty: number,
	unit: string,
	conversion: Record<string, number> | null,
): string | null {
	if (unit !== "roll" || !conversion) return null;
	const parts: string[] = [];
	for (const [k, mult] of Object.entries(conversion)) {
		if (k === "roll") continue;
		const capacity = Math.floor(qty * mult);
		parts.push(`${capacity.toLocaleString("id-ID")} ${lembarLabel(k)}`);
	}
	return parts.length > 0 ? parts.join(" · ") : null;
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
	const isFractional = ROLL_STEP_UNITS.has(line.item.unit);
	const stepAttr = isFractional ? 0.0001 : 1;

	const [counted, setCounted] = useState<string>(
		line.counted_qty === null ? "" : String(line.counted_qty),
	);
	const [notes, setNotes] = useState<string>(line.notes ?? "");
	const [pending, startTransition] = useTransition();
	const [flashSaved, setFlashSaved] = useState(false);

	const savedCountedRef = useRef<number | null>(line.counted_qty);
	const savedNotesRef = useRef<string | null>(line.notes);

	useEffect(() => {
		setCounted(line.counted_qty === null ? "" : String(line.counted_qty));
		setNotes(line.notes ?? "");
		savedCountedRef.current = line.counted_qty;
		savedNotesRef.current = line.notes;
	}, [line.counted_qty, line.notes]);

	const countedNum = counted.trim() === "" ? null : Number(counted);
	const countedValid = countedNum === null || Number.isFinite(countedNum);
	const variance =
		countedNum === null || !countedValid ? null : countedNum - line.system_qty;
	const valueImpact =
		variance === null ? null : variance * line.item.purchase_price_avg;
	const isDirty =
		countedNum !== savedCountedRef.current ||
		(notes.trim() || null) !== (savedNotesRef.current ?? null);

	function persist(overrideCounted?: number | null, overrideNotes?: string) {
		const targetCounted =
			overrideCounted !== undefined ? overrideCounted : countedNum;
		const targetNotes =
			overrideNotes !== undefined ? overrideNotes.trim() : notes.trim();
		startTransition(async () => {
			const fd = new FormData();
			fd.set("stock_take_id", line.stock_take_id);
			fd.set("item_id", line.item_id);
			fd.set(
				"counted_qty",
				targetCounted === null || !Number.isFinite(targetCounted)
					? ""
					: String(targetCounted),
			);
			fd.set("notes", targetNotes);
			const res = await updateStockTakeLine(fd);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			savedCountedRef.current =
				targetCounted === null || !Number.isFinite(targetCounted)
					? null
					: targetCounted;
			savedNotesRef.current = targetNotes ? targetNotes : null;
			setFlashSaved(true);
			setTimeout(() => setFlashSaved(false), 1200);
		});
	}

	function handleBlur() {
		if (!isDirty) return;
		persist();
	}

	function handleMatch() {
		setCounted(String(line.system_qty));
		persist(line.system_qty);
	}

	const state: "pending" | "ok" | "variance" =
		countedNum === null || !countedValid
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
				: `${variance > 0 ? "+" : ""}${formatQty(variance, line.item.unit)} ${line.item.unit}`;
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

	// Roll → lembar conversion breakdown (mediaset only)
	const systemConversion = rollConversionBreakdown(
		line.system_qty,
		line.item.unit,
		line.item.unit_conversion,
	);
	const countedConversion =
		countedNum !== null && countedValid
			? rollConversionBreakdown(
					countedNum,
					line.item.unit,
					line.item.unit_conversion,
				)
			: null;

	// ─── Mobile card ─────────────────────────────────────────────────────────
	if (layout === "card") {
		return (
			<div
				className={`rounded-lg border bg-surface-2 ${
					state === "variance"
						? "border-amber-500/30"
						: "border-border-default"
				}`}
			>
				{/* Item header */}
				<div className="flex items-start justify-between gap-3 border-b border-border-default/60 p-3">
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

				{/* Counts */}
				<div className="grid grid-cols-2 gap-3 p-3 text-fluid-caption">
					<div>
						<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Stok Sistem
						</div>
						<div className="mt-0.5 flex items-center gap-1.5">
							<span className="tabular text-fluid-body font-semibold text-foreground">
								{formatQty(line.system_qty, line.item.unit)}
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
						{systemConversion && (
							<div className="mt-0.5 text-[10px] text-muted-foreground/80">
								≈ {systemConversion}
							</div>
						)}
					</div>
					<div>
						<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Stok Fisik
						</div>
						<div className="mt-0.5">
							{editable ? (
								<div className="relative">
									<input
										type="number"
										inputMode={isFractional ? "decimal" : "numeric"}
										min={0}
										step={stepAttr}
										value={counted}
										onChange={(e) => setCounted(e.target.value)}
										onBlur={handleBlur}
										placeholder="—"
										className="h-9 w-full rounded-md border border-border-default bg-background px-2 pr-12 text-fluid-body tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
									/>
									<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
										{line.item.unit}
									</span>
								</div>
							) : (
								<div className="tabular text-fluid-body font-semibold text-foreground">
									{countedNum === null
										? "—"
										: `${formatQty(countedNum, line.item.unit)} ${line.item.unit}`}
								</div>
							)}
						</div>
						{countedConversion && (
							<div className="mt-0.5 text-[10px] text-muted-foreground/80">
								≈ {countedConversion}
							</div>
						)}
					</div>
				</div>

				{/* Variance + value */}
				<div className="grid grid-cols-2 gap-3 border-t border-border-default/60 px-3 py-2.5 text-fluid-caption">
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
					<div className="flex items-center gap-2 border-t border-border-default/60 p-2.5">
						<button
							type="button"
							onClick={handleMatch}
							disabled={pending || countedNum === line.system_qty}
							className="press-down inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
							title={`Set Stok Fisik = ${formatQty(line.system_qty, line.item.unit)} ${line.item.unit}`}
						>
							<Equal className="size-3" />
							Match
						</button>
						<input
							type="text"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							onBlur={handleBlur}
							placeholder="Catatan (opsional)"
							maxLength={200}
							className="h-8 min-w-0 flex-1 rounded-md border border-border-default bg-background px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
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
			<td className="px-3 py-2.5 align-middle">
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
			<td className="px-3 py-2.5 align-middle text-right">
				<div>
					<span className="tabular text-fluid-caption font-medium text-foreground">
						{formatQty(line.system_qty, line.item.unit)}
					</span>
					<span className="ml-1 text-[10px] text-muted-foreground/70">
						{line.item.unit}
					</span>
				</div>
				{systemConversion && (
					<div className="text-[10px] text-muted-foreground/70">
						≈ {systemConversion}
					</div>
				)}
			</td>
			<td className="px-3 py-2.5 align-middle">
				{editable ? (
					<div className="mx-auto w-32 space-y-1">
						<div className="relative">
							<input
								type="number"
								inputMode={isFractional ? "decimal" : "numeric"}
								min={0}
								step={stepAttr}
								value={counted}
								onChange={(e) => setCounted(e.target.value)}
								onBlur={handleBlur}
								placeholder="—"
								className="h-9 w-full rounded-md border border-border-default bg-background px-2 pr-9 text-right text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
							/>
							<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
								{line.item.unit}
							</span>
						</div>
						{countedConversion && (
							<div className="text-right text-[10px] text-muted-foreground/70">
								≈ {countedConversion}
							</div>
						)}
					</div>
				) : (
					<div className="text-center tabular text-fluid-caption">
						{countedNum === null
							? "—"
							: `${formatQty(countedNum, line.item.unit)} ${line.item.unit}`}
						{countedConversion && (
							<div className="text-[10px] text-muted-foreground/70">
								≈ {countedConversion}
							</div>
						)}
					</div>
				)}
			</td>
			<td className="px-3 py-2.5 align-middle text-right">
				<span
					className={`tabular text-fluid-caption font-medium ${varianceTone}`}
				>
					{varianceLabel}
				</span>
			</td>
			<td className="px-3 py-2.5 align-middle text-right">
				<span className={`tabular text-fluid-caption font-medium ${valueTone}`}>
					{valueLabel}
				</span>
			</td>
			<td className="px-3 py-2.5 align-middle">
				{editable ? (
					<input
						type="text"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						onBlur={handleBlur}
						placeholder="(opsional)"
						maxLength={200}
						className="h-8 w-full rounded-md border border-border-default bg-background px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				) : (
					<span className="text-fluid-caption italic text-muted-foreground">
						{line.notes ?? "—"}
					</span>
				)}
			</td>
			{editable && (
				<td className="px-3 py-2.5 align-middle text-right">
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
							className="press-down inline-flex h-7 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
							title={`Set Stok Fisik = ${formatQty(line.system_qty, line.item.unit)} ${line.item.unit}`}
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
