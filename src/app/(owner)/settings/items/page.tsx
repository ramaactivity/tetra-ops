import { Package } from "lucide-react";
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

export default async function ItemsListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("inventory_items")
		.select(
			"id, sku, name, category, unit, min_stock_alert, purchase_price_avg, condition, current_location, is_active",
		)
		.order("category", { ascending: true })
		.order("name", { ascending: true });

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

	if (items.length === 0) {
		return (
			<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
				<Package className="text-muted-foreground h-8 w-8" />
				<div className="space-y-1">
					<h3 className="font-medium">Belum ada inventory item</h3>
					<p className="text-muted-foreground text-sm">
						Tambah consumable / equipment lewat CSV import atau form manual
						(Phase 1 Week 2 lanjutan).
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">
						Inventory Items
					</h2>
					<p className="text-muted-foreground text-sm">
						{items.length} item · consumables + equipment
					</p>
				</div>
			</div>

			<div className="border-border bg-card overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Unit</TableHead>
							<TableHead className="text-right">Min Stock</TableHead>
							<TableHead className="text-right">Avg Cost</TableHead>
							<TableHead>Condition</TableHead>
							<TableHead>Location</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="tabular text-muted-foreground text-xs">
									{item.sku}
								</TableCell>
								<TableCell className="font-medium">{item.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{ITEM_CATEGORY_LABELS[item.category] ?? item.category}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{item.unit}
								</TableCell>
								<TableCell className="tabular text-right">
									{item.min_stock_alert}
								</TableCell>
								<TableCell className="tabular text-right">
									{item.purchase_price_avg
										? formatRupiah(item.purchase_price_avg)
										: "—"}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{item.condition
										? (EQUIPMENT_CONDITION_LABELS[item.condition] ??
											item.condition)
										: "—"}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{item.current_location
										? (EQUIPMENT_LOCATION_LABELS[item.current_location] ??
											item.current_location)
										: "—"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
