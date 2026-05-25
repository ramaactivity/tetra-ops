"use client";

import { Plus, X } from "lucide-react";
import { useId } from "react";
import {
	type Bundle,
	listInputUnits,
	toBase,
	type UnitConversionMap,
} from "@/lib/inventory/unit-conversion";

/**
 * Multi-bundle qty input — admin enters stock as a list of (qty, unit) pairs
 * to mirror physical reality (e.g. "10 pack + 500 pcs (pack terbuka #1) +
 * 200 pcs (pack terbuka #2)" → 10.700 pcs base). Used in Stock Opname.
 *
 * Notion-style: no 1px borders between rows, tonal `bg-surface-1` per bundle,
 * pill unit selector, single muted "Tambah bundle" CTA at the bottom.
 */
export function StockBundleInput({
	bundles,
	onChange,
	map,
	disabled = false,
	autoFocusFirst = false,
}: {
	bundles: Bundle[];
	onChange: (next: Bundle[]) => void;
	map: UnitConversionMap;
	disabled?: boolean;
	autoFocusFirst?: boolean;
}) {
	const formId = useId();
	const units = listInputUnits(map);
	const defaultUnit = map.base_unit;

	function update(idx: number, patch: Partial<Bundle>) {
		const next = bundles.map((b, i) => (i === idx ? { ...b, ...patch } : b));
		onChange(next);
	}

	function remove(idx: number) {
		onChange(bundles.filter((_, i) => i !== idx));
	}

	function add() {
		onChange([...bundles, { qty: 0, unit: defaultUnit }]);
	}

	const rows = bundles.length > 0 ? bundles : [];

	return (
		<div className="space-y-2">
			{rows.map((b, idx) => {
				const qtyNum = Number(b.qty);
				const baseQty = (() => {
					if (!Number.isFinite(qtyNum) || !b.unit) return 0;
					try {
						return toBase(qtyNum, b.unit, map);
					} catch {
						return 0;
					}
				})();
				const unitDef = map.units[b.unit];
				const isBase = unitDef?.kind === "base";

				return (
					<div
						key={`${formId}-${idx}`}
						className="group flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-2"
					>
						<input
							type="number"
							inputMode="decimal"
							step="any"
							min={0}
							value={Number.isFinite(qtyNum) ? String(b.qty) : ""}
							onChange={(e) =>
								update(idx, {
									qty: e.target.value === "" ? 0 : Number(e.target.value),
								})
							}
							disabled={disabled}
							autoFocus={autoFocusFirst && idx === 0}
							placeholder="0"
							className="h-9 w-24 rounded-md bg-background/60 px-2 text-right text-sm tabular font-medium focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
						/>
						<select
							value={b.unit}
							onChange={(e) => update(idx, { unit: e.target.value })}
							disabled={disabled}
							className="h-9 min-w-[100px] rounded-md bg-background/60 px-2 text-sm focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
						>
							{units.map(({ code, def }) => (
								<option key={code} value={code}>
									{def.label || code}
								</option>
							))}
						</select>
						{!isBase && baseQty > 0 && (
							<span className="text-[11px] tabular text-muted-foreground">
								={" "}
								{baseQty.toLocaleString("id-ID", {
									maximumFractionDigits: 4,
								})}{" "}
								{map.base_unit}
							</span>
						)}
						<input
							type="text"
							value={b.note ?? ""}
							onChange={(e) =>
								update(idx, {
									note: e.target.value.trim() === "" ? null : e.target.value,
								})
							}
							disabled={disabled}
							placeholder="catatan (opsional)"
							maxLength={80}
							className="h-9 min-w-0 flex-1 rounded-md bg-background/0 px-2 text-[12px] text-muted-foreground focus:bg-background focus:text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
						/>
						{!disabled && (
							<button
								type="button"
								onClick={() => remove(idx)}
								className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
								title="Hapus bundle ini"
								aria-label="Hapus bundle"
							>
								<X className="size-3.5" />
							</button>
						)}
					</div>
				);
			})}

			{!disabled && (
				<button
					type="button"
					onClick={add}
					className="press-down inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
				>
					<Plus className="size-3.5" />
					Tambah bundle
				</button>
			)}
		</div>
	);
}
