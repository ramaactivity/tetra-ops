import { FileSpreadsheet, Package, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { ArchiveItemButton } from "@/components/items/archive-button";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	EQUIPMENT_CONDITION_LABELS,
	EQUIPMENT_LOCATION_LABELS,
	formatRupiah,
	ITEM_CATEGORY_LABELS,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type ItemRow = {
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

export default async function ItemsListPage({
	searchParams,
}: {
	searchParams: Promise<{ category?: string }>;
}) {
	const params = await searchParams;
	const category = params.category?.trim() || "";

	const supabase = await createClient();
	let query = supabase
		.from("inventory_items")
		.select(
			"id, sku, name, category, unit, min_stock_alert, purchase_price_avg, condition, current_location, is_active",
		)
		.is("deleted_at", null)
		.order("category", { ascending: true })
		.order("name", { ascending: true });

	if (category === "consumable" || category === "equipment") {
		query = query.eq("category", category);
	}

	const { data, error } = await query;

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat items: {error.message}
				</p>
			</div>
		);
	}

	const items = (data ?? []) as ItemRow[];
	const consumablesCount = items.filter(
		(i) => i.category === "consumable",
	).length;
	const equipmentCount = items.filter((i) => i.category === "equipment").length;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">
						Inventory Items
					</h2>
					<p className="text-muted-foreground text-sm">
						{items.length} item · {consumablesCount} consumable ·{" "}
						{equipmentCount} equipment
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Link
						href="/settings/items/import"
						className="border-border-default bg-surface-2 hover:bg-muted text-foreground inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
					>
						<FileSpreadsheet className="h-4 w-4" />
						Bulk import
					</Link>
					<Link
						href="/settings/items/new"
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
					>
						<Plus className="h-4 w-4" />
						New item
					</Link>
				</div>
			</div>

			<div className="flex items-center gap-1">
				<FilterChip href="/settings/items" active={!category} label="Semua" />
				<FilterChip
					href="/settings/items?category=consumable"
					active={category === "consumable"}
					label="Consumable"
				/>
				<FilterChip
					href="/settings/items?category=equipment"
					active={category === "equipment"}
					label="Equipment"
				/>
			</div>

			{items.length === 0 ? (
				<div className="border-border-default bg-surface-2 flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<Package className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">
							{category ? `Belum ada ${category}` : "Belum ada inventory item"}
						</h3>
						<p className="text-muted-foreground text-sm">
							Klik <span className="font-medium">New item</span> untuk tambah
							item baru.
						</p>
					</div>
				</div>
			) : (
				<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>SKU</TableHead>
								<TableHead>Name</TableHead>
								<TableHead>Kategori</TableHead>
								<TableHead>Unit</TableHead>
								<TableHead className="text-right">Min Stock</TableHead>
								<TableHead className="text-right">Avg Cost</TableHead>
								<TableHead>Kondisi / Lokasi</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[80px] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => {
								const isEquipment = item.category === "equipment";
								return (
									<TableRow key={item.id}>
										<TableCell className="text-muted-foreground tabular text-xs">
											{item.sku}
										</TableCell>
										<TableCell className="font-medium">{item.name}</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{ITEM_CATEGORY_LABELS[item.category] ?? item.category}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{item.unit}
										</TableCell>
										<TableCell className="tabular text-right text-sm">
											{isEquipment ? "—" : item.min_stock_alert || "—"}
										</TableCell>
										<TableCell className="tabular text-right text-sm">
											{item.purchase_price_avg
												? formatRupiah(item.purchase_price_avg)
												: "—"}
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{isEquipment ? (
												<div className="space-y-0.5">
													{item.condition && (
														<div>
															{EQUIPMENT_CONDITION_LABELS[item.condition] ??
																item.condition}
														</div>
													)}
													{item.current_location && (
														<div className="text-muted-foreground/70">
															@{" "}
															{EQUIPMENT_LOCATION_LABELS[
																item.current_location
															] ?? item.current_location}
														</div>
													)}
												</div>
											) : (
												<span>—</span>
											)}
										</TableCell>
										<TableCell>
											{item.is_active ? (
												<Badge variant="default">Aktif</Badge>
											) : (
												<Badge variant="secondary">Nonaktif</Badge>
											)}
										</TableCell>
										<TableCell>
											<div className="flex items-center justify-end gap-1">
												<Link
													href={`/settings/items/${item.id}/edit`}
													title="Edit"
													className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
												>
													<Pencil className="h-4 w-4" />
												</Link>
												<ArchiveItemButton id={item.id} name={item.name} />
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

function FilterChip({
	href,
	active,
	label,
}: {
	href: string;
	active: boolean;
	label: string;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
				active
					? "border-primary bg-primary/10 text-primary"
					: "border-border-default bg-surface-2 text-muted-foreground hover:bg-muted",
			)}
		>
			{label}
		</Link>
	);
}
