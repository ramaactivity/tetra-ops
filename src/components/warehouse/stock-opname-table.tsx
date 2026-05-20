"use client";

import { ClipboardList, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { StockTakeLineRow } from "@/components/warehouse/stock-take-line-row";

export interface StockOpnameRow {
	stock_take_id: string;
	item_id: string;
	system_qty: number;
	counted_qty: number | null;
	variance: number | null;
	notes: string | null;
	item: {
		id: string;
		sku: string;
		name: string;
		category: string;
		unit: string;
		unit_conversion: Record<string, number> | null;
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
				<div className="relative flex-1 sm:max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari item / SKU..."
						className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-caption placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				</div>
				<div className="flex items-center gap-2">
					<div className="inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-2 p-1 text-[11px]">
						{FILTER_TABS.map((t) => {
							const c = counts[t.key];
							const active = t.key === filter;
							return (
								<button
									key={t.key}
									type="button"
									onClick={() => setFilter(t.key)}
									className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
										active
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
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
					<div className="w-32">
						<Combobox
							id="sort"
							value={sort}
							onValueChange={(v) => setSort((v as SortKey) ?? "category")}
							options={[
								{ value: "category", label: "Kategori" },
								{ value: "variance", label: "Selisih ↓" },
								{ value: "sku", label: "SKU" },
							]}
							allowFreeText={false}
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
					<thead className="border-b border-border-default bg-surface-3/40">
						<tr className="text-left">
							<th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Item
							</th>
							<th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Sistem
							</th>
							<th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Hitung Fisik
							</th>
							<th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Selisih
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
