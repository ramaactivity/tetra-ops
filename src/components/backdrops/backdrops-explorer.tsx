"use client";

import { Image as ImageIcon } from "lucide-react";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { EditLink } from "@/components/catalog/form-kit";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ToggleBackdropActiveButton } from "./toggle-active-button";

export type BackdropRow = {
	id: string;
	code: string;
	name: string;
	type: "basic_included" | "rental_owned" | "vendor_decor";
	rental_price: number;
	is_active: boolean;
	display_order: number;
	description: string | null;
};

const TYPE_LABEL: Record<string, string> = {
	basic_included: "Basic Included",
	rental_owned: "Rental Owned",
	vendor_decor: "Vendor Decor",
};

type TypeVariant = "default" | "info" | "warning";
const TYPE_VARIANT: Record<string, TypeVariant> = {
	basic_included: "default",
	rental_owned: "info",
	vendor_decor: "warning",
};

function typeLabel(t: string) {
	return TYPE_LABEL[t] ?? t;
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
			{active ? "Aktif" : "Nonaktif"}
		</span>
	);
}

const columns: CatalogColumn<BackdropRow>[] = [
	{
		key: "name",
		header: "Nama",
		cell: (b) => (
			<div className="min-w-0">
				<div className="text-foreground font-medium">{b.name}</div>
				{b.description && (
					<div className="text-muted-foreground mt-0.5 text-xs">
						{b.description}
					</div>
				)}
			</div>
		),
	},
	{
		key: "code",
		header: "Code",
		cardLabel: "Code",
		cell: (b) => (
			<span className="tabular text-muted-foreground text-xs">{b.code}</span>
		),
	},
	{
		key: "type",
		header: "Tipe",
		cell: (b) => (
			<Badge variant={TYPE_VARIANT[b.type] ?? "default"}>
				{typeLabel(b.type)}
			</Badge>
		),
	},
	{
		key: "price",
		header: "Harga Sewa",
		align: "right",
		cell: (b) =>
			b.rental_price > 0 ? (
				<span className="tabular text-foreground font-semibold">
					{formatRupiah(b.rental_price)}
				</span>
			) : (
				<span className="text-muted-foreground">—</span>
			),
	},
	{
		key: "status",
		header: "Status",
		cell: (b) => <StatusDot active={b.is_active} />,
	},
];

export function BackdropsExplorer({ backdrops }: { backdrops: BackdropRow[] }) {
	return (
		<CatalogExplorer
			rows={backdrops}
			columns={columns}
			getId={(b) => b.id}
			titleKey="name"
			cardSubtitle={(b) => b.code}
			searchText={(b) =>
				`${b.name} ${b.code} ${typeLabel(b.type)} ${b.description ?? ""}`
			}
			searchPlaceholder="Cari backdrop, code…"
			getCategory={(b) => b.type}
			categoryLabel={typeLabel}
			renderActions={(b) => (
				<>
					<EditLink
						href={`/operations/backdrops/${b.id}/edit`}
						label={b.name}
					/>
					<ToggleBackdropActiveButton
						id={b.id}
						isActive={b.is_active}
						name={b.name}
					/>
				</>
			)}
			emptyIcon={ImageIcon}
			emptyTitle="Belum ada backdrop"
			emptyDescription="Bikin backdrop pertama (basic / rental / vendor) supaya muncul di booking form."
		/>
	);
}
