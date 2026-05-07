import {
	AlertOctagon,
	AlertTriangle,
	ArrowDownToLine,
	ArrowUpFromLine,
	Equal,
	Layers,
	Package,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { StockAdjustDialog } from "@/components/warehouse/stock-adjust-dialog";
import { WarehouseTabs } from "@/components/warehouse/warehouse-tabs";
import {
	EQUIPMENT_CONDITION_LABELS,
	EQUIPMENT_LOCATION_LABELS,
	formatDateID,
	formatRupiah,
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

type MovementAgg = {
	item_id: string;
	direction: "in" | "out" | "adjustment";
	quantity: number;
};

type MovementRow = {
	id: string;
	ref_id: string;
	item_id: string;
	direction: "in" | "out" | "adjustment";
	quantity: number;
	source: string;
	notes: string | null;
	created_at: string;
	performed_by_user: { full_name: string } | null;
	item: { name: string; sku: string; unit: string } | null;
};

const SOURCE_LABELS: Record<string, string> = {
	settlement: "Settlement",
	purchase: "Purchase",
	manual_adjust: "Manual",
	damage: "Damage",
	loss: "Loss",
	stock_take: "Stock Take",
	transfer: "Transfer",
};

function computeStock(itemId: string, movements: MovementAgg[]): number {
	let stock = 0;
	for (const m of movements) {
		if (m.item_id !== itemId) continue;
		if (m.direction === "in") stock += m.quantity;
		else if (m.direction === "out") stock -= m.quantity;
		else stock += m.quantity; // adjustment treated additive (caller signs)
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

	// Compute current stock per consumable item
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

	// Movements log query (only when tab=movements)
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
			</dl>

			<div className="space-y-4">
				<WarehouseTabs current={tab} />

				{tab === "consumables" && (
					<ConsumablesTable rows={consumables} stockByItem={stockByItem} />
				)}
				{tab === "equipment" && <EquipmentTable rows={equipment} />}
				{tab === "movements" && <MovementsLog rows={movementsLog} />}
			</div>
		</div>
	);
}

function ConsumablesTable({
	rows,
	stockByItem,
}: {
	rows: ConsumableRow[];
	stockByItem: Map<string, number>;
}) {
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
						<TableHead>Unit</TableHead>
						<TableHead className="text-right">Stok</TableHead>
						<TableHead className="text-right">Min Alert</TableHead>
						<TableHead className="text-right">Avg Cost</TableHead>
						<TableHead className="w-[120px] text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r) => {
						const stock = stockByItem.get(r.id) ?? 0;
						const isEmpty = stock <= 0;
						const isCritical =
							!isEmpty && r.min_stock_alert > 0 && stock <= r.min_stock_alert;
						return (
							<TableRow key={r.id}>
								<TableCell className="tabular text-muted-foreground text-xs">
									{r.sku}
								</TableCell>
								<TableCell className="font-medium">
									<div className="flex items-center gap-2">
										{r.name}
										{!r.is_active && (
											<Badge variant="secondary">Inactive</Badge>
										)}
									</div>
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{r.unit}
								</TableCell>
								<TableCell className="text-right">
									<span
										className={`tabular font-semibold ${
											isEmpty
												? "text-rose-500"
												: isCritical
													? "text-amber-500"
													: "text-foreground"
										}`}
									>
										{stock.toLocaleString("id-ID")}
									</span>
									{(isEmpty || isCritical) && (
										<div className="text-muted-foreground text-[10px] uppercase tracking-wider">
											{isEmpty ? "habis" : "kritis"}
										</div>
									)}
								</TableCell>
								<TableCell className="tabular text-muted-foreground text-right text-sm">
									{r.min_stock_alert || "—"}
								</TableCell>
								<TableCell className="tabular text-muted-foreground text-right text-sm">
									{r.purchase_price_avg
										? formatRupiah(r.purchase_price_avg)
										: "—"}
								</TableCell>
								<TableCell className="text-right">
									<StockAdjustDialog
										itemId={r.id}
										itemName={r.name}
										itemUnit={r.unit}
										currentStock={stock}
										avgCost={r.purchase_price_avg ?? 0}
									/>
								</TableCell>
							</TableRow>
						);
					})}
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
							<TableCell className="text-muted-foreground text-sm">
								{r.current_location
									? (EQUIPMENT_LOCATION_LABELS[r.current_location] ??
										r.current_location)
									: "—"}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{r.condition
									? (EQUIPMENT_CONDITION_LABELS[r.condition] ?? r.condition)
									: "—"}
							</TableCell>
							<TableCell className="tabular text-right text-sm">
								{r.purchase_price ? formatRupiah(r.purchase_price) : "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function MovementsLog({ rows }: { rows: MovementRow[] }) {
	if (rows.length === 0) {
		return (
			<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
				<Layers className="text-muted-foreground h-10 w-10" />
				<div className="space-y-1">
					<h3 className="font-medium">Belum ada mutasi</h3>
					<p className="text-muted-foreground text-sm">
						Klik <span className="font-medium">Adjust</span> di tab Consumables
						untuk catat movement pertama.
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
						<TableHead>Ref</TableHead>
						<TableHead>Tanggal</TableHead>
						<TableHead>Item</TableHead>
						<TableHead>Direction</TableHead>
						<TableHead className="text-right">Qty</TableHead>
						<TableHead>Sumber</TableHead>
						<TableHead>Catatan</TableHead>
						<TableHead>Oleh</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((m) => (
						<TableRow key={m.id}>
							<TableCell className="text-muted-foreground tabular text-xs">
								{m.ref_id}
							</TableCell>
							<TableCell className="text-muted-foreground tabular text-sm">
								{formatDateID(m.created_at)}
							</TableCell>
							<TableCell>
								<div className="font-medium">{m.item?.name ?? "—"}</div>
								<div className="text-muted-foreground text-xs">
									{m.item?.sku ?? "—"}
								</div>
							</TableCell>
							<TableCell>
								{m.direction === "in" ? (
									<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 text-sm font-medium">
										<ArrowDownToLine className="h-3.5 w-3.5" /> Masuk
									</span>
								) : m.direction === "out" ? (
									<span className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 text-sm font-medium">
										<ArrowUpFromLine className="h-3.5 w-3.5" /> Keluar
									</span>
								) : (
									<span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 text-sm font-medium">
										<Equal className="h-3.5 w-3.5" /> Koreksi
									</span>
								)}
							</TableCell>
							<TableCell
								className={`tabular text-right font-medium ${
									m.direction === "in"
										? "text-emerald-600 dark:text-emerald-400"
										: m.direction === "out"
											? "text-rose-600 dark:text-rose-400"
											: "text-foreground"
								}`}
							>
								{m.direction === "in" ? "+" : m.direction === "out" ? "−" : ""}
								{m.quantity.toLocaleString("id-ID")} {m.item?.unit ?? ""}
							</TableCell>
							<TableCell className="text-muted-foreground text-xs">
								{SOURCE_LABELS[m.source] ?? m.source}
							</TableCell>
							<TableCell className="text-muted-foreground max-w-xs text-xs">
								{m.notes ?? "—"}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{m.performed_by_user?.full_name ?? "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
