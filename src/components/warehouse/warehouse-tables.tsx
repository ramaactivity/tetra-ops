"use client";

import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Equal,
	Layers,
	Package,
	Pencil,
} from "lucide-react";
import Link from "next/link";
import { ArchiveItemButton } from "@/components/items/archive-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { StockAdjustDialog } from "@/components/warehouse/stock-adjust-dialog";
import {
	EQUIPMENT_CONDITION_LABELS,
	EQUIPMENT_LOCATION_LABELS,
	formatDateID,
	formatRupiah,
} from "@/lib/format";

function EditItemLink({ id, label }: { id: string; label: string }) {
	return (
		<Link
			href={`/warehouse/items/${id}/edit`}
			title={`Edit ${label}`}
			aria-label={`Edit ${label}`}
			className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
		>
			<Pencil className="size-4" aria-hidden />
		</Link>
	);
}

/**
 * Client wrappers for the 3 warehouse tables. Each takes serializable
 * props from the server warehouse page.
 */

export type ConsumableRow = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	/**
	 * JSONB mapping alt-unit → base-unit multiplier.
	 * Base unit (the `unit` field) always has key = unit and value = 1.
	 * Example for MEDIA-BASIC (base=roll):
	 *   { "roll": 1, "lembar_4r": 700, "lembar_2r": 1400 }
	 */
	unit_conversion: Record<string, number> | null;
	min_stock_alert: number;
	purchase_price_avg: number;
	is_active: boolean;
};

/**
 * Format roll-based stock for display.
 *   Roll-first, capacity-secondary. E.g.:
 *   - "2.5 roll (≈ 1.750 prints 4R atau 3.500 prints 2R)"
 *   - "0.143 roll (≈ 200 prints polaroid)"
 * For non-roll items, returns "{qty} {unit}" plain.
 */
function formatStockDisplay(
	stock: number,
	unit: string,
	conversion: Record<string, number> | null,
): { primary: string; secondary?: string } {
	if (unit !== "roll" || !conversion) {
		// Non-roll items: integer-display
		return {
			primary: `${Number(stock).toLocaleString("id-ID", {
				maximumFractionDigits: 2,
			})} ${unit}`,
		};
	}
	const rollDisplay = `${Number(stock).toLocaleString("id-ID", {
		maximumFractionDigits: 3,
	})} roll`;
	const capacities: string[] = [];
	for (const [k, mult] of Object.entries(conversion)) {
		if (k === "roll") continue;
		const capacity = Math.floor(stock * mult);
		if (capacity > 0) {
			const label = k.replace(/^lembar_/, "prints ").replace("_", " ");
			capacities.push(
				`${capacity.toLocaleString("id-ID")} ${label}`,
			);
		}
	}
	return {
		primary: rollDisplay,
		secondary: capacities.length > 0 ? `≈ ${capacities.join(" atau ")}` : undefined,
	};
}

export type EquipmentRow = {
	id: string;
	sku: string;
	name: string;
	purchase_price: number | null;
	condition: string | null;
	current_location: string | null;
	is_active: boolean;
};

export type MovementRow = {
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
	rekap_consumption: "Rekap Approval",
};

