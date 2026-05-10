"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { updateRekapMapping } from "@/lib/actions/rekap-mapping";
import {
	REKAP_FIELD_HINTS,
	REKAP_FIELD_LABELS,
	type RekapField,
} from "@/lib/rekap-mapping/types";

interface RekapMappingRow {
	rekap_field: RekapField;
	item_id: string | null;
	qty_per_unit: number;
	is_active: boolean;
}

interface ItemOption {
	id: string;
	sku: string;
	name: string;
	purchase_price_avg: number | null;
}

interface Props {
	mappings: RekapMappingRow[];
	items: ItemOption[];
}

export function RekapMappingForm({ mappings, items }: Props) {
	const itemSelectOptions = [
		{ value: "", label: "— pilih item —" },
		...items.map((i) => ({
			value: i.id,
			label: `${i.sku} — ${i.name}`,
		})),
	];

	return (
		<div className="overflow-hidden rounded-xl border border-border-default bg-surface-2">
			<table className="w-full text-sm">
				<thead className="border-b border-border-default bg-surface-3/40">
					<tr className="text-left">
						<th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							Rekap Field
						</th>
						<th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							Mapped Item
						</th>
						<th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							Qty/unit
						</th>
						<th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							Aktif
						</th>
						<th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							Action
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border-default/50">
					{mappings.map((row) => (
						<MappingRow
							key={row.rekap_field}
							row={row}
							items={items}
							itemSelectOptions={itemSelectOptions}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}

function MappingRow({
	row,
	items,
	itemSelectOptions,
}: {
	row: RekapMappingRow;
	items: ItemOption[];
	itemSelectOptions: Array<{ value: string; label: string }>;
}) {
	const [itemId, setItemId] = useState<string>(row.item_id ?? "");
	const [qtyPerUnit, setQtyPerUnit] = useState<string>(String(row.qty_per_unit));
	const [isActive, setIsActive] = useState<boolean>(row.is_active);
	const [pending, startTransition] = useTransition();
	const [savedTick, setSavedTick] = useState(false);

	const dirty =
		itemId !== (row.item_id ?? "") ||
		Number(qtyPerUnit) !== row.qty_per_unit ||
		isActive !== row.is_active;

	const item = items.find((i) => i.id === itemId);

	function handleSave() {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("rekap_field", row.rekap_field);
			fd.set("item_id", itemId);
			fd.set("qty_per_unit", qtyPerUnit);
			fd.set("is_active", isActive ? "true" : "false");
			const res = await updateRekapMapping(fd);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(`${REKAP_FIELD_LABELS[row.rekap_field]} disimpan`);
				setSavedTick(true);
				setTimeout(() => setSavedTick(false), 1500);
			}
		});
	}

	return (
		<tr className="hover:bg-muted/30 transition-colors">
			<td className="px-3 py-3 align-top">
				<div className="space-y-0.5">
					<div className="font-medium text-foreground">
						{REKAP_FIELD_LABELS[row.rekap_field]}
					</div>
					<div className="tabular text-[10px] text-muted-foreground/80">
						{row.rekap_field}
					</div>
					<p className="max-w-xs text-[11px] text-muted-foreground/80 italic">
						{REKAP_FIELD_HINTS[row.rekap_field]}
					</p>
				</div>
			</td>
			<td className="px-3 py-3 align-top">
				<div className="space-y-1">
					<NativeSelect
						value={itemId}
						onValueChange={setItemId}
						options={itemSelectOptions}
						placeholder="— pilih item —"
						aria-label={`Map ${row.rekap_field} ke item`}
					/>
					{item && item.purchase_price_avg !== null && (
						<div className="text-[10px] text-muted-foreground tabular">
							avg cost: Rp {item.purchase_price_avg.toLocaleString("id-ID")}
						</div>
					)}
				</div>
			</td>
			<td className="px-3 py-3 align-top text-center">
				<input
					type="number"
					min={1}
					value={qtyPerUnit}
					onChange={(e) => setQtyPerUnit(e.target.value)}
					className="h-8 w-16 rounded-md border border-border-default bg-background px-2 text-center text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
			</td>
			<td className="px-3 py-3 align-top text-center">
				<button
					type="button"
					onClick={() => setIsActive((v) => !v)}
					className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors ${
						isActive
							? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							: "border-border-default bg-surface-3 text-muted-foreground"
					}`}
					aria-pressed={isActive}
				>
					{isActive ? (
						<Eye className="size-3" />
					) : (
						<EyeOff className="size-3" />
					)}
					{isActive ? "Aktif" : "Off"}
				</button>
			</td>
			<td className="px-3 py-3 align-top text-right">
				<div className="flex items-center justify-end gap-2">
					{savedTick && (
						<Badge
							variant="outline"
							className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
						>
							<Check className="size-2.5" />
							Saved
						</Badge>
					)}
					<button
						type="button"
						onClick={handleSave}
						disabled={!dirty || pending}
						className="press-down inline-flex h-8 items-center rounded-md bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{pending ? "Saving..." : "Save"}
					</button>
				</div>
			</td>
		</tr>
	);
}
