"use client";

import { ArrowDownUp, ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { NativeSelect } from "@/components/ui/native-select";
import { StockTakeLineRow } from "@/components/warehouse/stock-take-line-row";
import type { Bundle } from "@/lib/inventory/unit-conversion";

export interface StockOpnameRow {
	stock_take_id: string;
	item_id: string;
	system_qty: number;
	counted_qty: number | null;
	counted_breakdown: Bundle[] | null;
	variance: number | null;
	notes: string | null;
	item: {
		id: string;
		sku: string;
		name: string;
		category: string;
		unit: string;
		unit_conversion: unknown;
		purchase_price_avg: number;
		min_stock_alert: number;
	};
}

type FilterKey = "all" | "pending" | "variance" | "ok";
type SortKey = "category" | "variance" | "sku";

const FILTER_TABS: ReadonlyArray<{ key: FilterKey; label: string }> = [
	{ key: "all", label: "Semua" },
	{ key: "pending", label: "Belum" },
	{ key: "variance", label: "Selisih" },
	{ key: "ok", label: "Sesuai" },
];

const CATEGORY_LABEL: Record<string, string> = {
	consumable: "Consumables",
	equipment: "Equipment",
	other: "Lainnya",
};

export function StockOpnameTable({
	rows,
	editable,
}: {
	rows: StockOpnameRow[];
	editable: boolean;
}) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<FilterKey>("all");
	const [sort, setSort] = useState<SortKey>("category");

	const counts = useMemo(() => {
		const pending = rows.filter((r) => r.counted_qty === null).length;
		const variance = rows.filter(
			(r) => r.counted_qty !== null && (r.variance ?? 0) !== 0,
		).length;
		const ok = rows.filter(
			(r) => r.counted_qty !== null && (r.variance ?? 0) === 0,
		).length;
		return { all: rows.length, pending, variance, ok };
	}, [rows]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		let out = rows;
		if (q) {
			out = out.filter(
				(r) =>
					r.item.name.toLowerCase().includes(q) ||
					r.item.sku.toLowerCase().includes(q),
			);
		}
		if (filter === "pending") {
			out = out.filter((r) => r.counted_qty === null);
		} else if (filter === "variance") {
			out = out.filter(
				(r) => r.counted_qty !== null && (r.variance ?? 0) !== 0,
			);
		} else if (filter === "ok") {
			out = out.filter(
				(r) => r.counted_qty !== null && (r.variance ?? 0) === 0,
			);
		}
		out = [...out].sort((a, b) => {
			if (sort === "variance") {
				const av = Math.abs(a.variance ?? 0);
				const bv = Math.abs(b.variance ?? 0);
				if (av !== bv) return bv - av;
				return a.item.sku.localeCompare(b.item.sku);
			}
			if (sort === "sku") {
				return a.item.sku.localeCompare(b.item.sku);
			}
			// category default
			if (a.item.category !== b.item.category) {
				return a.item.category.localeCompare(b.item.category);
			}
			return a.item.sku.localeCompare(b.item.sku);
		});
		return out;
	}, [rows, query, filter, sort]);

	const grouped = useMemo(() => {
		if (sort !== "category") return null;
		const map = new Map<string, StockOpnameRow[]>();
		for (const r of filtered) {
			const cat = r.item.category;
			if (!map.has(cat)) map.set(cat, []);
			map.get(cat)!.push(r);
		}
		return Array.from(map.entries());
	}, [filtered, sort]);

	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-8 text-center">
				<ClipboardList className="mx-auto mb-2 size-8 text-muted-foreground/60" />
				<p className="text-fluid-body text-muted-foreground">
					Belum ada item aktif di stock opname ini.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{/* Toolbar */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<FilterSearchInput
					className="flex-1 sm:max-w-xs"
					value={query}
					onValueChange={setQuery}
					placeholder="Cari item / SKU..."
				/>
				<div className="flex items-center gap-2">
					<div className="inline-flex h-8 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-0.5 text-[12px] shadow-[var(--shadow-level-1)]">
						{FILTER_TABS.map((t) => {
							const c = counts[t.key];
							const active = t.key === filter;
							return (
								<button
									key={t.key}
									type="button"
									onClick={() => setFilter(t.key)}
									className={`inline-flex h-7 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors ${
										active
											? "bg-[#059669] text-white"
											: "text-muted-foreground hover:bg-secondary hover:text-foreground"
									}`}
									aria-pressed={active}
								>
									{t.label}
									<span
										className={`tabular ${active ? "opacity-80" : "text-muted-foreground/70"}`}
									>
										{c}
									</span>
								</button>
							);
						})}
					</div>
					<div className="relative w-36">
						<ArrowDownUp
							className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
							aria-hidden
						/>
						<NativeSelect
							value={sort}
							onValueChange={(v) => setSort((v as SortKey) ?? "category")}
							options={[
								{ value: "category", label: "Kategori" },
								{ value: "variance", label: "Selisih ↓" },
								{ value: "sku", label: "SKU" },
							]}
							aria-label="Urutkan"
							triggerClassName="w-full pl-7"
						/>
					</div>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada item yang cocok dengan filter ini.
				</div>
			) : grouped ? (
				<div className="space-y-4">
					{grouped.map(([cat, items]) => (
						<CategorySection
							key={cat}
							category={cat}
							items={items}
							editable={editable}
						/>
					))}
				</div>
			) : (
				<LineTable rows={filtered} editable={editable} />
			)}
		</div>
	);
}

function CategorySection({
	category,
	items,
	editable,
}: {
	category: string;
	items: StockOpnameRow[];
	editable: boolean;
}) {
	const label = CATEGORY_LABEL[category] ?? category;
	const audited = items.filter((r) => r.counted_qty !== null).length;
	return (
		<section className="space-y-2">
			<div className="flex items-baseline justify-between px-1">
				<h3 className="text-fluid-caption font-semibold uppercase tracking-wider text-muted-foreground">
					{label}
				</h3>
				<span className="tabular text-[11px] text-muted-foreground/70">
					{audited}/{items.length} dihitung
				</span>
			</div>
			<LineTable rows={items} editable={editable} />
		</section>
	);
}

function LineTable({
	rows,
	editable,
}: {
	rows: StockOpnameRow[];
	editable: boolean;
}) {
	return (
		<>
			{/* Desktop table */}
			<div className="hidden overflow-hidden rounded-lg border border-border-default bg-surface-2 md:block">
				<table className="w-full text-sm">
					<thead className="sticky top-0 z-10 border-b border-border-default bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
						<tr className="text-left">
							<th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Item
							</th>
							<th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Stok Sistem
							</th>
							<th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Stok Fisik
							</th>
							<th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Selisih
							</th>
							<th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Nilai
							</th>
							<th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Catatan
							</th>
							{editable && (
								<th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Aksi
								</th>
							)}
						</tr>
					</thead>
					<tbody className="divide-y divide-border-default/50">
						{rows.map((r) => (
							<StockTakeLineRow
								key={r.item_id}
								line={r}
								editable={editable}
								layout="row"
							/>
						))}
					</tbody>
				</table>
			</div>

			{/* Mobile card list */}
			<div className="space-y-2 md:hidden">
				{rows.map((r) => (
					<StockTakeLineRow
						key={r.item_id}
						line={r}
						editable={editable}
						layout="card"
					/>
				))}
			</div>
		</>
	);
}