export function ConsumablesTable({
	rows,
	stockEntries,
}: {
	rows: ConsumableRow[];
	stockEntries: Array<[string, number]>;
}) {
	if (rows.length === 0) {
		return (
			<EmptyState
				icon={Package}
				title="Belum ada consumable"
				description={
					<>
						Klik{" "}
						<Link
							href="/warehouse/items/new"
							className="text-primary hover:underline"
						>
							Tambah Item
						</Link>{" "}
						di header untuk mulai.
					</>
				}
			/>
		);
	}

	const stockByItem = new Map(stockEntries);

	const columns: ResponsiveTableColumn<ConsumableRow>[] = [
		{
			key: "sku",
			header: "SKU",
			render: (r) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{r.sku}
				</span>
			),
		},
		{
			key: "name",
			header: "Name",
			render: (r) => (
				<div className="flex items-center gap-2 font-medium">
					{r.name}
					{!r.is_active && <Badge variant="secondary">Inactive</Badge>}
				</div>
			),
		},
		{
			key: "unit",
			header: "Unit",
			hideOnMobile: true,
			render: (r) => (
				<span className="text-fluid-caption text-muted-foreground">
					{r.unit}
				</span>
			),
		},
		{
			key: "stock",
			header: "Stok",
			align: "right",
			render: (r) => {
				const stock = stockByItem.get(r.id) ?? 0;
				const isNegative = stock < 0;
				const isEmpty = stock === 0;
				const isCritical =
					stock > 0 && r.min_stock_alert > 0 && stock <= r.min_stock_alert;
				const display = formatStockDisplay(stock, r.unit, r.unit_conversion);
				return (
					<div className="text-right">
						<span
							className={`tabular font-semibold ${
								isNegative
									? "text-rose-600 dark:text-rose-400"
									: isEmpty
										? "text-rose-500"
										: isCritical
											? "text-amber-500"
											: "text-foreground"
							}`}
						>
							{display.primary}
						</span>
						{display.secondary && (
							<div className="text-[11px] text-muted-foreground">
								{display.secondary}
							</div>
						)}
						{(isEmpty || isCritical || isNegative) && (
							<div className="text-fluid-caption uppercase tracking-wider text-muted-foreground">
								{isNegative
									? "NEGATIVE — restock"
									: isEmpty
										? "habis"
										: "kritis"}
							</div>
						)}
					</div>
				);
			},
		},
		{
			key: "min_stock_alert",
			header: "Min Alert",
			align: "right",
			hideOnMobile: true,
			render: (r) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{r.min_stock_alert || "—"}
				</span>
			),
		},
		{
			key: "avg_cost",
			header: "Avg Cost",
			align: "right",
			hideOnMobile: true,
			render: (r) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{r.purchase_price_avg ? formatRupiah(r.purchase_price_avg) : "—"}
				</span>
			),
		},
		{
			key: "actions",
			header: "Actions",
			align: "right",
			render: (r) => {
				const stock = stockByItem.get(r.id) ?? 0;
				return (
					<div className="flex items-center justify-end gap-1">
						<StockAdjustDialog
							itemId={r.id}
							itemName={r.name}
							itemUnit={r.unit}
							currentStock={stock}
							avgCost={r.purchase_price_avg ?? 0}
						/>
						<EditItemLink id={r.id} label={r.name} />
						<ArchiveItemButton id={r.id} name={r.name} />
					</div>
				);
			},
		},
	];

	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
			<ResponsiveTable<ConsumableRow>
				keyExtractor={(r) => r.id}
				rows={rows}
				columns={columns}
			/>
		</div>
	);
}

export function EquipmentTable({ rows }: { rows: EquipmentRow[] }) {
	if (rows.length === 0) {
		return (
			<EmptyState
				icon={Package}
				title="Belum ada equipment"
				description={
					<>
						Klik{" "}
						<Link
							href="/warehouse/items/new"
							className="text-primary hover:underline"
						>
							Tambah Item
						</Link>{" "}
						di header untuk mulai.
					</>
				}
			/>
		);
	}

	const columns: ResponsiveTableColumn<EquipmentRow>[] = [
		{
			key: "sku",
			header: "SKU",
			render: (r) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{r.sku}
				</span>
			),
		},
		{
			key: "name",
			header: "Name",
			render: (r) => <span className="font-medium">{r.name}</span>,
		},
		{
			key: "current_location",
			header: "Lokasi",
			render: (r) => (
				<span className="text-fluid-caption text-muted-foreground">
					{r.current_location
						? (EQUIPMENT_LOCATION_LABELS[r.current_location] ??
							r.current_location)
						: "—"}
				</span>
			),
		},
		{
			key: "condition",
			header: "Kondisi",
			render: (r) => (
				<span className="text-fluid-caption text-muted-foreground">
					{r.condition
						? (EQUIPMENT_CONDITION_LABELS[r.condition] ?? r.condition)
						: "—"}
				</span>
			),
		},
		{
			key: "purchase_price",
			header: "Harga Beli",
			align: "right",
			hideOnMobile: true,
			render: (r) => (
				<span className="tabular text-fluid-caption">
					{r.purchase_price ? formatRupiah(r.purchase_price) : "—"}
				</span>
			),
		},
		{
			key: "actions",
			header: "Actions",
			align: "right",
			render: (r) => (
				<div className="flex items-center justify-end gap-1">
					<EditItemLink id={r.id} label={r.name} />
					<ArchiveItemButton id={r.id} name={r.name} />
				</div>
			),
		},
	];

	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
			<ResponsiveTable<EquipmentRow>
				keyExtractor={(r) => r.id}
				rows={rows}
				columns={columns}
			/>
		</div>
	);
}

