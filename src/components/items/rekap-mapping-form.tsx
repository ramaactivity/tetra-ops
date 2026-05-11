"use client";

import {
	AlertTriangle,
	Camera,
	Check,
	Eye,
	EyeOff,
	Film,
	Image as ImageIcon,
	type LucideIcon,
	Package,
	Palette,
	Printer,
	Sparkles,
	Wallet,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { updateRekapMapping } from "@/lib/actions/rekap-mapping";
import {
	REKAP_FIELD_HINTS,
	REKAP_FIELD_LABELS,
	type RekapField,
} from "@/lib/rekap-mapping/types";

interface RekapMappingRow {
	rekap_field: RekapField;
	item_id: string | null;
	qty_per_unit: number;
	is_active: boolean;
}

interface ItemOption {
	id: string;
	sku: string;
	name: string;
	purchase_price_avg: number | null;
}

interface Props {
	mappings: RekapMappingRow[];
	items: ItemOption[];
}

const FIELD_ICON: Record<RekapField, LucideIcon> = {
	cetak_total: Printer,
	media_set_used: Film,
	sleeve_used: ImageIcon,
	flashdisk_used: Package,
	pouch_used: Package,
	photomagnet_used: Camera,
	keychain_used: Palette,
};

function formatRupiah(n: number): string {
	return `Rp ${n.toLocaleString("id-ID")}`;
}

export function RekapMappingForm({ mappings, items }: Props) {
	const itemSelectOptions = useMemo(
		() => [
			{ value: "", label: "— pilih item —" },
			...items.map((i) => ({
				value: i.id,
				label: `${i.sku} — ${i.name}`,
			})),
		],
		[items],
	);

	return (
		<div className="grid gap-3 lg:grid-cols-2">
			{mappings.map((row) => (
				<MappingCard
					key={row.rekap_field}
					row={row}
					items={items}
					itemSelectOptions={itemSelectOptions}
				/>
			))}
		</div>
	);
}

function MappingCard({
	row,
	items,
	itemSelectOptions,
}: {
	row: RekapMappingRow;
	items: ItemOption[];
	itemSelectOptions: Array<{ value: string; label: string }>;
}) {
	const [itemId, setItemId] = useState<string>(row.item_id ?? "");
	const [qtyPerUnit, setQtyPerUnit] = useState<string>(String(row.qty_per_unit));
	const [isActive, setIsActive] = useState<boolean>(row.is_active);
	const [pending, startTransition] = useTransition();
	const [savedTick, setSavedTick] = useState(false);

	const Icon = FIELD_ICON[row.rekap_field];
	const item = items.find((i) => i.id === itemId) ?? null;
	const qtyNum = Math.max(1, Number(qtyPerUnit) || 1);
	const avgCost = item?.purchase_price_avg ?? 0;
	const perRekapUnit = qtyNum * avgCost;

	const dirty =
		itemId !== (row.item_id ?? "") ||
		Number(qtyPerUnit) !== row.qty_per_unit ||
		isActive !== row.is_active;

	const mapped = itemId !== "" && Boolean(item);

	function handleSave() {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("rekap_field", row.rekap_field);
			fd.set("item_id", itemId);
			fd.set("qty_per_unit", qtyPerUnit);
			fd.set("is_active", isActive ? "true" : "false");
			const res = await updateRekapMapping(fd);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(`${REKAP_FIELD_LABELS[row.rekap_field]} disimpan`);
				setSavedTick(true);
				setTimeout(() => setSavedTick(false), 1500);
			}
		});
	}

	return (
		<section
			className={`flex flex-col gap-3 rounded-xl border bg-surface-2 p-4 transition-shadow ${
				dirty
					? "border-primary/40 shadow-glow-crimson/30 dark:shadow-glow-crimson"
					: "border-border-default"
			}`}
		>
			{/* Header: field name + active toggle */}
			<header className="flex items-start justify-between gap-3">
				<div className="flex items-start gap-2.5">
					<div
						className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${
							isActive
								? "bg-primary/10 text-primary"
								: "bg-surface-3 text-muted-foreground"
						}`}
					>
						<Icon className="size-4" aria-hidden />
					</div>
					<div className="space-y-0.5">
						<h3 className="text-fluid-body font-semibold tracking-tight">
							{REKAP_FIELD_LABELS[row.rekap_field]}
						</h3>
						<p className="tabular text-[10px] text-muted-foreground/80">
							{row.rekap_field}
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() => setIsActive((v) => !v)}
					aria-pressed={isActive}
					title={isActive ? "Klik untuk nonaktifkan" : "Klik untuk aktifkan"}
					className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors ${
						isActive
							? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							: "border-border-default bg-surface-3 text-muted-foreground"
					}`}
				>
					{isActive ? (
						<Eye className="size-3" />
					) : (
						<EyeOff className="size-3" />
					)}
					{isActive ? "Aktif" : "Off"}
				</button>
			</header>

			{/* Hint text */}
			<p className="text-[11px] text-muted-foreground/80 italic">
				{REKAP_FIELD_HINTS[row.rekap_field]}
			</p>

			{/* Item picker */}
			<div className="space-y-1">
				<label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
					Mapped Item
				</label>
				<NativeSelect
					value={itemId}
					onValueChange={setItemId}
					options={itemSelectOptions}
					placeholder="— pilih item —"
					aria-label={`Map ${row.rekap_field} ke item inventory`}
					triggerClassName="w-full"
				/>
			</div>

			{/* Selected item summary */}
			{item ? (
				<div className="flex items-baseline justify-between gap-2 rounded-md border border-border-default/60 bg-surface-3/50 px-3 py-2">
					<div className="space-y-0.5 min-w-0">
						<p className="truncate text-fluid-caption font-medium text-foreground">
							{item.name}
						</p>
						<p className="tabular text-[10px] text-muted-foreground">
							{item.sku}
						</p>
					</div>
					<div className="text-right">
						<p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
							Avg Cost
						</p>
						<p className="tabular text-fluid-caption font-semibold text-foreground">
							{formatRupiah(avgCost)}
						</p>
					</div>
				</div>
			) : null}

			{/* qty_per_unit + preview */}
			<div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
				<div className="space-y-1">
					<label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Qty / Unit
					</label>
					<input
						type="number"
						min={1}
						value={qtyPerUnit}
						onChange={(e) => setQtyPerUnit(e.target.value)}
						className="h-9 w-24 rounded-md border border-border-default bg-background px-2.5 text-center text-sm tabular focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				</div>
				{item ? (
					<div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
						<p className="text-[9px] font-semibold uppercase tracking-wider text-primary/80">
							Preview HPP per Unit Rekap
						</p>
						<p className="tabular text-fluid-caption text-foreground">
							{qtyNum}× × {formatRupiah(avgCost)} ={" "}
							<span className="font-semibold">
								{formatRupiah(perRekapUnit)}
							</span>
						</p>
					</div>
				) : (
					<div className="rounded-md border border-dashed border-border-default px-3 py-2 text-[10px] italic text-muted-foreground/80">
						Pilih item dulu buat lihat preview HPP.
					</div>
				)}
			</div>

			{/* Status + save */}
			<footer className="flex items-center justify-between gap-2 border-t border-border-default/40 pt-3">
				<div className="flex items-center gap-2 text-[10px]">
					{!isActive ? (
						<Badge
							variant="outline"
							className="h-5 gap-1 border-border-default bg-surface-3 px-1.5 text-muted-foreground"
						>
							Off
						</Badge>
					) : !mapped ? (
						<Badge
							variant="outline"
							className="h-5 gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-amber-700 dark:text-amber-300"
						>
							<AlertTriangle className="size-2.5" />
							Belum dipetakan
						</Badge>
					) : (
						<Badge
							variant="outline"
							className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-emerald-700 dark:text-emerald-300"
						>
							<Sparkles className="size-2.5" />
							Siap auto-deduct
						</Badge>
					)}
					{savedTick && (
						<Badge
							variant="outline"
							className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-emerald-700 dark:text-emerald-300"
						>
							<Check className="size-2.5" />
							Saved
						</Badge>
					)}
				</div>
				<button
					type="button"
					onClick={handleSave}
					disabled={!dirty || pending}
					className="press-down inline-flex h-8 items-center rounded-md bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending ? (
						<>
							<Wallet className="mr-1 size-3 animate-pulse" />
							Saving...
						</>
					) : (
						"Save"
					)}
				</button>
			</footer>
		</section>
	);
}
