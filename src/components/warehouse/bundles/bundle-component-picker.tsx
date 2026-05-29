"use client";

import { Plus, X } from "lucide-react";
import { useId } from "react";
import { Combobox } from "@/components/ui/combobox";
import { formatRupiah } from "@/lib/format";

export type BundleComponentItem = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	purchase_price_avg: number;
};

export type BundleComponentRow = {
	item_id: string;
	qty: number;
	notes?: string | null;
};

/**
 * Multi-row picker untuk komponen bundle. Tiap baris: item (Combobox dari
 * inventory yg flagged `is_bom_component`) + qty + notes opsional + remove.
 * Total HPP estimate dihitung otomatis di footer.
 */
export function BundleComponentPicker({
	items,
	rows,
	onChange,
	disabled = false,
}: {
	items: BundleComponentItem[];
	rows: BundleComponentRow[];
	onChange: (next: BundleComponentRow[]) => void;
	disabled?: boolean;
}) {
	const formId = useId();
	const itemMap = new Map(items.map((i) => [i.id, i]));

	function update(idx: number, patch: Partial<BundleComponentRow>) {
		onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
	}

	function remove(idx: number) {
		onChange(rows.filter((_, i) => i !== idx));
	}

	function add() {
		onChange([...rows, { item_id: "", qty: 1, notes: null }]);
	}

	// Total estimated HPP per 1 bundle (sum of components × avg cost)
	const totalHpp = rows.reduce((sum, r) => {
		const item = itemMap.get(r.item_id);
		if (!item) return sum;
		return sum + r.qty * (item.purchase_price_avg ?? 0);
	}, 0);

	// Items yang sudah dipilih (untuk filter dropdown lain — prevent duplicate)
	const usedIds = new Set(rows.map((r) => r.item_id).filter(Boolean));

	return (
		<div className="space-y-3">
			{rows.length === 0 ? (
				<div className="rounded-md border border-dashed border-foreground/10 bg-surface-3 p-6 text-center">
					<p className="text-sm font-medium">Belum ada komponen</p>
					<p className="text-muted-foreground mt-1 text-[12px]">
						Klik "Tambah komponen" untuk pilih item yang masuk bundle ini.
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{rows.map((r, idx) => {
						const selectedItem = itemMap.get(r.item_id);
						// Filter: tampilkan semua item, tapi disable yg sudah dipakai (kecuali current row)
						// Combobox option label = nama saja (clean), SKU di sublabel.
					const itemOptions = [
							{ value: "", label: "Pilih item komponen" },
							...items.map((i) => ({
								value: i.id,
								label:
									usedIds.has(i.id) && i.id !== r.item_id
										? `${i.name} (sudah dipilih)`
										: i.name,
								sublabel: i.sku,
							})),
						];

						const lineSubtotal =
							r.qty * (selectedItem?.purchase_price_avg ?? 0);

						return (
							<div
								key={`${formId}-${idx}`}
								className="bg-surface-3 grid items-start gap-3 rounded-md p-3 md:grid-cols-[1fr_140px_160px_32px]"
							>
								<div className="space-y-1">
									<label className="text-muted-foreground text-[10px] uppercase tracking-wider">
										Item
									</label>
									<Combobox
										id={`${formId}-item-${idx}`}
										value={r.item_id}
										onValueChange={(v) => update(idx, { item_id: v ?? "" })}
										options={itemOptions}
										placeholder="Pilih item komponen"
										allowFreeText={false}
									/>
									{selectedItem && (
										<p className="text-muted-foreground text-[11px] tabular">
											Avg cost {formatRupiah(selectedItem.purchase_price_avg)}{" "}
											/ {selectedItem.unit}
										</p>
									)}
								</div>
								<div className="space-y-1">
									<label className="text-muted-foreground text-[10px] uppercase tracking-wider">
										Qty / bundle
									</label>
									<input
										type="number"
										min={0.0001}
										step="any"
										value={r.qty}
										onChange={(e) =>
											update(idx, { qty: Number(e.target.value) || 0 })
										}
										disabled={disabled}
										className="border-border-default bg-background h-9 w-full rounded-md border px-2 text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
									/>
									{selectedItem && (
										<p className="text-muted-foreground text-[11px] tabular">
											= {formatRupiah(lineSubtotal)}
										</p>
									)}
								</div>
								<div className="space-y-1">
									<label className="text-muted-foreground text-[10px] uppercase tracking-wider">
										Catatan
									</label>
									<input
										type="text"
										value={r.notes ?? ""}
										onChange={(e) =>
											update(idx, {
												notes: e.target.value.trim() === "" ? null : e.target.value,
											})
										}
										disabled={disabled}
										placeholder="opsional"
										maxLength={120}
										className="border-border-default bg-background h-9 w-full rounded-md border px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
									/>
								</div>
								<div className="flex justify-end pt-5">
									{!disabled && (
										<button
											type="button"
											onClick={() => remove(idx)}
											className="text-muted-foreground/60 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 inline-flex size-7 items-center justify-center rounded-md"
											title="Hapus komponen"
										>
											<X className="size-3.5" />
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			<div className="flex items-center justify-between gap-3">
				{!disabled && (
					<button
						type="button"
						onClick={add}
						className="press-down text-muted-foreground hover:bg-surface-2 hover:text-foreground inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium"
					>
						<Plus className="size-3.5" />
						Tambah komponen
					</button>
				)}
				{rows.length > 0 && (
					<div className="text-[12px] text-muted-foreground">
						Estimasi HPP per 1 bundle:{" "}
						<strong className="text-foreground tabular">
							{formatRupiah(totalHpp)}
						</strong>
					</div>
				)}
			</div>
		</div>
	);
}
