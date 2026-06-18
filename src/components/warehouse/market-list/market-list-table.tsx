"use client";

import {
	ArrowUpRight,
	Pencil,
	Plus,
	Star,
	Trash2,
	Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import {
	deleteSupplierPrice,
	setPrimarySupplierPrice,
} from "@/lib/actions/suppliers";
import { MarketEntryDialog } from "./market-entry-dialog";

type SubTab = "items" | "suppliers";

export type MarketListItem = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	unit_conversion: Record<string, number> | null;
	purchase_price_avg: number;
	category: "inventory" | "fixed_asset";
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
	const router = useRouter();
	const [subTab, setSubTab] = useState<SubTab>("items");
	const [query, setQuery] = useState("");
	const [onlyPrimary, setOnlyPrimary] = useState(false);
	const [categoryFilter, setCategoryFilter] = useState<
		"all" | "inventory" | "fixed_asset"
	>("all");
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
		let inventoryCount = 0;
		let fixedAssetCount = 0;
		for (const it of items) {
			if (it.category === "fixed_asset") fixedAssetCount++;
			else inventoryCount++;
		}
		for (const arr of entriesByItem.values()) {
			if (arr.some((e) => e.is_primary)) withPrimary++;
		}
		return {
			items: items.length,
			inventoryCount,
			fixedAssetCount,
			withEntries: entriesByItem.size,
			withPrimary,
			totalEntries: entries.length,
		};
	}, [items, entriesByItem, entries]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return items.filter((item) => {
			if (categoryFilter !== "all" && item.category !== categoryFilter)
				return false;
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
	}, [items, entriesByItem, query, onlyPrimary, categoryFilter]);

	const supplierAggregates = useMemo(() => {
		const byId = new Map<
			string,
			{ id: string; name: string; entryCount: number; primaryCount: number }
		>();
		for (const s of suppliers) {
			byId.set(s.id, {
				id: s.id,
				name: s.name,
				entryCount: 0,
				primaryCount: 0,
			});
		}
		for (const e of entries) {
			const agg = byId.get(e.supplier_id);
			if (!agg) continue;
			agg.entryCount += 1;
			if (e.is_primary) agg.primaryCount += 1;
		}
		return Array.from(byId.values()).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
	}, [suppliers, entries]);

	const filteredSuppliers = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return supplierAggregates;
		return supplierAggregates.filter((s) => s.name.toLowerCase().includes(q));
	}, [supplierAggregates, query]);

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
					hint={`${counts.inventoryCount} Persediaan · ${counts.fixedAssetCount} Aset Tetap`}
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

			<SubTabBar current={subTab} onChange={setSubTab} />

			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<FilterSearchInput
					className="flex-1 sm:max-w-xs"
					value={query}
					onValueChange={setQuery}
					placeholder={
						subTab === "items"
							? "Cari item / SKU / supplier..."
							: "Cari supplier..."
					}
				/>
				{subTab === "items" && (
					<div className="flex flex-wrap items-center gap-2">
						<div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-1 shadow-[var(--shadow-level-1)]">
							{(
								[
									{ key: "all", label: "Semua", count: counts.items },
									{
										key: "inventory",
										label: "Persediaan",
										count: counts.inventoryCount,
									},
									{
										key: "fixed_asset",
										label: "Aset Tetap",
										count: counts.fixedAssetCount,
									},
								] as const
							).map((o) => {
								const active = o.key === categoryFilter;
								return (
									<button
										key={o.key}
										type="button"
										onClick={() => setCategoryFilter(o.key)}
										aria-pressed={active}
										className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
											active
												? "bg-[#059669] text-white"
												: "text-muted-foreground hover:bg-secondary hover:text-foreground"
										}`}
									>
										{o.label}
										<span
											className={`tabular text-[11px] ${active ? "opacity-80" : "text-muted-foreground/70"}`}
										>
											{o.count}
										</span>
									</button>
								);
							})}
						</div>
						<label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border-default bg-surface-2 px-3 text-[12px]">
							<input
								type="checkbox"
								checked={onlyPrimary}
								onChange={(e) => setOnlyPrimary(e.target.checked)}
								className="size-3.5"
							/>
							Primary saja
						</label>
					</div>
				)}
			</div>

			{subTab === "items" ? (
				filtered.length === 0 ? (
					<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
						Tidak ada item yang cocok.
					</div>
				) : (
					<div className="space-y-1.5">
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
				)
			) : (
				<SuppliersPanel rows={filteredSuppliers} />
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
						router.refresh();
					} catch (e) {
						const msg = e instanceof Error ? e.message : "Gagal hapus";
						toast.error(msg);
					}
				}}
			/>
		</div>
	);
}

/**
 * Grid template — synced parent row + inner vendor rows pakai grid yang sama
 * supaya kolom secara visual aligned end-to-end. Sengaja hardcode lebar
 * supaya angka tabular nggak loncat antar item.
 *
 * Cols: Item | Unit Master | Vendors | Avg Cost (right) | Action (88px)
 */
const PARENT_GRID =
	"grid items-center gap-3 grid-cols-[minmax(0,1fr)_88px_120px_minmax(160px,200px)_88px]";

/**
 * Inner vendor row — Supplier | Satuan Beli | Pack Size | Harga/Pack | Eff Cost | Actions
 */
const INNER_GRID =
	"grid items-center gap-3 grid-cols-[minmax(0,1fr)_100px_100px_140px_140px_72px]";

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
	const router = useRouter();
	const isFixed = item.category === "fixed_asset";
	const vendorCount = entries.length;

	return (
		<div className="overflow-hidden rounded-lg border border-border-default bg-surface-2 transition-colors hover:bg-surface-2/70">
			{/* ───── Parent row — columnar layout ───── */}
			<div className={`${PARENT_GRID} px-3 py-2.5`}>
				{/* Col 1 — Item identity */}
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span
							className="truncate text-[13px] font-semibold text-foreground"
							title={item.name}
						>
							{item.name}
						</span>
						{isFixed && (
							<span
								className="inline-flex h-4 items-center rounded-sm border border-sky-500/30 bg-sky-500/10 px-1 text-[9px] font-medium tracking-wide text-sky-700 dark:text-sky-300"
								title="Aset Tetap — depresiasi, 1-to-1 per unit"
							>
								ASET
							</span>
						)}
					</div>
					<div className="mt-0.5 truncate text-[10px] tabular text-muted-foreground/70">
						{item.sku}
					</div>
				</div>

				{/* Col 2 — Unit Master */}
				<div>
					<div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
						Unit
					</div>
					<div className="text-[12px] font-medium text-foreground">
						{item.unit}
					</div>
				</div>

				{/* Col 3 — Mapped Suppliers count */}
				<div>
					<div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
						Vendor
					</div>
					{vendorCount > 0 ? (
						<span className="inline-flex h-5 items-center rounded-md bg-surface-3 px-1.5 text-[11px] font-semibold tabular text-foreground">
							{vendorCount}{" "}
							<span className="ml-0.5 font-normal text-muted-foreground">
								{vendorCount === 1 ? "vendor" : "vendor"}
							</span>
						</span>
					) : (
						<span className="inline-flex h-5 items-center rounded-md bg-surface-3 px-1.5 text-[11px] font-medium italic text-muted-foreground/60">
							Belum ada
						</span>
					)}
				</div>

				{/* Col 4 — Avg Master Cost */}
				<div className="text-right">
					<div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
						Avg Master Cost
					</div>
					{item.purchase_price_avg > 0 ? (
						<div className="whitespace-nowrap tabular text-[13px] font-semibold text-foreground">
							{formatRupiah(item.purchase_price_avg)}
							<span className="ml-0.5 text-[10px] font-normal text-muted-foreground/70">
								/ {item.unit}
							</span>
						</div>
					) : (
						<div className="text-[11px] italic text-foreground/30">
							Belum di-set
						</div>
					)}
				</div>

				{/* Col 5 — Action: condensed + icon */}
				<div className="flex items-center justify-end">
					<button
						type="button"
						onClick={onAdd}
						title="Tambah Harga Supplier"
						aria-label="Tambah Harga Supplier"
						className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
					>
						<Plus className="size-4" />
					</button>
				</div>
			</div>

			{/* ───── Expanded supplier rows ───── */}
			{vendorCount > 0 && (
				<div className="border-t border-border-default/50 bg-surface-1/40">
					{/* Inner header — labels mengikuti satuan beli pertama agar dinamis */}
					<div
						className={`${INNER_GRID} px-3 py-2 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60`}
					>
						<span>Supplier</span>
						<span>Satuan Beli</span>
						<span className="text-right">Isi / Pack</span>
						<span className="text-right">Harga / Pack</span>
						<span className="text-right">Eff Cost / {item.unit}</span>
						<span />
					</div>

					<div className="space-y-1 px-1.5 pb-2">
						{entries.map((e) => {
							const effective = computeEffective(e, item);
							const isBulk = Number(e.pack_size) > 1;
							const satuanLabel = isBulk ? "Pack" : e.pack_unit;
							return (
								<div
									key={e.id}
									className={`${INNER_GRID} rounded-md px-1.5 py-2.5 transition-colors ${
										e.is_primary
											? "bg-amber-500/10 ring-1 ring-amber-500/20"
											: "hover:bg-surface-3/50"
									}`}
								>
									{/* Supplier */}
									<div className="flex min-w-0 items-center gap-1.5">
										{e.is_primary ? (
											<Star
												className="size-3.5 shrink-0 fill-amber-500 text-amber-500"
												aria-label="Primary supplier"
											/>
										) : (
											<button
												type="button"
												onClick={async () => {
													try {
														await setPrimarySupplierPrice(e.id);
														toast.success(
															`${e.supplier_name} di-set Primary — HPP synced`,
														);
														router.refresh();
													} catch (err) {
														const msg =
															err instanceof Error
																? err.message
																: "Gagal set Primary";
														toast.error(msg);
													}
												}}
												title="Tag sebagai Primary supplier"
												aria-label="Tag sebagai Primary supplier"
												className="press-down inline-flex size-4 items-center justify-center rounded text-muted-foreground/40 hover:bg-amber-500/10 hover:text-amber-600"
											>
												<Star className="size-3" />
											</button>
										)}
										<span
											className={`truncate text-[12px] ${e.is_primary ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
											title={e.supplier_name}
										>
											{e.supplier_name}
										</span>
									</div>

									{/* Satuan Beli */}
									<div className="text-[12px] font-medium text-foreground">
										{satuanLabel}
									</div>

									{/* Isi / Pack — qty + base unit inline supaya scan-friendly */}
									<div className="whitespace-nowrap text-right tabular text-[12px] font-medium text-foreground">
										{Number(e.pack_size).toLocaleString("id-ID")}
										<span className="ml-1 text-[10px] font-normal text-muted-foreground/70">
											{e.pack_unit}
										</span>
									</div>

									{/* Harga / Pack */}
									<div className="whitespace-nowrap text-right tabular text-[12px] font-medium text-foreground">
										{formatRupiah(e.pack_price)}
									</div>

									{/* Effective Cost / unit */}
									<div
										className={`whitespace-nowrap text-right tabular text-[12px] font-semibold ${
											e.is_primary
												? "text-amber-700 dark:text-amber-300"
												: "text-foreground"
										}`}
									>
										{formatRupiah(Math.round(effective))}
									</div>

									{/* Actions */}
									<div className="flex items-center justify-end gap-0.5">
										<button
											type="button"
											onClick={() => onEdit(e)}
											className="press-down inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
											title="Edit entry"
										>
											<Pencil className="size-3.5" />
										</button>
										<button
											type="button"
											onClick={() => onDelete(e)}
											className="press-down inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
											title="Hapus entry"
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

function SubTabBar({
	current,
	onChange,
}: {
	current: SubTab;
	onChange: (t: SubTab) => void;
}) {
	const tabs: Array<{ value: SubTab; label: string }> = [
		{ value: "items", label: "Per Item" },
		{ value: "suppliers", label: "Per Supplier" },
	];
	return (
		<div className="inline-flex rounded-lg bg-surface-2 p-1">
			{tabs.map((t) => {
				const active = current === t.value;
				return (
					<button
						key={t.value}
						type="button"
						onClick={() => onChange(t.value)}
						className={cn(
							"rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
							active
								? "bg-surface-1 text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{t.label}
					</button>
				);
			})}
		</div>
	);
}

function SuppliersPanel({
	rows,
}: {
	rows: Array<{
		id: string;
		name: string;
		entryCount: number;
		primaryCount: number;
	}>;
}) {
	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
				Tidak ada supplier yang cocok.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
				<div>
					<div className="text-sm font-semibold">Supplier Aktif</div>
					<div className="mt-0.5 text-[11px] text-muted-foreground">
						{rows.length} supplier · klik nama untuk edit detail (kontak, term
						bayar, kategori).
					</div>
				</div>
				<Link
					href="/warehouse/suppliers"
					className="press-down inline-flex h-8 items-center gap-1 rounded-md bg-surface-1 px-3 text-[12px] font-medium text-foreground hover:bg-surface-3"
				>
					<Truck className="size-3.5" />
					Manage Supplier
				</Link>
			</div>

			<div className="overflow-hidden rounded-lg bg-surface-2">
				<div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					<span>Supplier</span>
					<span className="text-right">Items</span>
					<span className="text-right">Primary</span>
					<span className="w-8" />
				</div>
				<ul>
					{rows.map((s, idx) => (
						<li
							key={s.id}
							className={cn(
								"grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-3/60",
								idx > 0 && "border-t border-foreground/[0.04]",
							)}
						>
							<div className="min-w-0">
								<div className="truncate text-sm font-medium text-foreground">
									{s.name}
								</div>
							</div>
							<span className="tabular text-sm font-medium text-foreground">
								{s.entryCount}
							</span>
							<div className="flex justify-end">
								{s.primaryCount > 0 ? (
									<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
										<Star className="size-3 fill-emerald-500 text-emerald-500" />
										{s.primaryCount}
									</span>
								) : (
									<span className="text-[11px] text-muted-foreground/60">
										—
									</span>
								)}
							</div>
							<Link
								href="/warehouse/suppliers"
								className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-1 hover:text-foreground"
								title={`Buka master Supplier untuk edit ${s.name}`}
							>
								<ArrowUpRight className="size-3.5" />
							</Link>
						</li>
					))}
				</ul>
			</div>
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
