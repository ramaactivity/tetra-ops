"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { updateStockTakeLine } from "@/lib/actions/stock-takes";

interface StockTakeLine {
	stock_take_id: string;
	item_id: string;
	system_qty: number;
	counted_qty: number;
	variance: number;
	notes: string | null;
}

interface ItemRef {
	id: string;
	sku: string;
	name: string;
	category: string;
	unit: string;
}

export function StockTakeLineRow({
	line,
	item,
	editable,
}: {
	line: StockTakeLine;
	item: ItemRef;
	editable: boolean;
}) {
	const [counted, setCounted] = useState(String(line.counted_qty));
	const [notes, setNotes] = useState(line.notes ?? "");
	const [pending, startTransition] = useTransition();
	const [savedTick, setSavedTick] = useState(false);

	const countedNum = Number(counted);
	const variance = Number.isFinite(countedNum)
		? countedNum - line.system_qty
		: 0;
	const dirty =
		countedNum !== line.counted_qty || (notes ?? "") !== (line.notes ?? "");

	function handleSave() {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("stock_take_id", line.stock_take_id);
			fd.set("item_id", line.item_id);
			fd.set("counted_qty", counted);
			fd.set("notes", notes);
			const res = await updateStockTakeLine(fd);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				setSavedTick(true);
				setTimeout(() => setSavedTick(false), 1500);
			}
		});
	}

	const varianceTone =
		variance === 0
			? "text-muted-foreground/60"
			: variance > 0
				? "text-emerald-600 dark:text-emerald-400"
				: "text-rose-600 dark:text-rose-400";

	return (
		<tr className="hover:bg-muted/20 transition-colors">
			<td className="px-3 py-2.5 align-middle">
				<div className="space-y-0.5">
					<div className="text-fluid-caption font-medium text-foreground">
						{item.name}
					</div>
					<div className="tabular text-[10px] text-muted-foreground/80">
						{item.sku} · {item.unit}
					</div>
				</div>
			</td>
			<td className="px-3 py-2.5 align-middle text-center tabular text-fluid-caption">
				{line.system_qty}
			</td>
			<td className="px-3 py-2.5 align-middle text-center">
				{editable ? (
					<input
						type="number"
						min={0}
						value={counted}
						onChange={(e) => setCounted(e.target.value)}
						className="h-8 w-20 rounded-md border border-border-default bg-background px-2 text-center text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				) : (
					<span className="tabular text-fluid-caption">{line.counted_qty}</span>
				)}
			</td>
			<td className="px-3 py-2.5 align-middle text-center">
				<span className={`tabular text-fluid-caption font-medium ${varianceTone}`}>
					{variance > 0 ? "+" : ""}
					{variance}
				</span>
			</td>
			<td className="px-3 py-2.5 align-middle">
				{editable ? (
					<input
						type="text"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="(optional)"
						className="h-8 w-full rounded-md border border-border-default bg-background px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				) : (
					<span className="text-fluid-caption text-muted-foreground italic">
						{line.notes ?? "—"}
					</span>
				)}
			</td>
			{editable && (
				<td className="px-3 py-2.5 align-middle text-right">
					<div className="flex items-center justify-end gap-1.5">
						{savedTick && (
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
							onClick={handleSave}
							disabled={!dirty || pending}
							className="press-down inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{pending ? "..." : "Save"}
						</button>
					</div>
				</td>
			)}
		</tr>
	);
}
