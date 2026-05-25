"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { ArchiveItemButton } from "@/components/items/archive-button";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import {
	EQUIPMENT_CONDITION_LABELS,
	EQUIPMENT_LOCATION_LABELS,
	formatRupiah,
	ITEM_CATEGORY_LABELS,
} from "@/lib/format";

/**
 * <ItemsListTable /> — client wrapper for settings/items list.
 * Pattern: server page passes serializable rows; columns built here.
 */

export type ItemRow = {
	id: string;
	sku: string;
	name: string;
	category: string;
	unit: string;
	min_stock_alert: number;
	purchase_price_avg: number;
	condition: string | null;
	current_location: string | null;
	is_active: boolean;
};

export function ItemsListTable({ items }: { items: ItemRow[] }) {
	const columns: ResponsiveTableColumn<ItemRow>[] = [
		{
			key: "sku",
			header: "SKU",
			render: (item) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{item.sku}
				</span>
			),
		},
		{
			key: "name",
			header: "Name",
			render: (item) => <span className="font-medium">{item.name}</span>,
		},
		{
			key: "category",
			header: "Kategori",
			render: (item) => (
				<span className="text-fluid-caption text-muted-foreground">
					{ITEM_CATEGORY_LABELS[item.category] ?? item.category}
				</span>
			),
		},
		{
			key: "unit",
			header: "Unit",
			hideOnMobile: true,
			render: (item) => (
				<span className="text-fluid-caption text-muted-foreground">
					{item.unit}
				</span>
			),
		},
		{
			key: "min_stock_alert",
			header: "Min Stock",
			align: "right",
			hideOnMobile: true,
			render: (item) => {
				const isEquipment = item.category === "fixed_asset";
				return (
					<span className="tabular text-fluid-caption">
						{isEquipment ? "—" : item.min_stock_alert || "—"}
					</span>
				);
			},
		},
		{
			key: "avg_cost",
			header: "Avg Cost",
			align: "right",
			hideOnMobile: true,
			render: (item) => (
				<span className="tabular text-fluid-caption">
					{item.purchase_price_avg
						? formatRupiah(item.purchase_price_avg)
						: "—"}
				</span>
			),
		},
		{
			key: "condition_location",
			header: "Kondisi / Lokasi",
			render: (item) => {
				const isEquipment = item.category === "fixed_asset";
				if (!isEquipment) {
					return (
						<span className="text-fluid-caption text-muted-foreground">—</span>
					);
				}
				return (
					<div className="space-y-0.5 text-fluid-caption text-muted-foreground">
						{item.condition && (
							<div>
								{EQUIPMENT_CONDITION_LABELS[item.condition] ??
									item.condition}
							</div>
						)}
						{item.current_location && (
							<div className="text-muted-foreground/70">
								@{" "}
								{EQUIPMENT_LOCATION_LABELS[item.current_location] ??
									item.current_location}
							</div>
						)}
					</div>
				);
			},
		},
		{
			key: "status",
			header: "Status",
			render: (item) =>
				item.is_active ? (
					<Badge variant="default">Aktif</Badge>
				) : (
					<Badge variant="secondary">Nonaktif</Badge>
				),
		},
		{
			key: "actions",
			header: "Actions",
			align: "right",
			render: (item) => (
				<div className="flex items-center justify-end gap-1">
					<Link
						href={`/settings/items/${item.id}/edit`}
						title="Edit"
						className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
					>
						<Pencil className="size-4" />
					</Link>
					<ArchiveItemButton id={item.id} name={item.name} />
				</div>
			),
		},
	];

	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
			<ResponsiveTable<ItemRow>
				keyExtractor={(item) => item.id}
				rows={items}
				columns={columns}
			/>
		</div>
	);
}
