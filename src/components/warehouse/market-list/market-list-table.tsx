"use client";

import { Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toaster";
import { formatRupiah } from "@/lib/format";
import {
	deleteSupplierPrice,
	setPrimarySupplierPrice,
} from "@/lib/actions/suppliers";
import { MarketEntryDialog } from "./market-entry-dialog";

export type MarketListItem = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	unit_conversion: Record<string, number> | null;
	purchase_price_avg: number;
};

export type MarketListEntry = {
	id: string;
	supplier_id: string;
	supplier_name: string;
	item_id: string;
	pack_price: number;
	pack_size: number;
	pack_unit: string;
	is_primary: boolean;
	notes: string | null;
};

export type SupplierOption = {
	id: string;
	name: string;
};

function computeEffective(
	entry: MarketListEntry,
	item: MarketListItem,
): number {
	const conv = item.unit_conversion;
	let baseQty = entry.pack_size;
	if (entry.pack_unit !== item.unit && conv && conv[entry.pack_unit]) {
		baseQty = entry.pack_size * conv[entry.pack_unit];
	}
	return baseQty > 0 ? entry.pack_price / baseQty : 0;
}

export function MarketListTable({
	items,
	entries,
	suppliers,
}: {
	items: MarketListItem[];
	entries: MarketListEntry[];
	suppliers: SupplierOption[];
}) {
	const [query, setQuery] = useState("");
	const [onlyPrimary, setOnlyPrimary] = useState(false);
	const [editing, setEditing] = useState<{
		mode: "create" | "edit";
		entry?: MarketListEntry;
		item?: MarketListItem;
	} | null>(null);
	const [deleting, setDeleting] = useState<MarketListEntry | null>(null);

	const entriesByItem = useMemo(() => {
		const map = new Map<string, MarketListEntry[]>();
		for (const e of entries) {
			const arr = map.get(e.item_id) ?? [];
			arr.push(e);
			map.set(e.item_id, arr);
		}
		// Sort: primary first, then by supplier name
		for (const arr of map.values()) {
			arr.sort((a, b) => {
				if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
				return a.supplier_name.localeCompare(b.supplier_name);
			});
		}
		return map;
	}, [entries]);

	const counts = useMemo(() => {
		let withPrimary = 0;
		for (const arr of entriesByItem.values()) {
			if (arr.some((e) => e.is_primary)) withPrimary++;
		}
		return {
			items: items.length,
			withEntries: entriesByItem.size,
			withPrimary,
			totalEntries: entries.length,
		};
	}, [items, entriesByItem, entries]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return items.filter((item) => {
			const itemEntries = entriesByItem.get(item.id) ?? [];
			if (onlyPrimary && !itemEntries.some((e) => e.is_primary)) return false;
			if (!q) return true;
			if (item.name.toLowerCase().includes(q)) return true;
			if (item.sku.toLowerCase().includes(q)) return true;
			if (
				itemEntries.some((e) => e.supplier_name.toLowerCase().includes(q))
			)
				return true;
			return false;
		});
	}, [items, entriesByItem, query, onlyPrimary]);

	if (items.length === 0) {
		return (
			<EmptyState
				icon={Star}
				title="Belum ada item"
				description="Tambah SKU di tab Consumables dulu, baru bisa tag supplier-nya di sini."
			/>
		);
	}

	return (
		<div className="space-y-3">
			<div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-fluid-caption text-foreground">
				<div className="mb-1 flex items-center gap-1.5 font-semibold text-sky-700 dark:text-sky-300">
					<Star className="size-3.5" /> Market List
				</div>
				<ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
					<li>
						Catatan harga per (Supplier × Item) — bandingin harga multi-supplier.
					</li>
					<li>
						Tag ⭐ <strong>Primary</strong> per item — effective cost-nya
						auto-sync ke <code>purchase_price_avg</code> (drives HPP + Nilai).
					</li>
					<li>
						Kalau pack unit beda dari base unit, sistem konversi via{" "}
						<code>unit_conversion</code> JSONB.
					</li>
				</ul>
			</div>

			<div className="grid gap-2 sm:grid-cols-3">
				<MetricChip
					label="Items"
					value={`${counts.items}`}
					hint={`${counts.withEntries} sudah ada entry`}
				/>
				<MetricChip
					label="Primary set"
					value={`${counts.withPrimary} / ${counts.items}`}
					hint="item dengan ⭐ supplier utama"
					tone={counts.withPrimary === counts.items ? "emerald" : "amber"}
				/>
				<MetricChip
					label="Total entries"
					value={`${counts.totalEntries}`}
					hint="kombinasi supplier × item"
				/>
			</div>

			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative flex-1 sm:max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari item / SKU / supplier..."
						className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-caption placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				</div>
				<label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-fluid-caption">
					<input
						type="checkbox"
						checked={onlyPrimary}
						onChange={(e) => setOnlyPrimary(e.target.checked)}
						className="size-3.5"
					/>
					Primary saja
				</label>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada item yang cocok.
				</div>
			) : (
				<div className="space-y-3">
					{filtered.map((item) => {
						const itemEntries = entriesByItem.get(item.id) ?? [];
						return (
							<ItemCard
								key={item.id}
								item={item}
								entries={itemEntries}
								onAdd={() => setEditing({ mode: "create", item })}
								onEdit={(entry) =>
									setEditing({ mode: "edit", entry, item })
								}
								onDelete={(entry) => setDeleting(entry)}
							/>
						);
					})}
				</div>
			)}

			{editing && editing.item && (
				<MarketEntryDialog
					open={!!editing}
					onOpenChange={(o) => !o && setEditing(null)}
					mode={editing.mode}
					item={editing.item}
					entry={editing.entry}
					suppliers={suppliers}
				/>
			)}

			<ConfirmDialog
				open={!!deleting}
				onOpenChange={(o) => !o && setDeleting(null)}
				title="Hapus entry Market List?"
				description={
					deleting
						? `Entry "${deleting.supplier_name}" untuk item ini akan dihapus permanen. Tidak akan mempengaruhi stok atau movements yang sudah terjadi.`
						: ""
				}
				confirmLabel="Hapus"
				variant="destructive"
				onConfirm={async () => {
					if (!deleting) return;
					try {
						await deleteSupplierPrice(deleting.id);
						toast.success("Entry dihapus");
						setDeleting(null);
					} catch (e) {
						const msg = e instanceof Error ? e.message : "Gagal hapus";
						toast.error(msg);
					}
				}}
			/>
		</div>
	);
}

