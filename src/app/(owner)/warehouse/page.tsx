import {
	AlertOctagon,
	AlertTriangle,
	Boxes,
	CheckCircle2,
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
import {
	type BundleRow,
	BundlesGrid,
} from "@/components/warehouse/bundles/bundles-grid";
import { MarketListTable } from "@/components/warehouse/market-list/market-list-table";
import type {
	MarketListEntry,
	MarketListItem,
	SupplierOption,
} from "@/components/warehouse/market-list/market-list-table";
import type {
	PembelianItemOption,
	PembelianSupplierOption,
} from "@/components/warehouse/pembelian/pembelian-dialog";
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
					`id, sku, name, unit, unit_conversion, min_stock_alert,
					 purchase_price_avg, is_active,
					 config:items_inventory_config!inner(
					   preferred_supplier_id,
					   supplier:suppliers!items_inventory_config_preferred_supplier_id_fkey(name)
					 )`,
				)
				.eq("category", "inventory")
				.is("deleted_at", null)
				.order("name", { ascending: true }),
			supabase
				.from("inventory_items")
				.select(
					`id, sku, name, purchase_price, condition, current_location, is_active,
					 config:items_fixed_asset_config!inner(
					   asset_number, serial_number, acquisition_type,
					   purchase_price, useful_life_months, depreciation_start_date,
					   current_location
					 )`,
				)
				.eq("category", "fixed_asset")
				.is("deleted_at", null)
				.order("name", { ascending: true }),
			supabase.from("stock_movements").select("item_id, direction, quantity"),
		]);

	type RawConsumable = {
		id: string;
		sku: string;
		name: string;
		unit: string;
		unit_conversion: unknown;
		min_stock_alert: number;
		purchase_price_avg: number;
		is_active: boolean;
		config:
			| {
					preferred_supplier_id: string | null;
					supplier: { name: string } | Array<{ name: string }> | null;
			  }
			| Array<{
					preferred_supplier_id: string | null;
					supplier: { name: string } | Array<{ name: string }> | null;
			  }>
			| null;
	};
	const consumables: ConsumableRow[] = (
		(consumablesResult.data ?? []) as RawConsumable[]
	).map((r) => {
		const cfg = Array.isArray(r.config) ? r.config[0] : r.config;
		const sup = Array.isArray(cfg?.supplier) ? cfg?.supplier[0] : cfg?.supplier;
		return {
			id: r.id,
			sku: r.sku,
			name: r.name,
			unit: r.unit,
			unit_conversion: r.unit_conversion,
			min_stock_alert: r.min_stock_alert,
			purchase_price_avg: r.purchase_price_avg,
			is_active: r.is_active,
			preferred_supplier_id: cfg?.preferred_supplier_id ?? null,
			preferred_supplier_name: sup?.name ?? null,
		};
	});

	// Suppliers fetched ringan untuk quick-restock dialog (Belanja Kritis).
	// Hanya dipakai kalau tab consumables; selalu fetch karena cheap.
	const suppliersForPembelianRes = await supabase
		.from("suppliers")
		.select("id, name, default_payment_term, default_top_days")
		.is("deleted_at", null)
		.eq("is_active", true)
		.order("name");
	const pembelianSuppliers: PembelianSupplierOption[] =
		(suppliersForPembelianRes.data ?? []) as PembelianSupplierOption[];

	// Map consumables → PembelianItemOption shape (subset of fields).
	const pembelianItems: PembelianItemOption[] = consumables
		.filter((c) => c.is_active)
		.map((c) => ({
			id: c.id,
			sku: c.sku,
			name: c.name,
			unit: c.unit,
			unit_conversion: (c.unit_conversion as Record<string, number> | null) ?? null,
			preferred_supplier_id: c.preferred_supplier_id,
			preferred_supplier_name: c.preferred_supplier_name,
		}));

	type RawEquipment = {
		id: string;
		sku: string;
		name: string;
		purchase_price: number | null;
		condition: string | null;
		current_location: string | null;
		is_active: boolean;
		config:
			| {
					asset_number: string | null;
					serial_number: string | null;
					acquisition_type: string | null;
					purchase_price: number | string | null;
					useful_life_months: number | null;
					depreciation_start_date: string | null;
					current_location: string | null;
			  }
			| Array<{
					asset_number: string | null;
					serial_number: string | null;
					acquisition_type: string | null;
					purchase_price: number | string | null;
					useful_life_months: number | null;
					depreciation_start_date: string | null;
					current_location: string | null;
			  }>
			| null;
	};
	const equipment: EquipmentRow[] = (
		(equipmentResult.data ?? []) as RawEquipment[]
	).map((r) => {
		const cfg = Array.isArray(r.config) ? r.config[0] : r.config;
		return {
			id: r.id,
			sku: r.sku,
			name: r.name,
			// Prefer config purchase_price (satellite) over legacy base column
			purchase_price: cfg?.purchase_price
				? Number(cfg.purchase_price)
				: r.purchase_price,
			condition: r.condition,
			current_location: cfg?.current_location ?? r.current_location,
			is_active: r.is_active,
			asset_number: cfg?.asset_number ?? null,
			serial_number: cfg?.serial_number ?? null,
			acquisition_type:
				(cfg?.acquisition_type as
					| "new_commercial"
					| "used_commercial"
					| "owner_contribution"
					| null) ?? "new_commercial",
			useful_life_months: cfg?.useful_life_months ?? null,
			depreciation_start_date: cfg?.depreciation_start_date ?? null,
		};
	});
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
					"id, sku, name, unit, unit_conversion, purchase_price_avg, category",
				)
				.is("deleted_at", null)
				.eq("is_active", true)
				.order("category")
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

	// Bundles data
	let bundleRows: BundleRow[] = [];
	let bundlesActiveCount = 0;
	let bundlesIncompleteCount = 0;
	let bundlesTotalHpp = 0;
	if (tab === "bundles") {
		// Bundle price source: inventory_items.purchase_price_avg (canonical,
		// ter-sync dari Market List primary supplier via trigger). Sebelumnya
		// baca dari items_inventory_config satellite yang stale.
		const { data: bundlesData } = await supabase
			.from("item_bundles")
			.select(
				`id, sku, name, is_active,
				 components:bundle_components(
				   item_id, qty,
				   item:inventory_items!bundle_components_item_id_fkey(id, sku, name, unit, purchase_price_avg)
				 )`,
			)
			.is("deleted_at", null)
			.order("name");

		type RawBundle = {
			id: string;
			sku: string;
			name: string;
			is_active: boolean;
			components: Array<{
				item_id: string;
				qty: number | string;
				item: {
					id: string;
					sku: string;
					name: string;
					unit: string;
					purchase_price_avg: number | string | null;
				} | null;
			}>;
		};

		// stockByItem dari atas (uses movements aggregate) → max-buildable calc
		bundleRows = ((bundlesData ?? []) as unknown as RawBundle[]).map((b) => {
			const comps = (b.components ?? []).map((c) => {
				const avg = Number(c.item?.purchase_price_avg ?? 0);
				const qty = Number(c.qty);
				const componentStock = c.item_id
					? (stockByItem.get(c.item_id) ?? 0)
					: 0;
				const buildable = qty > 0 ? Math.floor(componentStock / qty) : 0;
				return {
					qty,
					item: c.item
						? { sku: c.item.sku, name: c.item.name, unit: c.item.unit }
						: null,
					avg,
					lineCost: avg * qty,
					componentStock,
					buildable,
				};
			});
			const totalHpp = comps.reduce((s, c) => s + c.lineCost, 0);
			// Max bundles buildable = min(buildable per component). Kalau ada
			// komponen 0, hasilnya 0 (bottleneck logic).
			const maxBuildable =
				comps.length > 0 ? Math.min(...comps.map((c) => c.buildable)) : 0;
			return {
				id: b.id,
				sku: b.sku,
				name: b.name,
				is_active: b.is_active,
				componentCount: comps.length,
				totalHpp,
				maxBuildable,
				components: comps,
			};
		});

		for (const b of bundleRows) {
			if (!b.is_active) continue;
			bundlesActiveCount++;
			if (b.maxBuildable === 0) bundlesIncompleteCount++;
			bundlesTotalHpp += b.totalHpp;
		}
	}

	// Dynamic action button per tab
	const primaryActionHref =
		tab === "bundles"
			? "/warehouse/bundles/new"
			: tab === "fixed_asset"
				? "/warehouse/items/new?category=fixed_asset"
				: tab === "consumables"
					? "/warehouse/items/new?category=inventory"
					: "/warehouse/items/new";
	const primaryActionLabel =
		tab === "bundles"
			? "Tambah Bundle"
			: tab === "fixed_asset"
				? "Tambah Aset"
				: tab === "consumables"
					? "Tambah Persediaan"
					: "Tambah Item";

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Warehouse"
				description="Track stok consumables, equipment, supplier, dan log mutasi."
				actions={
					<>
						{/* Workflow actions — ordered: master data → transactional → audit → primary */}
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
							href="/warehouse/wastage"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<AlertTriangle className="size-4" />
							Wastage
						</Link>
						<Link
							href={primaryActionHref}
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							<Plus className="size-4" />
							{primaryActionLabel}
						</Link>
					</>
				}
			/>

			<KpiRow>
				{tab === "bundles" ? (
					<>
						<KpiCard
							label="Bundle Aktif"
							value={bundlesActiveCount.toLocaleString("id-ID")}
							hint={`dari ${bundleRows.length} total recipe`}
							icon={Boxes}
							accent="primary"
						/>
						<KpiCard
							label="Siap Pakai"
							value={
								bundlesActiveCount === 0
									? "—"
									: `${bundlesActiveCount - bundlesIncompleteCount} / ${bundlesActiveCount}`
							}
							hint={
								bundlesIncompleteCount === 0 && bundlesActiveCount > 0
									? "semua bundle stok cukup"
									: `${bundlesIncompleteCount} bundle komponen habis`
							}
							icon={CheckCircle2}
							accent={
								bundlesIncompleteCount === 0 ? "emerald" : "amber"
							}
						/>
						<KpiCard
							label="Total Recipe Value"
							value={formatRupiah(bundlesTotalHpp)}
							hint="Σ estimasi HPP per 1× bundle"
							icon={Wallet2}
							accent="sky"
						/>
						<KpiCard
							label="Avg Komponen / Bundle"
							value={
								bundleRows.length > 0
									? (
											bundleRows.reduce(
												(s, b) => s + b.componentCount,
												0,
											) / bundleRows.length
										).toFixed(1)
									: "—"
							}
							hint="rata-rata komponen per recipe"
							icon={Layers}
						/>
					</>
				) : (
					<>
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
					</>
				)}
			</KpiRow>

			<div className="space-y-4">
				<WarehouseTabs current={tab} />

				{tab === "consumables" && (
					<ConsumablesTable
						rows={consumables}
						stockEntries={Array.from(stockByItem.entries())}
						pembelianItems={pembelianItems}
						pembelianSuppliers={pembelianSuppliers}
					/>
				)}
				{tab === "fixed_asset" && (
					<div className="space-y-3">
						<div className="bg-surface-3 flex items-center justify-between rounded-md px-3 py-2 text-[12px]">
							<span className="text-muted-foreground">
								Tampilan operasional — kondisi, lokasi, check-out.
							</span>
							<Link
								href="/warehouse/assets"
								className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
							>
								<Wallet2 className="size-3.5" />
								Asset Register (Financial)
							</Link>
						</div>
						<EquipmentTable rows={equipment} />
					</div>
				)}
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
				{tab === "bundles" && <BundlesGrid rows={bundleRows} />}
			</div>
		</Container>
	);
}
