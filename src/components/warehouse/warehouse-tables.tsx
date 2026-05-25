"use client";

import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Calendar,
	Equal,
	Layers,
	Package,
	Pencil,
	Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArchiveItemButton } from "@/components/items/archive-button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { RestockDialog } from "@/components/warehouse/restock-dialog";
import {
	listCapacityBreakdown,
	normalizeConversion,
} from "@/lib/inventory/unit-conversion";
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared toolbar primitives
// ─────────────────────────────────────────────────────────────────────────────

function SearchInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
}) {
	return (
		<div className="relative flex-1 sm:max-w-xs">
			<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<input
				type="search"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-caption placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
			/>
		</div>
	);
}

function FilterChips<K extends string>({
	value,
	onChange,
	options,
}: {
	value: K;
	onChange: (v: K) => void;
	options: ReadonlyArray<{ key: K; label: string; count: number }>;
}) {
	return (
		<div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border-default bg-surface-2 p-1 text-[11px]">
			{options.map((o) => {
				const active = o.key === value;
				return (
					<button
						key={o.key}
						type="button"
						onClick={() => onChange(o.key)}
						aria-pressed={active}
						className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
							active
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
						}`}
					>
						{o.label}
						<span
							className={`tabular ${active ? "opacity-80" : "text-muted-foreground/70"}`}
						>
							{o.count}
						</span>
					</button>
				);
			})}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Consumables
// ─────────────────────────────────────────────────────────────────────────────

export type ConsumableRow = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	unit_conversion: unknown;
	min_stock_alert: number;
	purchase_price_avg: number;
	is_active: boolean;
	preferred_supplier_name: string | null;
};

/** Reusable muted placeholder untuk null/empty cells.
 *  Variant "dash" = elegant minimal "—" for asset/equipment table.
 *  Variant "text" = explicit "Belum di-set" untuk konteks yg butuh hint. */
function MutedDash({
	label,
	variant = "text",
}: {
	label?: string;
	variant?: "text" | "dash";
}) {
	if (variant === "dash") {
		return <span className="text-foreground/20 text-[12px]">—</span>;
	}
	return (
		<span className="text-foreground/25 italic text-[11px]">
			{label ?? "Belum di-set"}
		</span>
	);
}

type StockState = "habis" | "minus" | "kritis" | "aman";

function classifyStock(stock: number, minAlert: number): StockState {
	if (stock < 0) return "minus";
	if (stock === 0) return "habis";
	if (minAlert > 0 && stock <= minAlert) return "kritis";
	return "aman";
}

function StockStateBadge({ state }: { state: StockState }) {
	if (state === "aman") return null;
	const map = {
		minus: {
			label: "Minus",
			cls: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300",
		},
		habis: {
			label: "Habis",
			cls: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
		},
		kritis: {
			label: "Kritis",
			cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
		},
	} as const;
	const { label, cls } = map[state];
	return (
		<Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${cls}`}>
			{label}
		</Badge>
	);
}

type CapacityBadge = {
	abbr: string;
	value: number;
	formatted: string;
};

type StockDisplay = {
	primary: string;
	primaryUnit: string;
	breakdown: CapacityBadge[];
};

/** Compact label: "Lembar 4R" → "4R", "Lembar Polaroid" → "Polaroid", else as-is. */
function abbreviateUnitLabel(label: string): string {
	const lower = label.toLowerCase();
	if (lower.startsWith("lembar ")) return label.slice("lembar ".length);
	return label;
}

/** Compact number: 46.200 → "46.2K", 1.250 → "1.250", 92.400 → "92.4K". */
function compactNumber(n: number): string {
	const abs = Math.abs(n);
	if (abs >= 10_000) {
		const k = n / 1000;
		const decimals = k >= 100 ? 0 : 1;
		return `${k.toLocaleString("id-ID", { maximumFractionDigits: decimals })}K`;
	}
	return Math.floor(n).toLocaleString("id-ID");
}

function formatStockDisplay(
	stock: number,
	unit: string,
	conversion: unknown,
): StockDisplay {
	const primary = Number(stock).toLocaleString("id-ID", {
		maximumFractionDigits: unit === "roll" ? 3 : 2,
	});

	if (unit !== "roll" || !conversion) {
		return { primary, primaryUnit: unit, breakdown: [] };
	}

	const map = normalizeConversion(conversion, unit);
	const breakdown = listCapacityBreakdown(stock, map).map(
		(e): CapacityBadge => ({
			abbr: abbreviateUnitLabel(e.label),
			value: e.value,
			formatted: compactNumber(e.value),
		}),
	);
	return { primary, primaryUnit: map.base_unit, breakdown };
}

type ConsumableFilter =
	| "all"
	| "habis"
	| "kritis"
	| "aman"
	| "inactive";

type ConsumableSort =
	| "name"
	| "stock-low"
	| "stock-high"
	| "value-high"
	| "alert-urgent";

const CONSUMABLE_SORT_OPTIONS: ReadonlyArray<{
	value: ConsumableSort;
	label: string;
}> = [
	{ value: "name", label: "Nama A→Z" },
	{ value: "alert-urgent", label: "Urgensi restock" },
	{ value: "stock-low", label: "Stok terendah" },
	{ value: "stock-high", label: "Stok terbanyak" },
	{ value: "value-high", label: "Nilai HPP terbesar" },
];

export function ConsumablesTable({
	rows,
	stockEntries,
}: {
	rows: ConsumableRow[];
	stockEntries: Array<[string, number]>;
}) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<ConsumableFilter>("all");
	const [sort, setSort] = useState<ConsumableSort>("name");

	const stockByItem = useMemo(() => new Map(stockEntries), [stockEntries]);

	const counts = useMemo(() => {
		let habis = 0;
		let kritis = 0;
		let aman = 0;
		let inactive = 0;
		for (const r of rows) {
			if (!r.is_active) {
				inactive++;
				continue;
			}
			const s = stockByItem.get(r.id) ?? 0;
			const state = classifyStock(s, r.min_stock_alert);
			if (state === "habis" || state === "minus") habis++;
			else if (state === "kritis") kritis++;
			else aman++;
		}
		return { all: rows.length, habis, kritis, aman, inactive };
	}, [rows, stockByItem]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		let out = rows;
		if (q) {
			out = out.filter(
				(r) =>
					r.name.toLowerCase().includes(q) ||
					r.sku.toLowerCase().includes(q),
			);
		}
		out = out.filter((r) => {
			if (filter === "all") return true;
			if (filter === "inactive") return !r.is_active;
			if (!r.is_active) return false;
			const state = classifyStock(
				stockByItem.get(r.id) ?? 0,
				r.min_stock_alert,
			);
			if (filter === "habis") return state === "habis" || state === "minus";
			if (filter === "kritis") return state === "kritis";
			if (filter === "aman") return state === "aman";
			return true;
		});
		const stockOf = (r: ConsumableRow) => stockByItem.get(r.id) ?? 0;
		const valueOf = (r: ConsumableRow) =>
			stockOf(r) * (r.purchase_price_avg ?? 0);
		const urgencyOf = (r: ConsumableRow) => {
			const s = stockOf(r);
			if (s < 0) return -1000; // most urgent
			if (s === 0) return -100;
			if (r.min_stock_alert > 0) return s - r.min_stock_alert;
			return 1_000_000; // healthy with no alert set → low urgency
		};
		out = [...out].sort((a, b) => {
			if (sort === "stock-low") return stockOf(a) - stockOf(b);
			if (sort === "stock-high") return stockOf(b) - stockOf(a);
			if (sort === "value-high") return valueOf(b) - valueOf(a);
			if (sort === "alert-urgent") return urgencyOf(a) - urgencyOf(b);
			return a.name.localeCompare(b.name);
		});
		return out;
	}, [rows, stockByItem, query, filter, sort]);

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

	const columns: ResponsiveTableColumn<ConsumableRow>[] = [
		{
			key: "name",
			header: "Item",
			render: (r) => {
				const state = classifyStock(
					stockByItem.get(r.id) ?? 0,
					r.min_stock_alert,
				);
				return (
					<div className="space-y-0.5">
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="font-medium text-foreground">{r.name}</span>
							{r.is_active ? (
								<StockStateBadge state={state} />
							) : (
								<Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
									Inactive
								</Badge>
							)}
						</div>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular text-[10px] text-muted-foreground">
							<span>{r.sku}</span>
							<span className="text-muted-foreground/40">·</span>
							<span>{r.unit}</span>
							{r.min_stock_alert > 0 && (
								<>
									<span className="text-muted-foreground/40">·</span>
									<span>min {r.min_stock_alert}</span>
								</>
							)}
						</div>
					</div>
				);
			},
		},
		{
			key: "stock",
			header: "Stok",
			align: "right",
			render: (r) => {
				const stock = stockByItem.get(r.id) ?? 0;
				const state = classifyStock(stock, r.min_stock_alert);
				const display = formatStockDisplay(stock, r.unit, r.unit_conversion);
				const primaryTone =
					state === "minus"
						? "text-rose-600 dark:text-rose-400"
						: state === "habis"
							? "text-rose-500"
							: state === "kritis"
								? "text-amber-600 dark:text-amber-400"
								: "text-foreground";
				return (
					<div className="flex flex-col items-end gap-1">
						<div className={`tabular text-base font-semibold ${primaryTone}`}>
							{display.primary}
							<span className="ml-1 text-[11px] font-normal text-muted-foreground/80">
								{display.primaryUnit}
							</span>
						</div>
						{display.breakdown.length > 0 && (
							<div className="flex flex-wrap items-center justify-end gap-1">
								{display.breakdown.map((b) => (
									<span
										key={b.abbr}
										className="bg-surface-3 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] tabular text-muted-foreground"
										title={`Kapasitas maksimal ${b.value.toLocaleString("id-ID")} ${b.abbr}`}
									>
										<span className="font-semibold text-foreground/80">
											{b.formatted}
										</span>
										<span>{b.abbr}</span>
									</span>
								))}
							</div>
						)}
					</div>
				);
			},
		},
		{
			key: "avg_cost",
			header: "Avg Cost",
			align: "right",
			hideOnMobile: true,
			render: (r) =>
				r.purchase_price_avg ? (
					<span className="tabular text-fluid-caption text-muted-foreground">
						{formatRupiah(r.purchase_price_avg)} / {r.unit}
					</span>
				) : (
					<MutedDash label="Rp 0 / belum ada pembelian" />
				),
		},
		{
			key: "value",
			header: "Nilai HPP",
			align: "right",
			hideOnMobile: true,
			render: (r) => {
				const stock = stockByItem.get(r.id) ?? 0;
				const value = stock * (r.purchase_price_avg ?? 0);
				if (value === 0) return <MutedDash variant="dash" />;
				return (
					<span className="tabular text-fluid-caption font-medium text-foreground">
						{formatRupiah(value)}
					</span>
				);
			},
		},
		{
			key: "supplier",
			header: "Supplier Utama",
			hideOnMobile: true,
			render: (r) =>
				r.preferred_supplier_name ? (
					<span className="text-fluid-caption text-foreground">
						{r.preferred_supplier_name}
					</span>
				) : (
					<MutedDash />
				),
		},
		{
			key: "actions",
			header: "Aksi",
			align: "right",
			render: (r) => {
				const stock = stockByItem.get(r.id) ?? 0;
				return (
					<div className="flex items-center justify-end gap-1">
						<RestockDialog
							itemId={r.id}
							itemName={r.name}
							itemUnit={r.unit}
							unitConversion={r.unit_conversion}
							currentStock={stock}
							avgCost={r.purchase_price_avg ?? 0}
						/>
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

	const filterOptions: ReadonlyArray<{
		key: ConsumableFilter;
		label: string;
		count: number;
	}> = [
		{ key: "all", label: "Semua", count: counts.all },
		{ key: "habis", label: "Habis", count: counts.habis },
		{ key: "kritis", label: "Kritis", count: counts.kritis },
		{ key: "aman", label: "Aman", count: counts.aman },
		{ key: "inactive", label: "Inactive", count: counts.inactive },
	];

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<SearchInput
					value={query}
					onChange={setQuery}
					placeholder="Cari nama atau SKU..."
				/>
				<div className="flex flex-wrap items-center gap-2">
					<FilterChips
						value={filter}
						onChange={setFilter}
						options={filterOptions}
					/>
					<div className="w-44">
						<Combobox
							id="consumable-sort"
							value={sort}
							onValueChange={(v) =>
								setSort((v as ConsumableSort) ?? "name")
							}
							options={CONSUMABLE_SORT_OPTIONS.map((o) => ({
								value: o.value,
								label: o.label,
							}))}
							allowFreeText={false}
						/>
					</div>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada item yang cocok dengan filter ini.
				</div>
			) : (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
					<ResponsiveTable<ConsumableRow>
						keyExtractor={(r) => r.id}
						rows={filtered}
						columns={columns}
					/>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment
// ─────────────────────────────────────────────────────────────────────────────

export type EquipmentRow = {
	id: string;
	sku: string;
	name: string;
	purchase_price: number | null;
	condition: string | null;
	current_location: string | null;
	is_active: boolean;
	asset_number: string | null;
	serial_number: string | null;
	acquisition_type:
		| "new_commercial"
		| "used_commercial"
		| "owner_contribution"
		| null;
	useful_life_months: number | null;
	depreciation_start_date: string | null;
};

const ACQUISITION_LABEL: Record<string, { label: string; tone: string }> = {
	new_commercial: {
		label: "Baru",
		tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	used_commercial: {
		label: "Second",
		tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	owner_contribution: {
		label: "Modal Owner",
		tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	},
};

/** Months remaining sebelum useful life habis. Returns null kalau no data. */
function monthsRemaining(
	startIso: string | null,
	totalMonths: number | null,
): number | null {
	if (!startIso || !totalMonths) return null;
	const start = new Date(startIso);
	if (Number.isNaN(start.getTime())) return null;
	const now = new Date();
	const years = now.getFullYear() - start.getFullYear();
	const months = now.getMonth() - start.getMonth();
	const elapsed = Math.max(0, years * 12 + months);
	return Math.max(0, totalMonths - elapsed);
}

/**
 * Aggregate equipment rows by normalized name (1 row per model). Used to
 * count "berapa unit per model" — mis. 3 Kamera Canon 700D, 2 Printer DNP.
 */
type EquipmentGroup = {
	key: string; // normalized name
	name: string; // first occurrence's name for display
	units: EquipmentRow[];
	count: number;
	activeCount: number;
	acquisitionMix: Set<string>;
	totalPrice: number;
	statusSummary: Array<{ label: string; count: number; tone: string }>;
	avgRemainingMonths: number | null;
	avgTotalMonths: number | null;
};

/** Status bucket per unit — gabungan kondisi + lokasi yg actionable. */
function classifyAssetStatus(
	condition: string | null,
	location: string | null,
	isActive: boolean,
): { label: string; tone: string } {
	if (!isActive) {
		return {
			label: "Inactive",
			tone: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
		};
	}
	if (condition === "damaged") {
		return {
			label: "Rusak",
			tone: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
		};
	}
	if (condition === "lost" || location === "lost") {
		return {
			label: "Hilang",
			tone: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300",
		};
	}
	if (condition === "service" || location === "service_center") {
		return {
			label: "Servis",
			tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
		};
	}
	if (location === "event") {
		return {
			label: "On-Event",
			tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
		};
	}
	if (location === "crew_carry") {
		return {
			label: "Dibawa Crew",
			tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
		};
	}
	// Default: normal + gudang_pusat (atau lokasi null)
	return {
		label: "Tersedia",
		tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	};
}

function aggregateEquipment(rows: EquipmentRow[]): EquipmentGroup[] {
	const groups = new Map<string, EquipmentGroup>();
	for (const r of rows) {
		const key = r.name.trim().toLowerCase();
		if (!groups.has(key)) {
			groups.set(key, {
				key,
				name: r.name.trim(),
				units: [],
				count: 0,
				activeCount: 0,
				acquisitionMix: new Set(),
				totalPrice: 0,
				statusSummary: [],
				avgRemainingMonths: null,
				avgTotalMonths: null,
			});
		}
		const g = groups.get(key)!;
		g.units.push(r);
		g.count++;
		if (r.is_active) g.activeCount++;
		if (r.acquisition_type) g.acquisitionMix.add(r.acquisition_type);
		g.totalPrice += r.purchase_price ?? 0;
	}

	// Build status summary + avg remaining months per group
	for (const g of groups.values()) {
		const statusCounts = new Map<
			string,
			{ count: number; tone: string }
		>();
		let remainingTotal = 0;
		let remainingCount = 0;
		let totalMonthsAcc = 0;
		let totalMonthsCount = 0;

		for (const u of g.units) {
			const s = classifyAssetStatus(
				u.condition,
				u.current_location,
				u.is_active,
			);
			const existing = statusCounts.get(s.label);
			if (existing) existing.count++;
			else statusCounts.set(s.label, { count: 1, tone: s.tone });

			const remaining = monthsRemaining(
				u.depreciation_start_date,
				u.useful_life_months,
			);
			if (remaining !== null && u.useful_life_months) {
				remainingTotal += remaining;
				remainingCount++;
				totalMonthsAcc += u.useful_life_months;
				totalMonthsCount++;
			}
		}

		g.statusSummary = Array.from(statusCounts.entries())
			.map(([label, v]) => ({ label, count: v.count, tone: v.tone }))
			.sort((a, b) => b.count - a.count);
		g.avgRemainingMonths =
			remainingCount > 0 ? Math.round(remainingTotal / remainingCount) : null;
		g.avgTotalMonths =
			totalMonthsCount > 0
				? Math.round(totalMonthsAcc / totalMonthsCount)
				: null;
	}

	return Array.from(groups.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

type EquipmentFilter = "all" | "normal" | "service" | "damaged" | "lost" | "inactive";

const EQUIPMENT_FILTER_OPTIONS: ReadonlyArray<{
	key: EquipmentFilter;
	label: string;
}> = [
	{ key: "all", label: "Semua" },
	{ key: "normal", label: "Normal" },
	{ key: "service", label: "Service" },
	{ key: "damaged", label: "Rusak" },
	{ key: "lost", label: "Hilang" },
	{ key: "inactive", label: "Inactive" },
];

function ConditionBadge({ condition }: { condition: string | null }) {
	if (!condition) return <span className="text-muted-foreground/40">—</span>;
	const cls =
		condition === "normal"
			? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
			: condition === "service"
				? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
				: condition === "damaged"
					? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
					: condition === "lost"
						? "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300"
						: "border-border-default bg-surface-3 text-muted-foreground";
	const label = EQUIPMENT_CONDITION_LABELS[condition] ?? condition;
	return (
		<Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${cls}`}>
			{label}
		</Badge>
	);
}

export function EquipmentTable({ rows }: { rows: EquipmentRow[] }) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<EquipmentFilter>("all");

	// Aggregate per model (group by normalized name) — sumber kebenaran view ini
	const allGroups = useMemo(() => aggregateEquipment(rows), [rows]);

	const counts = useMemo(() => {
		const out: Record<EquipmentFilter, number> = {
			all: allGroups.length,
			normal: 0,
			service: 0,
			damaged: 0,
			lost: 0,
			inactive: 0,
		};
		// Count group-level: a group counts toward a bucket if MAJORITY of its
		// active units fall in that bucket. Inactive bucket = group has all
		// units inactive.
		for (const g of allGroups) {
			if (g.activeCount === 0) {
				out.inactive++;
				continue;
			}
			const dominant = g.statusSummary[0]?.label ?? "";
			if (dominant === "Rusak") out.damaged++;
			else if (dominant === "Hilang") out.lost++;
			else if (dominant === "Servis") out.service++;
			else out.normal++;
		}
		return out;
	}, [allGroups]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		let out = allGroups;
		if (q) {
			out = out.filter(
				(g) =>
					g.name.toLowerCase().includes(q) ||
					g.units.some(
						(u) =>
							u.sku.toLowerCase().includes(q) ||
							u.serial_number?.toLowerCase().includes(q),
					),
			);
		}
		out = out.filter((g) => {
			if (filter === "all") return true;
			if (filter === "inactive") return g.activeCount === 0;
			const dominant = g.statusSummary[0]?.label ?? "";
			if (filter === "damaged") return dominant === "Rusak";
			if (filter === "lost") return dominant === "Hilang";
			if (filter === "service") return dominant === "Servis";
			return dominant === "Tersedia" || dominant === "On-Event";
		});
		return out;
	}, [allGroups, query, filter]);

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

	const columns: ResponsiveTableColumn<EquipmentGroup>[] = [
		{
			key: "name",
			header: "Asset",
			render: (g) => {
				// Show acquisition badges (collapsed when uniform, listed when mixed)
				const acqList = Array.from(g.acquisitionMix);
				const firstSku = g.units[0]?.sku ?? "";
				return (
					<div className="space-y-0.5">
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-sm font-semibold text-foreground">
								{g.name}
							</span>
							{acqList.length === 1 && ACQUISITION_LABEL[acqList[0]] && (
								<Badge
									variant="outline"
									className={`h-5 px-1.5 text-[10px] ${ACQUISITION_LABEL[acqList[0]].tone}`}
								>
									{ACQUISITION_LABEL[acqList[0]].label}
								</Badge>
							)}
							{acqList.length > 1 && (
								<Badge
									variant="outline"
									className="h-5 px-1.5 text-[10px] border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
								>
									Mix ({acqList.length} jenis)
								</Badge>
							)}
						</div>
						<div className="tabular text-[10px] text-foreground/40">
							{firstSku}
							{g.count > 1 && ` · +${g.count - 1} unit lain`}
						</div>
					</div>
				);
			},
		},
		{
			key: "qty",
			header: "Qty",
			align: "right",
			render: (g) => (
				<div className="text-right">
					<div className="tabular text-base font-semibold text-foreground">
						{g.count}
					</div>
					<div className="text-[10px] text-muted-foreground/80">
						{g.activeCount === g.count
							? "unit"
							: `${g.activeCount} aktif / ${g.count}`}
					</div>
				</div>
			),
		},
		{
			key: "status",
			header: "Status Operasional",
			render: (g) => (
				<div className="flex flex-wrap items-center gap-1">
					{g.statusSummary.map((s) => (
						<Badge
							key={s.label}
							variant="outline"
							className={`h-5 px-1.5 text-[10px] ${s.tone}`}
						>
							{s.count > 1 ? `${s.count} ` : ""}
							{s.label}
						</Badge>
					))}
				</div>
			),
		},
		{
			key: "total_price",
			header: "Total Nilai",
			align: "right",
			hideOnMobile: true,
			render: (g) => {
				if (g.totalPrice <= 0)
					return <MutedDash variant="dash" />;
				const isAllOwnerContrib =
					g.acquisitionMix.size === 1 &&
					g.acquisitionMix.has("owner_contribution");
				return (
					<div className="text-right">
						<span className="tabular text-sm font-medium text-foreground">
							{formatRupiah(g.totalPrice)}
						</span>
						{g.count > 1 && (
							<div className="text-[10px] text-muted-foreground/80">
								{formatRupiah(Math.round(g.totalPrice / g.count))} / unit
							</div>
						)}
						{isAllOwnerContrib && (
							<div className="text-[10px] text-muted-foreground italic">
								estimasi setoran
							</div>
						)}
					</div>
				);
			},
		},
		{
			key: "useful_life",
			header: "Sisa Masa Pakai",
			align: "right",
			hideOnMobile: true,
			render: (g) => {
				if (g.avgRemainingMonths === null || !g.avgTotalMonths) {
					return <MutedDash variant="dash" />;
				}
				return (
					<div className="text-right">
						<span className="tabular text-sm font-medium text-foreground">
							{g.avgRemainingMonths}{" "}
							<span className="text-muted-foreground font-normal">
								/ {g.avgTotalMonths} bln
							</span>
						</span>
						{g.count > 1 && (
							<div className="text-[10px] text-muted-foreground/80 italic">
								avg per unit
							</div>
						)}
					</div>
				);
			},
		},
		{
			key: "actions",
			header: "",
			align: "right",
			render: (g) => {
				const first = g.units[0];
				if (g.count === 1) {
					return (
						<div className="flex items-center justify-end gap-1">
							<EditItemLink id={first.id} label={first.name} />
							<ArchiveItemButton id={first.id} name={first.name} />
						</div>
					);
				}
				// Multi-unit: link ke asset register (financial view) yang per-unit
				return (
					<Link
						href="/warehouse/assets"
						className="text-primary hover:underline text-[11px] font-medium"
						title={`Buka Asset Register untuk lihat ${g.count} unit secara detail`}
					>
						{g.count} unit →
					</Link>
				);
			},
		},
	];

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<SearchInput
					value={query}
					onChange={setQuery}
					placeholder="Cari nama atau SKU..."
				/>
				<FilterChips
					value={filter}
					onChange={setFilter}
					options={EQUIPMENT_FILTER_OPTIONS.map((o) => ({
						...o,
						count: counts[o.key],
					}))}
				/>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada equipment yang cocok dengan filter ini.
				</div>
			) : (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
					<ResponsiveTable<EquipmentGroup>
						keyExtractor={(g) => g.key}
						rows={filtered}
						columns={columns}
					/>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Movements log
// ─────────────────────────────────────────────────────────────────────────────

export type MovementRow = {
	id: string;
	ref_id: string;
	item_id: string;
	direction: "in" | "out" | "adjustment";
	quantity: number;
	unit_cost: number | null;
	source: string;
	notes: string | null;
	created_at: string;
	performed_by_user: { full_name: string } | null;
	item: { name: string; sku: string; unit: string } | null;
	supplier: { name: string } | null;
};

const SOURCE_LABELS: Record<string, string> = {
	settlement: "Settlement",
	purchase: "Purchase",
	manual_adjust: "Manual",
	damage: "Damage",
	loss: "Loss",
	stock_take: "Stock Opname",
	transfer: "Transfer",
	rekap_consumption: "Rekap Approval",
};

type MovementDirFilter = "all" | "in" | "out" | "adjustment";

const MOVEMENT_DIR_OPTIONS: ReadonlyArray<{
	key: MovementDirFilter;
	label: string;
}> = [
	{ key: "all", label: "Semua" },
	{ key: "in", label: "Masuk" },
	{ key: "out", label: "Keluar" },
	{ key: "adjustment", label: "Koreksi" },
];

export function MovementsLog({
	rows,
	defaultFrom,
	defaultTo,
}: {
	rows: MovementRow[];
	defaultFrom?: string;
	defaultTo?: string;
}) {
	const [query, setQuery] = useState("");
	const [dirFilter, setDirFilter] = useState<MovementDirFilter>("all");
	const [sourceFilter, setSourceFilter] = useState<string>("all");

	const counts = useMemo(() => {
		const out: Record<MovementDirFilter, number> = {
			all: rows.length,
			in: 0,
			out: 0,
			adjustment: 0,
		};
		for (const r of rows) out[r.direction]++;
		return out;
	}, [rows]);

	const sourceOptions = useMemo(() => {
		const set = new Set<string>();
		for (const r of rows) set.add(r.source);
		return [
			{ value: "all", label: "Semua sumber" },
			...Array.from(set).map((s) => ({
				value: s,
				label: SOURCE_LABELS[s] ?? s,
			})),
		];
	}, [rows]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			if (dirFilter !== "all" && r.direction !== dirFilter) return false;
			if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
			if (!q) return true;
			return (
				r.ref_id.toLowerCase().includes(q) ||
				(r.item?.name ?? "").toLowerCase().includes(q) ||
				(r.item?.sku ?? "").toLowerCase().includes(q) ||
				(r.notes ?? "").toLowerCase().includes(q)
			);
		});
	}, [rows, query, dirFilter, sourceFilter]);

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
			key: "created_at",
			header: "Tanggal",
			render: (m) => (
				<div className="space-y-0.5">
					<div className="tabular text-fluid-caption font-medium text-foreground">
						{formatDateID(m.created_at)}
					</div>
					<div className="tabular text-[10px] text-muted-foreground">
						{m.ref_id}
					</div>
				</div>
			),
		},
		{
			key: "item",
			header: "Item",
			render: (m) => (
				<div className="space-y-0.5">
					<div className="font-medium text-foreground">
						{m.item?.name ?? "—"}
					</div>
					<div className="tabular text-[10px] text-muted-foreground">
						{m.item?.sku ?? "—"}
					</div>
				</div>
			),
		},
		{
			key: "direction",
			header: "Arah",
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
					{m.quantity.toLocaleString("id-ID", { maximumFractionDigits: 4 })}{" "}
					{m.item?.unit ?? ""}
				</span>
			),
		},
		{
			key: "nilai",
			header: "Nilai",
			align: "right",
			hideOnMobile: true,
			render: (m) => {
				if (!m.unit_cost || m.unit_cost === 0) {
					return <span className="text-muted-foreground/40">—</span>;
				}
				const value = m.quantity * m.unit_cost;
				return (
					<span
						className={`tabular text-fluid-caption font-medium ${
							m.direction === "in"
								? "text-emerald-600 dark:text-emerald-400"
								: m.direction === "out"
									? "text-rose-600 dark:text-rose-400"
									: "text-foreground"
						}`}
					>
						{m.direction === "in" ? "+" : m.direction === "out" ? "−" : ""}
						Rp {value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
					</span>
				);
			},
		},
		{
			key: "source",
			header: "Sumber",
			hideOnMobile: true,
			render: (m) => (
				<div className="space-y-0.5">
					<Badge
						variant="outline"
						className="h-5 px-1.5 text-[10px] text-muted-foreground"
					>
						{SOURCE_LABELS[m.source] ?? m.source}
					</Badge>
					{m.supplier && (
						<div className="text-[10px] text-muted-foreground/80">
							{m.supplier.name}
						</div>
					)}
				</div>
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
		<div className="space-y-3">
			<MovementsDateFilter
				defaultFrom={defaultFrom}
				defaultTo={defaultTo}
			/>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<SearchInput
					value={query}
					onChange={setQuery}
					placeholder="Cari ref, item, atau catatan..."
				/>
				<div className="flex flex-wrap items-center gap-2">
					<FilterChips
						value={dirFilter}
						onChange={setDirFilter}
						options={MOVEMENT_DIR_OPTIONS.map((o) => ({
							...o,
							count: counts[o.key],
						}))}
					/>
					<div className="w-40">
						<Combobox
							id="movement-source"
							value={sourceFilter}
							onValueChange={(v) => setSourceFilter(v ?? "all")}
							options={sourceOptions}
							allowFreeText={false}
						/>
					</div>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada mutasi yang cocok dengan filter ini.
				</div>
			) : (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
					<ResponsiveTable<MovementRow>
						keyExtractor={(m) => m.id}
						rows={filtered}
						columns={columns}
					/>
				</div>
			)}
		</div>
	);
}

function MovementsDateFilter({
	defaultFrom,
	defaultTo,
}: {
	defaultFrom?: string;
	defaultTo?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	function update(field: "from" | "to", value: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (value) params.set(field, value);
		else params.delete(field);
		params.set("tab", "movements");
		router.push(`${pathname}?${params.toString()}`);
	}

	function clear() {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("from");
		params.delete("to");
		params.set("tab", "movements");
		router.push(`${pathname}?${params.toString()}`);
	}

	const hasFilter = !!(defaultFrom || defaultTo);

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-surface-2 p-2 text-fluid-caption">
			<Calendar className="size-3.5 text-muted-foreground" />
			<span className="text-muted-foreground">Periode:</span>
			<input
				type="date"
				defaultValue={defaultFrom ?? ""}
				onChange={(e) => update("from", e.target.value)}
				className="h-8 rounded-md border border-border-default bg-surface-1 px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
			/>
			<span className="text-muted-foreground">→</span>
			<input
				type="date"
				defaultValue={defaultTo ?? ""}
				onChange={(e) => update("to", e.target.value)}
				className="h-8 rounded-md border border-border-default bg-surface-1 px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
			/>
			{hasFilter && (
				<button
					type="button"
					onClick={clear}
					className="press-down inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
				>
					Reset
				</button>
			)}
		</div>
	);
}