function ItemCard({
	item,
	entries,
	onAdd,
	onEdit,
	onDelete,
}: {
	item: MarketListItem;
	entries: MarketListEntry[];
	onAdd: () => void;
	onEdit: (entry: MarketListEntry) => void;
	onDelete: (entry: MarketListEntry) => void;
}) {
	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3">
			<div className="flex items-start justify-between gap-3 pb-2">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold text-foreground">{item.name}</span>
						<Badge variant="outline" className="h-5 px-1.5 text-[10px]">
							{item.sku}
						</Badge>
					</div>
					<div className="mt-0.5 text-[11px] text-muted-foreground">
						Unit master: {item.unit} · {entries.length} supplier ·
						{item.purchase_price_avg > 0
							? ` Avg HPP: ${formatRupiah(item.purchase_price_avg)} / ${item.unit}`
							: " Avg HPP belum di-set"}
					</div>
				</div>
				<button
					type="button"
					onClick={onAdd}
					className="press-down inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-1 px-2.5 text-[12px] font-medium text-foreground hover:bg-surface-3"
				>
					<Plus className="size-3.5" />
					Tambah Supplier
				</button>
			</div>

			{entries.length === 0 ? (
				<div className="rounded-md border border-dashed border-border-default/60 bg-surface-1/50 p-3 text-center text-[11px] text-muted-foreground">
					Belum ada supplier. Klik <span className="font-medium">Tambah Supplier</span> di kanan.
				</div>
			) : (
				<div className="space-y-1.5">
					{entries.map((e) => {
						const effective = computeEffective(e, item);
						return (
							<div
								key={e.id}
								className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${
									e.is_primary
										? "border-emerald-500/30 bg-emerald-500/5"
										: "border-border-default/60 bg-surface-1/50"
								}`}
							>
								<div className="flex min-w-0 flex-1 items-center gap-2">
									{e.is_primary ? (
										<Star className="size-3.5 shrink-0 fill-emerald-500 text-emerald-500" />
									) : (
										<button
											type="button"
											onClick={async () => {
												try {
													await setPrimarySupplierPrice(e.id);
													toast.success(
														`${e.supplier_name} di-set Primary — HPP synced`,
													);
												} catch (err) {
													const msg =
														err instanceof Error
															? err.message
															: "Gagal set Primary";
													toast.error(msg);
												}
											}}
											className="press-down inline-flex h-6 items-center gap-1 rounded border border-border-default bg-surface-2 px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
											title="Tag sebagai Primary supplier untuk item ini"
										>
											<Star className="size-3" /> Set Primary
										</button>
									)}
									<span
										className={`text-fluid-caption ${e.is_primary ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
									>
										{e.supplier_name}
									</span>
								</div>
								<div className="flex items-center gap-3 text-fluid-caption">
									<div className="text-right">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Pack
										</div>
										<div className="tabular font-medium text-foreground">
											{formatRupiah(e.pack_price)} / {e.pack_size}{" "}
											{e.pack_unit}
										</div>
									</div>
									<div className="text-right">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Effective
										</div>
										<div
											className={`tabular font-semibold ${e.is_primary ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}
										>
											{formatRupiah(Math.round(effective))} / {item.unit}
										</div>
									</div>
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => onEdit(e)}
											className="press-down inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-3 hover:text-foreground"
											title="Edit entry"
										>
											<Pencil className="size-3.5" />
										</button>
										<button
											type="button"
											onClick={() => onDelete(e)}
											className="press-down inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
											title="Hapus entry"
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function MetricChip({
	label,
	value,
	hint,
	tone = "default",
}: {
	label: string;
	value: string;
	hint: string;
	tone?: "default" | "emerald" | "amber";
}) {
	const cls =
		tone === "emerald"
			? "border-emerald-500/30 bg-emerald-500/5"
			: tone === "amber"
				? "border-amber-500/30 bg-amber-500/5"
				: "border-border-default bg-surface-2";
	return (
		<div className={`rounded-lg border p-3 ${cls}`}>
			<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 text-fluid-h3 font-semibold text-foreground tabular">
				{value}
			</div>
			<div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
		</div>
	);
}