export function MovementsLog({ rows }: { rows: MovementRow[] }) {
	if (rows.length === 0) {
		return (
			<EmptyState
				icon={Layers}
				title="Belum ada mutasi"
				description="Klik Adjust di tab Consumables untuk catat movement pertama."
			/>
		);
	}

	const columns: ResponsiveTableColumn<MovementRow>[] = [
		{
			key: "ref_id",
			header: "Ref",
			hideOnMobile: true,
			render: (m) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{m.ref_id}
				</span>
			),
		},
		{
			key: "created_at",
			header: "Tanggal",
			render: (m) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{formatDateID(m.created_at)}
				</span>
			),
		},
		{
			key: "item",
			header: "Item",
			render: (m) => (
				<div>
					<div className="font-medium">{m.item?.name ?? "—"}</div>
					<div className="text-fluid-caption text-muted-foreground">
						{m.item?.sku ?? "—"}
					</div>
				</div>
			),
		},
		{
			key: "direction",
			header: "Direction",
			hideOnMobile: true,
			render: (m) =>
				m.direction === "in" ? (
					<span className="inline-flex items-center gap-1 text-fluid-caption font-medium text-emerald-600 dark:text-emerald-400">
						<ArrowDownToLine className="size-3.5" /> Masuk
					</span>
				) : m.direction === "out" ? (
					<span className="inline-flex items-center gap-1 text-fluid-caption font-medium text-rose-600 dark:text-rose-400">
						<ArrowUpFromLine className="size-3.5" /> Keluar
					</span>
				) : (
					<span className="inline-flex items-center gap-1 text-fluid-caption font-medium text-amber-600 dark:text-amber-400">
						<Equal className="size-3.5" /> Koreksi
					</span>
				),
		},
		{
			key: "quantity",
			header: "Qty",
			align: "right",
			render: (m) => (
				<span
					className={`tabular font-medium ${
						m.direction === "in"
							? "text-emerald-600 dark:text-emerald-400"
							: m.direction === "out"
								? "text-rose-600 dark:text-rose-400"
								: "text-foreground"
					}`}
				>
					{m.direction === "in" ? "+" : m.direction === "out" ? "−" : ""}
					{m.quantity.toLocaleString("id-ID")} {m.item?.unit ?? ""}
				</span>
			),
		},
		{
			key: "source",
			header: "Sumber",
			hideOnMobile: true,
			render: (m) => (
				<span className="text-fluid-caption text-muted-foreground">
					{SOURCE_LABELS[m.source] ?? m.source}
				</span>
			),
		},
		{
			key: "notes",
			header: "Catatan",
			hideOnMobile: true,
			render: (m) => (
				<span className="line-clamp-2 max-w-xs text-fluid-caption text-muted-foreground">
					{m.notes ?? "—"}
				</span>
			),
		},
		{
			key: "performed_by",
			header: "Oleh",
			hideOnMobile: true,
			render: (m) => (
				<span className="text-fluid-caption text-muted-foreground">
					{m.performed_by_user?.full_name ?? "—"}
				</span>
			),
		},
	];

	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
			<ResponsiveTable<MovementRow>
				keyExtractor={(m) => m.id}
				rows={rows}
				columns={columns}
			/>
		</div>
	);
}
