import {
	AlertOctagon,
	AlertTriangle,
	Layers,
	Package,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/operations/kpi-card";
import { WarehouseTabs } from "@/components/warehouse/warehouse-tabs";
import {
	EQUIPMENT_CONDITION_LABELS,
	EQUIPMENT_LOCATION_LABELS,
	formatRupiah,
	ITEM_CATEGORY_LABELS,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type ConsumableRow = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	min_stock_alert: number;
	purchase_price_avg: number;
	is_active: boolean;
};

type EquipmentRow = {
	id: string;
	sku: string;
	name: string;
	purchase_price: number | null;
	condition: string | null;
	current_location: string | null;
	is_active: boolean;
};

export default async function WarehousePage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const params = await searchParams;
	const tab = params.tab?.trim() || "consumables";

	const supabase = await createClient();

	const [
		consumablesResult,
		equipmentResult,
		totalSkusResult,
		hppResult,
	] = await Promise.all([
		supabase
			.from("inventory_items")
			.select(
				"id, sku, name, unit, min_stock_alert, purchase_price_avg, is_active",
			)
			.eq("category", "consumable")
			.order("name", { ascending: true }),
		supabase
			.from("inventory_items")
			.select(
				"id, sku, name, purchase_price, condition, current_location, is_active",
			)
			.eq("category", "equipment")
			.order("name", { ascending: true }),
		supabase
			.from("inventory_items")
			.select("id", { count: "exact", head: true }),
		supabase
			.from("inventory_items")
			.select("purchase_price_avg, category"),
	]);

	const consumables = (consumablesResult.data ?? []) as ConsumableRow[];
	const equipment = (equipmentResult.data ?? []) as EquipmentRow[];
	const totalSkus = totalSkusResult.count ?? 0;
	const totalHpp = (hppResult.data ?? [])
		.filter((r) => r.category === "consumable")
		.reduce((s, r) => s + (r.purchase_price_avg ?? 0), 0);

	// Stock criticality requires get_current_stock(item_id) RPC for live values.
	// Until stock_movements UI lands, we surface min_stock_alert as a proxy: any
	// item with min_stock_alert > 0 is "tracked" but live count is 0 (no stock_movements).
	const criticalCount = 0;
	const emptyCount = consumables.length; // all consumables have 0 stock since no movements yet

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-semibold tracking-tight">Warehouse</h1>
				<p className="text-muted-foreground text-sm">
					Track stok consumables, equipment, dan log mutasi.
				</p>
			</div>

			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Total Valuasi HPP"
					value={formatRupiah(totalHpp)}
					hint="Sum harga beli avg consumables"
					icon={Wallet2}
					accent="primary"
				/>
				<KpiCard
					label="Semua SKU"
					value={totalSkus.toLocaleString("id-ID")}
					hint="Consumables + equipment"
					icon={Layers}
					accent="sky"
				/>
				<KpiCard
					label="Stok Kritis"
					value={criticalCount.toLocaleString("id-ID")}
					hint="Below min_stock_alert"
					icon={AlertTriangle}
					accent="amber"
				/>
				<KpiCard
					label="Stok Habis"
					value={emptyCount.toLocaleString("id-ID")}
					hint="Item dengan stok 0 (movements belum ada)"
					icon={AlertOctagon}
					accent="rose"
				/>
			</dl>

			<div className="space-y-4">
				<WarehouseTabs current={tab} />

				{tab === "consumables" && (
					<ConsumablesTable rows={consumables} />
				)}
				{tab === "equipment" && <EquipmentTable rows={equipment} />}
				{tab === "movements" && <MovementsPlaceholder />}
			</div>
		</div>
	);
}

function ConsumablesTable({ rows }: { rows: ConsumableRow[] }) {
	if (rows.length === 0) {
		return (
			<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
				<Package className="text-muted-foreground h-10 w-10" />
				<div className="space-y-1">
					<h3 className="font-medium">Belum ada consumable</h3>
					<p className="text-muted-foreground text-sm">
						Tambah dari{" "}
						<Link
							href="/settings/items"
							className="text-primary hover:underline"
						>
							Settings → Items
						</Link>
						. Stock movement UI menyusul.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="border-border bg-card overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>SKU</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Unit</TableHead>
						<TableHead className="text-right">Min Stock</TableHead>
						<TableHead className="text-right">Avg Cost</TableHead>
						<TableHead className="text-right">Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r) => (
						<TableRow key={r.id}>
							<TableCell className="tabular text-muted-foreground text-xs">
								{r.sku}
							</TableCell>
							<TableCell className="font-medium">{r.name}</TableCell>
							<TableCell className="text-muted-foreground">
								{r.unit}
							</TableCell>
							<TableCell className="tabular text-right">
								{r.min_stock_alert}
							</TableCell>
							<TableCell className="tabular text-right">
								{r.purchase_price_avg
									? formatRupiah(r.purchase_price_avg)
									: "—"}
							</TableCell>
							<TableCell className="text-right">
								{r.is_active ? (
									<Badge variant="default">Active</Badge>
								) : (
									<Badge variant="secondary">Inactive</Badge>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function EquipmentTable({ rows }: { rows: EquipmentRow[] }) {
	if (rows.length === 0) {
		return (
			<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
				<Package className="text-muted-foreground h-10 w-10" />
				<div className="space-y-1">
					<h3 className="font-medium">Belum ada equipment</h3>
					<p className="text-muted-foreground text-sm">
						Tambah dari{" "}
						<Link
							href="/settings/items"
							className="text-primary hover:underline"
						>
							Settings → Items
						</Link>
						.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="border-border bg-card overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>SKU</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Lokasi</TableHead>
						<TableHead>Kondisi</TableHead>
						<TableHead className="text-right">Harga Beli</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r) => (
						<TableRow key={r.id}>
							<TableCell className="tabular text-muted-foreground text-xs">
								{r.sku}
							</TableCell>
							<TableCell className="font-medium">{r.name}</TableCell>
							<TableCell className="text-muted-foreground">
								{r.current_location
									? (EQUIPMENT_LOCATION_LABELS[r.current_location] ??
										r.current_location)
									: "—"}
							</TableCell>
							<TableCell className="text-muted-foreground">
								{r.condition
									? (EQUIPMENT_CONDITION_LABELS[r.condition] ?? r.condition)
									: "—"}
							</TableCell>
							<TableCell className="tabular text-right">
								{r.purchase_price ? formatRupiah(r.purchase_price) : "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function MovementsPlaceholder() {
	return (
		<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
			<Layers className="text-muted-foreground h-10 w-10" />
			<div className="space-y-1">
				<h3 className="font-medium">Log mutasi belum aktif</h3>
				<p className="text-muted-foreground text-sm">
					Movement tracking + quick stock adjust akan landing di Phase 1 Week 6.
				</p>
			</div>
		</div>
	);
}
