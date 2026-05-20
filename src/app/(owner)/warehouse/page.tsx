import {
	AlertOctagon,
	AlertTriangle,
	ClipboardCheck,
	Layers,
	Plus,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import {
	type ConsumableRow,
	ConsumablesTable,
	type EquipmentRow,
	EquipmentTable,
	type MovementRow,
	MovementsLog,
} from "@/components/warehouse/warehouse-tables";
import { WarehouseTabs } from "@/components/warehouse/warehouse-tabs";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type MovementAgg = {
	item_id: string;
	direction: "in" | "out" | "adjustment";
	quantity: number;
};

function computeStock(itemId: string, movements: MovementAgg[]): number {
	let stock = 0;
	for (const m of movements) {
		if (m.item_id !== itemId) continue;
		if (m.direction === "in") stock += m.quantity;
		else if (m.direction === "out") stock -= m.quantity;
		else stock += m.quantity;
	}
	return stock;
}

export default async function WarehousePage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const params = await searchParams;
	const tab = params.tab?.trim() || "consumables";

	const supabase = await createClient();

	const [consumablesResult, equipmentResult, movementsAggResult] =
		await Promise.all([
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
			supabase.from("stock_movements").select("item_id, direction, quantity"),
		]);

	const consumables = (consumablesResult.data ?? []) as ConsumableRow[];
	const equipment = (equipmentResult.data ?? []) as EquipmentRow[];
	const movementsAgg = (movementsAggResult.data ?? []) as MovementAgg[];

	const stockByItem = new Map<string, number>();
	for (const item of consumables) {
		stockByItem.set(item.id, computeStock(item.id, movementsAgg));
	}

	const totalSkus = consumables.length + equipment.length;
	const totalHpp = consumables.reduce(
		(s, c) => s + (stockByItem.get(c.id) ?? 0) * (c.purchase_price_avg ?? 0),
		0,
	);

	let criticalCount = 0;
	let emptyCount = 0;
	for (const c of consumables) {
		const s = stockByItem.get(c.id) ?? 0;
		if (s <= 0) emptyCount++;
		else if (c.min_stock_alert > 0 && s <= c.min_stock_alert) criticalCount++;
	}

	let movementsLog: MovementRow[] = [];
	if (tab === "movements") {
		const { data } = await supabase
			.from("stock_movements")
			.select(
				`
				id, ref_id, item_id, direction, quantity, source, notes, created_at,
				performed_by_user:users!stock_movements_performed_by_fkey(full_name),
				item:inventory_items!stock_movements_item_id_fkey(name, sku, unit)
			`,
			)
			.order("created_at", { ascending: false })
			.limit(100);
		movementsLog = (data ?? []).map((m) => ({
			...m,
			performed_by_user: Array.isArray(m.performed_by_user)
				? m.performed_by_user[0]
				: m.performed_by_user,
			item: Array.isArray(m.item) ? m.item[0] : m.item,
		})) as MovementRow[];
	}

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Warehouse"
				description="Track stok consumables, equipment, dan log mutasi."
				actions={
					<>
						<Link
							href="/warehouse/stock-take"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<ClipboardCheck className="size-4" />
							Stock Take
						</Link>
						<Link
							href="/warehouse/items/new"
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							<Plus className="size-4" />
							Tambah Item
						</Link>
					</>
				}
			/>

			<KpiRow>
				<KpiCard
					label="Total Valuasi HPP"
					value={formatRupiah(totalHpp)}
					hint="Stok × harga avg"
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
					hint="≤ min_stock_alert"
					icon={AlertTriangle}
					accent="amber"
				/>
				<KpiCard
					label="Stok Habis"
					value={emptyCount.toLocaleString("id-ID")}
					hint="Stok ≤ 0"
					icon={AlertOctagon}
					accent="rose"
				/>
			</KpiRow>

			<div className="space-y-4">
				<WarehouseTabs current={tab} />

				{tab === "consumables" && (
					<ConsumablesTable
						rows={consumables}
						stockEntries={Array.from(stockByItem.entries())}
					/>
				)}
				{tab === "equipment" && <EquipmentTable rows={equipment} />}
				{tab === "movements" && <MovementsLog rows={movementsLog} />}
			</div>
		</Container>
	);
}
