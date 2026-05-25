import {
	AlertOctagon,
	AlertTriangle,
	ClipboardCheck,
	Layers,
	Plus,
	ShoppingCart,
	Truck,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { MarketListTable } from "@/components/warehouse/market-list/market-list-table";
import type {
	MarketListEntry,
	MarketListItem,
	SupplierOption,
} from "@/components/warehouse/market-list/market-list-table";
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
	searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
	const params = await searchParams;
	const tab = params.tab?.trim() || "consumables";

	const supabase = await createClient();

	const [consumablesResult, equipmentResult, movementsAggResult] =
		await Promise.all([
			supabase
				.from("inventory_items")
				.select(
					"id, sku, name, unit, unit_conversion, min_stock_alert, purchase_price_avg, is_active",
				)
				.eq("category", "inventory")
				.is("deleted_at", null)
				.order("name", { ascending: true }),
			supabase
				.from("inventory_items")
				.select(
					"id, sku, name, purchase_price, condition, current_location, is_active",
				)
				.eq("category", "fixed_asset")
				.is("deleted_at", null)
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
		const fromDate = params.from?.trim();
		const toDate = params.to?.trim();
		let mq = supabase
			.from("stock_movements")
			.select(
				`
				id, ref_id, item_id, direction, quantity, unit_cost, source, supplier_id,
				notes, created_at,
				performed_by_user:users!stock_movements_performed_by_fkey(full_name),
				item:inventory_items!stock_movements_item_id_fkey(name, sku, unit),
				supplier:suppliers!stock_movements_supplier_id_fkey(name)
			`,
			)
			.order("created_at", { ascending: false })
			.limit(200);
		if (fromDate) mq = mq.gte("created_at", fromDate);
		if (toDate) {
			const end = new Date(toDate);
			end.setHours(23, 59, 59, 999);
			mq = mq.lte("created_at", end.toISOString());
		}
		const { data } = await mq;
		movementsLog = (data ?? []).map((m) => ({
			...m,
			performed_by_user: Array.isArray(m.performed_by_user)
				? m.performed_by_user[0]
				: m.performed_by_user,
			item: Array.isArray(m.item) ? m.item[0] : m.item,
			supplier: Array.isArray(m.supplier) ? m.supplier[0] : m.supplier,
		})) as MovementRow[];
	}

	// Market List data
	let marketItems: MarketListItem[] = [];
	let marketEntries: MarketListEntry[] = [];
	let marketSuppliers: SupplierOption[] = [];
	if (tab === "market") {
		const [itemsRes, entriesRes, suppliersRes] = await Promise.all([
			supabase
				.from("inventory_items")
				.select(
					"id, sku, name, unit, unit_conversion, purchase_price_avg",
				)
				.eq("category", "inventory")
				.is("deleted_at", null)
				.eq("is_active", true)
				.order("name"),
			supabase
				.from("supplier_prices")
				.select(
					"id, supplier_id, item_id, pack_price, pack_size, pack_unit, is_primary, notes, supplier:suppliers!supplier_prices_supplier_id_fkey(name)",
				),
			supabase
				.from("suppliers")
				.select("id, name")
				.is("deleted_at", null)
				.eq("is_active", true)
				.order("name"),
		]);
		marketItems = (itemsRes.data ?? []) as MarketListItem[];
		marketEntries = ((entriesRes.data ?? []) as Array<{
			id: string;
			supplier_id: string;
			item_id: string;
			pack_price: number;
			pack_size: number | string;
			pack_unit: string;
			is_primary: boolean;
			notes: string | null;
			supplier: { name: string } | { name: string }[] | null;
		}>).map((r) => {
			const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
			return {
				id: r.id,
				supplier_id: r.supplier_id,
				supplier_name: sup?.name ?? "—",
				item_id: r.item_id,
				pack_price: Number(r.pack_price),
				pack_size: Number(r.pack_size),
				pack_unit: r.pack_unit,
				is_primary: r.is_primary,
				notes: r.notes,
			};
		});
		marketSuppliers = (suppliersRes.data ?? []) as SupplierOption[];
	}

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Warehouse"
				description="Track stok consumables, equipment, supplier, dan log mutasi."
				actions={
					<>
						<Link
							href="/warehouse/suppliers"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<Truck className="size-4" />
							Supplier
						</Link>
						<Link
							href="/warehouse/purchase-requests"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<ClipboardCheck className="size-4" />
							Permintaan
						</Link>
						<Link
							href="/warehouse/purchases"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<ShoppingCart className="size-4" />
							Pembelian
						</Link>
						<Link
							href="/warehouse/stock-take"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<ClipboardCheck className="size-4" />
							Stock Opname
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
					label="Nilai HPP Stok"
					value={formatRupiah(totalHpp)}
					hint="Σ (stok × harga avg)"
					icon={Wallet2}
					accent="primary"
				/>
				<KpiCard
					label="SKU Aktif"
					value={totalSkus.toLocaleString("id-ID")}
					hint={`${consumables.length} consumable · ${equipment.length} equipment`}
					icon={Layers}
					accent="sky"
				/>
				<KpiCard
					label="Stok Kritis"
					value={criticalCount.toLocaleString("id-ID")}
					hint="≤ min alert (perlu restock)"
					icon={AlertTriangle}
					accent="amber"
				/>
				<KpiCard
					label="Stok Habis"
					value={emptyCount.toLocaleString("id-ID")}
					hint="stok 0 atau minus"
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
				{tab === "fixed_asset" && <EquipmentTable rows={equipment} />}
				{tab === "market" && (
					<MarketListTable
						items={marketItems}
						entries={marketEntries}
						suppliers={marketSuppliers}
					/>
				)}
				{tab === "movements" && (
					<MovementsLog
						rows={movementsLog}
						defaultFrom={params.from}
						defaultTo={params.to}
					/>
				)}
			</div>
		</Container>
	);
}
