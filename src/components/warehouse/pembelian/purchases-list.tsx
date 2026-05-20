"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { formatDateID, formatRupiah } from "@/lib/format";

export type PurchaseRow = {
	id: string;
	ref_id: string;
	created_at: string;
	supplier_name: string | null;
	item_name: string;
	item_sku: string;
	unit: string;
	quantity: number;
	unit_cost: number;
	subtotal: number;
	notes: string | null;
};

export function PurchasesList({ rows }: { rows: PurchaseRow[] }) {
	const [query, setQuery] = useState("");

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter(
			(r) =>
				r.ref_id.toLowerCase().includes(q) ||
				r.item_name.toLowerCase().includes(q) ||
				r.item_sku.toLowerCase().includes(q) ||
				(r.supplier_name ?? "").toLowerCase().includes(q) ||
				(r.notes ?? "").toLowerCase().includes(q),
		);
	}, [rows, query]);

	const columns: ResponsiveTableColumn<PurchaseRow>[] = [
		{
			key: "tanggal",
			header: "Tanggal",
			render: (r) => (
				<div className="space-y-0.5">
					<div className="tabular text-fluid-caption font-medium text-foreground">
						{formatDateID(r.created_at)}
					</div>
					<div className="tabular text-[10px] text-muted-foreground">
						{r.ref_id}
					</div>
				</div>
			),
		},
		{
			key: "supplier",
			header: "Supplier",
			render: (r) =>
				r.supplier_name ? (
					<Badge
						variant="outline"
						className="h-5 border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] text-sky-700 dark:text-sky-300"
					>
						{r.supplier_name}
					</Badge>
				) : (
					<span className="text-muted-foreground/40">—</span>
				),
		},
		{
			key: "item",
			header: "Item",
			render: (r) => (
				<div className="space-y-0.5">
					<div className="font-medium text-foreground">{r.item_name}</div>
					<div className="tabular text-[10px] text-muted-foreground">
						{r.item_sku}
					</div>
				</div>
			),
		},
		{
			key: "qty",
			header: "Qty",
			align: "right",
			render: (r) => (
				<span className="tabular text-fluid-caption font-medium text-emerald-600 dark:text-emerald-400">
					+
					{r.quantity.toLocaleString("id-ID", { maximumFractionDigits: 4 })}{" "}
					{r.unit}
				</span>
			),
		},
		{
			key: "cost",
			header: "Harga /unit",
			align: "right",
			hideOnMobile: true,
			render: (r) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{r.unit_cost > 0 ? `${formatRupiah(r.unit_cost)} / ${r.unit}` : "—"}
				</span>
			),
		},
		{
			key: "subtotal",
			header: "Subtotal",
			align: "right",
			render: (r) => (
				<span className="tabular text-fluid-caption font-semibold text-foreground">
					{formatRupiah(r.subtotal)}
				</span>
			),
		},
		{
			key: "notes",
			header: "Catatan",
			hideOnMobile: true,
			render: (r) => (
				<span className="line-clamp-2 max-w-xs text-fluid-caption text-muted-foreground">
					{r.notes ?? "—"}
				</span>
			),
		},
	];

	return (
		<div className="space-y-3">
			<div className="relative max-w-md">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Cari ref, item, supplier..."
					className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-caption placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
			</div>
			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada pembelian yang cocok.
				</div>
			) : (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
					<ResponsiveTable<PurchaseRow>
						keyExtractor={(r) => r.id}
						rows={filtered}
						columns={columns}
					/>
				</div>
			)}
		</div>
	);
}
