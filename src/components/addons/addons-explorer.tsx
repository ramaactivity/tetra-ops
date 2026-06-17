"use client";

import { Sparkles } from "lucide-react";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { EditLink } from "@/components/catalog/form-kit";
import { Badge } from "@/components/ui/badge";
import { ADDON_CATEGORY_LABELS, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArchiveAddonButton } from "./archive-button";

export type AddonRow = {
	id: string;
	name: string;
	unit: string;
	price: number;
	category: string;
	requires_extra_crew: boolean;
	is_active: boolean;
	inventory_sku: string | null;
	inventory_name: string | null;
};

function categoryLabel(c: string) {
	return ADDON_CATEGORY_LABELS[c] ?? c;
}

function StatusDot({ active }: { active: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-[12px] font-medium",
				active
					? "text-emerald-600 dark:text-emerald-400"
					: "text-muted-foreground",
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					active ? "bg-emerald-500" : "bg-muted-foreground/50",
				)}
			/>
			{active ? "Aktif" : "Arsip"}
		</span>
	);
}

const columns: CatalogColumn<AddonRow>[] = [
	{
		key: "name",
		header: "Nama Add-on",
		cell: (a) => <span className="text-foreground font-medium">{a.name}</span>,
	},
	{
		key: "category",
		header: "Kategori",
		cell: (a) => (
			<span className="text-muted-foreground">{categoryLabel(a.category)}</span>
		),
	},
	{
		key: "inventory",
		header: "Inventory",
		cell: (a) =>
			a.inventory_sku ? (
				<Badge
					variant="outline"
					className="tabular max-w-[180px] truncate text-[10px]"
					title={`${a.inventory_sku} · ${a.inventory_name ?? ""}`}
				>
					{a.inventory_sku}
				</Badge>
			) : (
				<span className="text-muted-foreground text-xs">—</span>
			),
	},
	{
		key: "unit",
		header: "Unit",
		cell: (a) => <span className="text-muted-foreground">{a.unit}</span>,
	},
	{
		key: "price",
		header: "Harga",
		align: "right",
		cell: (a) => (
			<span className="tabular text-foreground font-semibold">
				{formatRupiah(a.price)}
			</span>
		),
	},
	{
		key: "crew",
		header: "Extra Crew",
		align: "right",
		cardLabel: "Extra Crew",
		cell: (a) =>
			a.requires_extra_crew ? (
				<Badge variant="warning">Ya</Badge>
			) : (
				<span className="text-muted-foreground text-sm">—</span>
			),
	},
	{
		key: "status",
		header: "Status",
		cell: (a) => <StatusDot active={a.is_active} />,
	},
];

export function AddonsExplorer({ addons }: { addons: AddonRow[] }) {
	return (
		<CatalogExplorer
			rows={addons}
			columns={columns}
			getId={(a) => a.id}
			searchText={(a) =>
				`${a.name} ${categoryLabel(a.category)} ${a.unit} ${a.inventory_sku ?? ""}`
			}
			searchPlaceholder="Cari add-on…"
			getCategory={(a) => a.category}
			categoryLabel={categoryLabel}
			renderActions={(a) => (
				<>
					<EditLink href={`/operations/addons/${a.id}/edit`} label={a.name} />
					<ArchiveAddonButton id={a.id} name={a.name} />
				</>
			)}
			emptyIcon={Sparkles}
			emptyTitle="Belum ada add-on"
			emptyDescription="Tambah add-on yang bisa dipilih saat booking."
		/>
	);
}
