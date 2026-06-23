"use client";

import { Pencil, Star, Trash2, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { toast } from "@/components/ui/toaster";
import { archiveSupplier } from "@/lib/actions/suppliers";
import { EditSupplierDialog } from "./edit-supplier-dialog";

export type SupplierRow = {
	id: string;
	name: string;
	category: string | null;
	contact: string | null;
	default_payment_term: string;
	default_top_days: number;
	notes: string | null;
	is_active: boolean;
	deleted_at: string | null;
	created_at: string;
	item_count: number;
	primary_count: number;
};

const PAYMENT_TERM_LABELS: Record<string, string> = {
	cash: "Cash",
	top_7: "TOP 7 hari",
	top_14: "TOP 14 hari",
	top_30: "TOP 30 hari",
	top_60: "TOP 60 hari",
	top_custom: "TOP custom",
};

export function SuppliersTable({ rows }: { rows: SupplierRow[] }) {
	const [query, setQuery] = useState("");
	const [showInactive, setShowInactive] = useState(false);
	const [editing, setEditing] = useState<SupplierRow | null>(null);
	const [archiving, setArchiving] = useState<SupplierRow | null>(null);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			if (!showInactive && !r.is_active) return false;
			if (!q) return true;
			return (
				r.name.toLowerCase().includes(q) ||
				(r.category ?? "").toLowerCase().includes(q) ||
				(r.contact ?? "").toLowerCase().includes(q)
			);
		});
	}, [rows, query, showInactive]);

	if (rows.length === 0) {
		return (
			<EmptyState
				icon={Truck}
				title="Belum ada supplier"
				description="Klik Tambah Supplier untuk catat vendor pertama."
			/>
		);
	}

	const columns: ResponsiveTableColumn<SupplierRow>[] = [
		{
			key: "name",
			header: "Supplier",
			render: (r) => (
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="flex items-center gap-2">
						<span className="truncate text-[14px] font-semibold leading-snug text-foreground">
							{r.name}
						</span>
						{!r.is_active && (
							<Badge
								variant="secondary"
								className="h-5 shrink-0 px-1.5 text-[10px]"
							>
								Inactive
							</Badge>
						)}
					</div>
					{r.category && (
						<span className="truncate text-[12px] text-muted-foreground">
							{r.category}
						</span>
					)}
				</div>
			),
		},
		{
			key: "contact",
			header: "Kontak",
			width: "200px",
			render: (r) => (
				<span className="tabular text-[13px] text-muted-foreground">
					{r.contact ?? "—"}
				</span>
			),
		},
		{
			key: "payment",
			header: "Default Pembayaran",
			width: "220px",
			render: (r) => (
				<div className="flex items-center gap-1.5">
					<span className="text-[13px] text-foreground">
						{PAYMENT_TERM_LABELS[r.default_payment_term] ??
							r.default_payment_term}
					</span>
					{r.default_payment_term === "top_custom" &&
						r.default_top_days > 0 && (
							<span className="text-[11px] text-muted-foreground">
								({r.default_top_days} hari)
							</span>
						)}
				</div>
			),
		},
		{
			key: "items",
			header: "Items",
			align: "center",
			width: "130px",
			render: (r) => (
				<div className="flex items-center justify-center gap-1.5">
					<span className="tabular text-[13px] font-medium text-foreground">
						{r.item_count}
					</span>
					{r.primary_count > 0 && (
						<Badge
							variant="outline"
							className="h-5 gap-0.5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
						>
							<Star className="size-2.5 fill-current" aria-hidden />
							{r.primary_count}
						</Badge>
					)}
				</div>
			),
		},
		{
			key: "actions",
			header: "Aksi",
			align: "right",
			width: "110px",
			render: (r) => (
				<div className="flex items-center justify-end gap-1">
					<button
						type="button"
						onClick={() => setEditing(r)}
						title="Edit supplier"
						aria-label={`Edit ${r.name}`}
						className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<Pencil className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => setArchiving(r)}
						title="Arsipkan"
						aria-label={`Arsipkan ${r.name}`}
						className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
					>
						<Trash2 className="size-4" />
					</button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<FilterSearchInput
					className="flex-1 sm:max-w-xs"
					value={query}
					onValueChange={setQuery}
					placeholder="Cari nama / kategori / kontak..."
				/>
				<label className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border-default bg-card px-3.5 text-[13px] text-foreground transition-colors hover:bg-secondary/40">
					<input
						type="checkbox"
						checked={showInactive}
						onChange={(e) => setShowInactive(e.target.checked)}
						className="size-3.5 accent-[#059669]"
					/>
					Tampilkan non-aktif
				</label>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada supplier yang cocok.
				</div>
			) : (
				<div className="overflow-hidden rounded-lg border border-border-default bg-card">
					<ResponsiveTable<SupplierRow>
						keyExtractor={(r) => r.id}
						rows={filtered}
						columns={columns}
						rowClassName="transition-colors hover:bg-secondary/40"
					/>
				</div>
			)}

			{editing && (
				<EditSupplierDialog
					supplier={editing}
					open={!!editing}
					onOpenChange={(o) => !o && setEditing(null)}
				/>
			)}

			<ConfirmDialog
				open={!!archiving}
				onOpenChange={(o) => !o && setArchiving(null)}
				title="Arsipkan supplier?"
				description={
					archiving
						? `Supplier "${archiving.name}" akan disembunyikan dari list & lookup. Harga di Market List tetap tersimpan untuk audit, tapi tidak bisa di-set Primary lagi.`
						: ""
				}
				confirmLabel="Arsipkan"
				variant="destructive"
				onConfirm={async () => {
					if (!archiving) return;
					try {
						await archiveSupplier(archiving.id);
						toast.success(`Supplier "${archiving.name}" diarsipkan`);
						setArchiving(null);
					} catch (e) {
						const msg = e instanceof Error ? e.message : "Gagal arsip";
						toast.error(msg);
					}
				}}
			/>
		</div>
	);
}
