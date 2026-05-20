"use client";

import { Check, Equal } from "lucide-react";
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
	const variance =
		countedNum === null || !Number.isFinite(countedNum)
			? null
			: countedNum - line.system_qty;
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

	// Visual state of the row
	const state: "pending" | "ok" | "variance" | "modified" =
		countedNum === null
			? "pending"
			: !Number.isFinite(countedNum)
				? "pending"
				: variance === 0
					? "ok"
					: "variance";

	const dotTone =
		state === "pending"
			? "bg-muted-foreground/30"
			: state === "ok"
				? "bg-emerald-500"
				: "bg-amber-500";

	const varianceLabel =
		variance === null
			? "—"
			: variance === 0
				? "0"
				: `${variance > 0 ? "+" : ""}${formatQty(variance, line.item.unit)}`;
	const varianceTone =
		variance === null || variance === 0
			? "text-muted-foreground/60"
			: variance > 0
				? "text-emerald-600 dark:text-emerald-400"
				: "text-rose-600 dark:text-rose-400";

	if (layout === "card") {
		return (
			<div className="rounded-lg border border-border-default bg-surface-2 p-3">
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 flex-1 items-start gap-2">
						<span
							className={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone}`}
							aria-hidden
						/>
						<div className="min-w-0">
							<div className="line-clamp-2 text-fluid-caption font-medium text-foreground">
								{line.item.name}
							</div>
							<div className="tabular text-[10px] text-muted-foreground/80">
								{line.item.sku} · {line.item.unit}
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

				<div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
					<div className="text-[10px] text-muted-foreground">
						Sistem
						<div className="tabular text-fluid-caption font-medium text-foreground">
							{formatQty(line.system_qty, line.item.unit)}
						</div>
					</div>
					{editable ? (
						<input
							type="number"
							inputMode={isFractional ? "decimal" : "numeric"}
							min={0}
							step={stepAttr}
							value={counted}
							onChange={(e) => setCounted(e.target.value)}
							onBlur={handleBlur}
							placeholder={`Hitung (${line.item.unit})`}
							className="h-9 rounded-md border border-border-default bg-background px-2 text-center text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
						/>
					) : (
						<div className="text-center text-fluid-caption tabular">
							{countedNum === null
								? "—"
								: formatQty(countedNum, line.item.unit)}{" "}
							{line.item.unit}
						</div>
					)}
					<div className="text-right text-[10px] text-muted-foreground">
						Selisih
						<div className={`tabular text-fluid-caption font-medium ${varianceTone}`}>
							{varianceLabel}
						</div>
					</div>
				</div>

				{editable && (
					<div className="mt-2 flex items-center gap-2">
						<button
							type="button"
							onClick={handleMatch}
							disabled={pending || countedNum === line.system_qty}
							className="press-down inline-flex h-7 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
							title={`Set hitung fisik = ${formatQty(line.system_qty, line.item.unit)} ${line.item.unit}`}
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
							className="h-7 min-w-0 flex-1 rounded-md border border-border-default bg-background px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
						/>
					</div>
				)}
			</div>
		);
	}

	// Row layout (table cell)
	return (
		<tr className="transition-colors hover:bg-muted/20">
			<td className="px-3 py-2.5 align-middle">
				<div className="flex items-start gap-2">
					<span
						className={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone}`}
						aria-hidden
					/>
					<div className="space-y-0.5">
						<div className="text-fluid-caption font-medium text-foreground">
							{line.item.name}
						</div>
						<div className="tabular text-[10px] text-muted-foreground/80">
							{line.item.sku} · {line.item.unit}
						</div>
					</div>
				</div>
			</td>
			<td className="px-3 py-2.5 align-middle text-center tabular text-fluid-caption">
				{formatQty(line.system_qty, line.item.unit)}
			</td>
			<td className="px-3 py-2.5 align-middle text-center">
				{editable ? (
					<input
						type="number"
						inputMode={isFractional ? "decimal" : "numeric"}
						min={0}
						step={stepAttr}
						value={counted}
						onChange={(e) => setCounted(e.target.value)}
						onBlur={handleBlur}
						placeholder="—"
						className="h-8 w-24 rounded-md border border-border-default bg-background px-2 text-center text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				) : (
					<span className="tabular text-fluid-caption">
						{countedNum === null ? "—" : formatQty(countedNum, line.item.unit)}
					</span>
				)}
			</td>
			<td className="px-3 py-2.5 align-middle text-center">
				<span
					className={`tabular text-fluid-caption font-medium ${varianceTone}`}
				>
					{varianceLabel}
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
							title={`Set hitung fisik = ${formatQty(line.system_qty, line.item.unit)} ${line.item.unit}`}
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
