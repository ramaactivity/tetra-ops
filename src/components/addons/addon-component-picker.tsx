"use client";

import { Plus, X } from "lucide-react";
import { useId } from "react";
import { Combobox } from "@/components/ui/combobox";
import { formatRupiah } from "@/lib/format";

export type AddonComponentItem = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	purchase_price_avg: number;
};

export type AddonComponentRow = {
	item_id: string;
	qty: number;
};

/**
 * Multi-row picker untuk komponen inventory yang dikonsumsi 1 add-on.
 * Tiap baris: item (Combobox dari inventory) + qty per 1 pesanan add-on + remove.
 * Cth: Guest Book = 1 Scrapbook + 1 Spidol. Estimasi HPP per 1 add-on di footer.
 */
export function AddonComponentPicker({
	items,
	rows,
	onChange,
	disabled = false,
}: {
	items: AddonComponentItem[];
	rows: AddonComponentRow[];
	onChange: (next: AddonComponentRow[]) => void;
	disabled?: boolean;
}) {
	const formId = useId();
	const itemMap = new Map(items.map((i) => [i.id, i]));

	function update(idx: number, patch: Partial<AddonComponentRow>) {
		onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
	}
	function remove(idx: number) {
		onChange(rows.filter((_, i) => i !== idx));
	}
	function add() {
		onChange([...rows, { item_id: "", qty: 1 }]);
	}

	const totalHpp = rows.reduce((sum, r) => {
		const item = itemMap.get(r.item_id);
		return item ? sum + r.qty * (item.purchase_price_avg ?? 0) : sum;
	}, 0);

	const usedIds = new Set(rows.map((r) => r.item_id).filter(Boolean));

	return (
		<div className="space-y-3">
			{rows.length === 0 ? (
				<div className="border-foreground/10 bg-surface-3 rounded-md border border-dashed p-6 text-center">
					<p className="text-sm font-medium">Tidak di-link ke stok</p>
					<p className="text-muted-foreground mt-1 text-[12px]">
						Add-on ini tidak mengurangi stok. Klik "Tambah item" kalau add-on
						consume stok fisik (cth. Guest Book = Scrapbook + Spidol).
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{rows.map((r, idx) => {
						const selectedItem = itemMap.get(r.item_id);
						const itemOptions = [
							{ value: "", label: "Pilih item" },
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
								className="bg-surface-3 grid items-start gap-3 rounded-md p-3 md:grid-cols-[1fr_160px_32px]"
							>
								<div className="space-y-1">
									<label
										htmlFor={`${formId}-item-${idx}`}
										className="text-muted-foreground text-[10px] uppercase tracking-wider"
									>
										Item
									</label>
									<Combobox
										id={`${formId}-item-${idx}`}
										value={r.item_id}
										onValueChange={(v) => update(idx, { item_id: v ?? "" })}
										options={itemOptions}
										placeholder="Pilih item"
										allowFreeText={false}
									/>
									{selectedItem && (
										<p className="text-muted-foreground text-[11px] tabular">
											Avg cost {formatRupiah(selectedItem.purchase_price_avg)} /{" "}
											{selectedItem.unit}
										</p>
									)}
								</div>
								<div className="space-y-1">
									<label
										htmlFor={`${formId}-qty-${idx}`}
										className="text-muted-foreground text-[10px] uppercase tracking-wider"
									>
										Qty / pesanan
									</label>
									<input
										id={`${formId}-qty-${idx}`}
										type="number"
										min={0.0001}
										step="any"
										value={r.qty}
										onChange={(e) =>
											update(idx, { qty: Number(e.target.value) || 0 })
										}
										disabled={disabled}
										className="border-border-default bg-background tabular focus:ring-primary/40 h-9 w-full rounded-md border px-2 text-sm focus:border-[#059669] focus:outline-none focus:ring-1"
									/>
									{selectedItem && (
										<p className="text-muted-foreground text-[11px] tabular">
											= {formatRupiah(lineSubtotal)}
										</p>
									)}
								</div>
								<div className="flex justify-end pt-5">
									{!disabled && (
										<button
											type="button"
											onClick={() => remove(idx)}
											className="text-muted-foreground/60 inline-flex size-7 items-center justify-center rounded-md hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
											title="Hapus item"
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
						Tambah item
					</button>
				)}
				{rows.length > 0 && (
					<div className="text-muted-foreground text-[12px]">
						Estimasi HPP per 1 add-on:{" "}
						<strong className="text-foreground tabular">
							{formatRupiah(totalHpp)}
						</strong>
					</div>
				)}
			</div>
		</div>
	);
}
