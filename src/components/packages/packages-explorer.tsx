"use client";

import { Package } from "lucide-react";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { EditLink } from "@/components/catalog/form-kit";
import {
	FRAME_SIZE_LABELS,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArchivePackageButton } from "./archive-button";

export type PackageRow = {
	id: string;
	name: string;
	category: string;
	frame_size: string;
	duration_hours: number;
	base_price: number;
	is_active: boolean;
};

const FRAME_TONE: Record<string, string> = {
	"2R": "bg-teal-500/10 text-teal-700 dark:text-teal-400",
	"4R": "bg-[#0070f3]/10 text-[#0070f3] dark:text-[#3b96ff]",
	polaroid: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
	none: "bg-secondary text-muted-foreground",
};

function categoryLabel(category: string) {
	return SERVICE_TYPE_LABELS[category] ?? category;
}

function frameLabel(frame: string) {
	const label = FRAME_SIZE_LABELS[frame] ?? frame;
	return label === "—" ? "No frame" : label;
}

function FrameBadge({ frame }: { frame: string }) {
	return (
		<span
			className={cn(
				"inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-semibold",
				FRAME_TONE[frame] ?? FRAME_TONE.none,
			)}
		>
			{frameLabel(frame)}
		</span>
	);
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

const columns: CatalogColumn<PackageRow>[] = [
	{
		key: "name",
		header: "Nama Paket",
		cell: (p) => <span className="text-foreground font-medium">{p.name}</span>,
	},
	{
		key: "category",
		header: "Kategori",
		cell: (p) => (
			<span className="text-muted-foreground">{categoryLabel(p.category)}</span>
		),
	},
	{
		key: "frame",
		header: "Frame",
		cell: (p) => <FrameBadge frame={p.frame_size} />,
	},
	{
		key: "duration",
		header: "Durasi",
		align: "right",
		cell: (p) => (
			<span className="tabular text-muted-foreground">
				{p.duration_hours} jam
			</span>
		),
	},
	{
		key: "price",
		header: "Base Price",
		align: "right",
		cell: (p) => (
			<span className="tabular text-foreground font-semibold">
				{formatRupiah(p.base_price)}
			</span>
		),
	},
	{
		key: "status",
		header: "Status",
		cell: (p) => <StatusDot active={p.is_active} />,
	},
];

export function PackagesExplorer({ packages }: { packages: PackageRow[] }) {
	return (
		<CatalogExplorer
			rows={packages}
			columns={columns}
			getId={(p) => p.id}
			searchText={(p) =>
				`${p.name} ${categoryLabel(p.category)} ${frameLabel(p.frame_size)}`
			}
			searchPlaceholder="Cari paket, frame…"
			getCategory={(p) => p.category}
			categoryLabel={categoryLabel}
			renderActions={(p) => (
				<>
					<EditLink href={`/operations/packages/${p.id}/edit`} label={p.name} />
					<ArchivePackageButton id={p.id} name={p.name} />
				</>
			)}
			emptyIcon={Package}
			emptyTitle="Belum ada paket"
			emptyDescription="Tambah paket pertama ke pricelist Tetra."
		/>
	);
}
