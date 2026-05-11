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
	Plus,
	Printer,
	Sparkles,
	Trash2,
	Wallet,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import {
	deleteRekapMappingOverride,
	updateRekapMapping,
} from "@/lib/actions/rekap-mapping";
import {
	REKAP_FIELD_HINTS,
	REKAP_FIELD_LABELS,
	type RekapField,
} from "@/lib/rekap-mapping/types";

interface RekapMappingRow {
	rekap_field: RekapField;
	frame_size: string;
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

const FRAME_OPTIONS = [
	{ value: "", label: "Default (semua size)" },
	{ value: "4R", label: "4R" },
	{ value: "2R", label: "2R" },
	{ value: "polaroid", label: "Polaroid" },
	{ value: "none", label: "None" },
] as const;

function formatRupiah(n: number): string {
	return `Rp ${n.toLocaleString("id-ID")}`;
}

function frameLabel(size: string) {
	const f = FRAME_OPTIONS.find((o) => o.value === size);
	return f ? f.label : size || "Default";
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

	// Group mappings by rekap_field
	const grouped = useMemo(() => {
		const m = new Map<RekapField, RekapMappingRow[]>();
		for (const row of mappings) {
			const arr = m.get(row.rekap_field) ?? [];
			arr.push(row);
			m.set(row.rekap_field, arr);
		}
		// Sort each group's rows: '' (default) first, then by frame_size alphabetically
		for (const arr of m.values()) {
			arr.sort((a, b) => {
				if (a.frame_size === "" && b.frame_size !== "") return -1;
				if (b.frame_size === "" && a.frame_size !== "") return 1;
				return a.frame_size.localeCompare(b.frame_size);
			});
		}
		return m;
	}, [mappings]);

	return (
		<div className="space-y-4">
			{Array.from(grouped.entries()).map(([field, rows]) => (
				<FieldGroup
					key={field}
					field={field}
					rows={rows}
					items={items}
					itemSelectOptions={itemSelectOptions}
				/>
			))}
		</div>
	);
}

function FieldGroup({
	field,
	rows,
	items,
	itemSelectOptions,
}: {
	field: RekapField;
	rows: RekapMappingRow[];
	items: ItemOption[];
	itemSelectOptions: Array<{ value: string; label: string }>;
}) {
	const Icon = FIELD_ICON[field];
	const usedSizes = new Set(rows.map((r) => r.frame_size));
	const availableSizes = FRAME_OPTIONS.filter(
		(o) => !usedSizes.has(o.value),
	);
	const [showAdd, setShowAdd] = useState(false);
	const [newSize, setNewSize] = useState<string>(
		availableSizes[0]?.value ?? "",
	);

	function startAdd() {
		const firstAvail = availableSizes[0]?.value;
		if (firstAvail !== undefined) {
			setNewSize(firstAvail);
			setShowAdd(true);
		}
	}

	const hasDefault = rows.some((r) => r.frame_size === "");

	return (
		<section className="rounded-2xl border border-border-default bg-surface-2 p-5">
			<header className="mb-3 flex items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					<div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
						<Icon className="size-5" aria-hidden />
					</div>
					<div>
						<h3 className="text-fluid-h3 font-semibold tracking-tight">
							{REKAP_FIELD_LABELS[field]}
						</h3>
						<p className="font-mono text-[10px] text-muted-foreground/80">
							{field}
						</p>
						<p className="mt-1 max-w-md text-fluid-caption text-muted-foreground">
							{REKAP_FIELD_HINTS[field]}
						</p>
					</div>
				</div>
				{availableSizes.length > 0 && !showAdd && (
					<button
						type="button"
						onClick={startAdd}
						className="press-down inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
					>
						<Plus className="size-3" />
						Override per size
					</button>
				)}
			</header>

			{!hasDefault && (
				<div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
					<AlertTriangle className="mt-0.5 size-3 shrink-0" />
					<p>
						Tidak ada default mapping. Field ini akan di-skip kecuali ada
						override yang match dengan frame_size event.
					</p>
				</div>
			)}

			<div className="space-y-2">
				{rows.map((row) => (
					<MappingRow
						key={`${row.rekap_field}-${row.frame_size}`}
						row={row}
						items={items}
						itemSelectOptions={itemSelectOptions}
					/>
				))}
				{showAdd && (
					<NewOverrideRow
						field={field}
						defaultFrameSize={newSize}
						availableSizes={availableSizes}
						items={items}
						itemSelectOptions={itemSelectOptions}
						onCancel={() => setShowAdd(false)}
					/>
				)}
			</div>
		</section>
	);
}

function MappingRow({
	row,
	items,
	itemSelectOptions,
}: {
	row: RekapMappingRow;
	items: ItemOption[];
	itemSelectOptions: Array<{ value: string; label: string }>;
}) {
	const [itemId, setItemId] = useState<string>(row.item_id ?? "");
	const [qtyPerUnit, setQtyPerUnit] = useState<string>(
		String(row.qty_per_unit),
	);
	const [isActive, setIsActive] = useState<boolean>(row.is_active);
	const [pending, startTransition] = useTransition();
	const [savedTick, setSavedTick] = useState(false);

	const item = items.find((i) => i.id === itemId) ?? null;
	const qtyNum = Math.max(0.0001, Number(qtyPerUnit) || 1);
	const avgCost = item?.purchase_price_avg ?? 0;
	const perRekapUnit = qtyNum * avgCost;

	const dirty =
		itemId !== (row.item_id ?? "") ||
		Number(qtyPerUnit) !== row.qty_per_unit ||
		isActive !== row.is_active;

	const mapped = itemId !== "" && Boolean(item);
	const isDefault = row.frame_size === "";

	function handleSave() {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("rekap_field", row.rekap_field);
			fd.set("frame_size", row.frame_size);
			fd.set("item_id", itemId);
			fd.set("qty_per_unit", qtyPerUnit);
			fd.set("is_active", isActive ? "true" : "false");
			const res = await updateRekapMapping(fd);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					`${REKAP_FIELD_LABELS[row.rekap_field]} · ${frameLabel(row.frame_size)} disimpan`,
				);
				setSavedTick(true);
				setTimeout(() => setSavedTick(false), 1500);
			}
		});
	}

	function handleDelete() {
		if (isDefault) return;
		if (!confirm(`Hapus override ${frameLabel(row.frame_size)}?`)) return;
		startTransition(async () => {
			const res = await deleteRekapMappingOverride(
				row.rekap_field,
				row.frame_size,
			);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(`Override ${frameLabel(row.frame_size)} dihapus`);
			}
		});
	}

	return (
		<div
			className={`flex flex-col gap-3 rounded-lg border bg-surface-3 p-3 transition-all sm:flex-row sm:items-center ${
				dirty
					? "border-primary/40 shadow-glow-crimson/30 dark:shadow-glow-crimson"
					: "border-border-default"
			}`}
		>
			{/* Frame size badge */}
			<div className="flex shrink-0 items-center gap-2">
				<Badge
					variant="outline"
					className={`min-w-[80px] justify-center ${
						isDefault
							? "border-border-default bg-surface-2"
							: "border-primary/30 bg-primary/10 text-primary"
					}`}
				>
					{frameLabel(row.frame_size)}
				</Badge>
				<button
					type="button"
					onClick={() => setIsActive((v) => !v)}
					aria-pressed={isActive}
					title={isActive ? "Aktif" : "Off"}
					className={`inline-flex h-6 items-center rounded-md border px-1.5 text-[10px] font-medium transition-colors ${
						isActive
							? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							: "border-border-default bg-surface-2 text-muted-foreground"
					}`}
				>
					{isActive ? (
						<Eye className="mr-0.5 size-2.5" />
					) : (
						<EyeOff className="mr-0.5 size-2.5" />
					)}
				</button>
			</div>

			{/* Item picker */}
			<div className="flex-1 min-w-0">
				<NativeSelect
					value={itemId}
					onValueChange={setItemId}
					options={itemSelectOptions}
					placeholder="— pilih item —"
					aria-label={`Map ${row.rekap_field} ke item`}
					triggerClassName="w-full h-9"
				/>
			</div>

			{/* qty_per_unit */}
			<div className="flex shrink-0 items-center gap-1">
				<label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
					Qty/Unit
				</label>
				<input
					type="number"
					min={0.0001}
					step={0.1}
					value={qtyPerUnit}
					onChange={(e) => setQtyPerUnit(e.target.value)}
					className="tabular h-9 w-20 rounded-md border border-border-default bg-background px-2 text-center text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
			</div>

			{/* HPP preview */}
			{mapped && (
				<div className="shrink-0 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-right">
					<p className="text-[9px] font-semibold uppercase tracking-wider text-primary/80">
						HPP/unit
					</p>
					<p className="tabular text-[11px] font-semibold text-foreground">
						{formatRupiah(Math.round(perRekapUnit))}
					</p>
				</div>
			)}

			{/* Action buttons */}
			<div className="flex shrink-0 items-center gap-1.5">
				{savedTick && (
					<Badge
						variant="outline"
						className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
					>
						<Check className="mr-0.5 size-2.5" />
						Saved
					</Badge>
				)}
				{!savedTick && !mapped && isActive && (
					<Badge
						variant="outline"
						className="h-5 gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-amber-700 dark:text-amber-300"
					>
						<AlertTriangle className="size-2.5" />
						Belum dipetakan
					</Badge>
				)}
				{!savedTick && mapped && isActive && (
					<Sparkles className="size-3 text-emerald-500 dark:text-emerald-400" />
				)}
				<button
					type="button"
					onClick={handleSave}
					disabled={!dirty || pending}
					className="press-down inline-flex h-8 items-center rounded-md bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending ? (
						<>
							<Wallet className="mr-1 size-3 animate-pulse" />
							Saving
						</>
					) : (
						"Save"
					)}
				</button>
				{!isDefault && (
					<button
						type="button"
						onClick={handleDelete}
						disabled={pending}
						title="Hapus override ini"
						className="press-down inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-surface-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
					>
						<Trash2 className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}

function NewOverrideRow({
	field,
	defaultFrameSize,
	availableSizes,
	items,
	itemSelectOptions,
	onCancel,
}: {
	field: RekapField;
	defaultFrameSize: string;
	availableSizes: readonly { value: string; label: string }[];
	items: ItemOption[];
	itemSelectOptions: Array<{ value: string; label: string }>;
	onCancel: () => void;
}) {
	const [frameSize, setFrameSize] = useState<string>(defaultFrameSize);
	const [itemId, setItemId] = useState<string>("");
	const [qtyPerUnit, setQtyPerUnit] = useState<string>("1");
	const [pending, startTransition] = useTransition();

	const item = items.find((i) => i.id === itemId) ?? null;
	const canSave = itemId !== "" && Boolean(item);

	function handleAdd() {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("rekap_field", field);
			fd.set("frame_size", frameSize);
			fd.set("item_id", itemId);
			fd.set("qty_per_unit", qtyPerUnit);
			fd.set("is_active", "true");
			const res = await updateRekapMapping(fd);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					`Override ${frameLabel(frameSize)} dibuat untuk ${REKAP_FIELD_LABELS[field]}`,
				);
				onCancel();
			}
		});
	}

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center">
			<NativeSelect
				value={frameSize}
				onValueChange={setFrameSize}
				options={availableSizes.map((o) => ({ value: o.value, label: o.label }))}
				triggerClassName="h-9 w-32"
				aria-label="Frame size override"
			/>
			<div className="flex-1 min-w-0">
				<NativeSelect
					value={itemId}
					onValueChange={setItemId}
					options={itemSelectOptions}
					placeholder="— pilih item —"
					triggerClassName="w-full h-9"
				/>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
					Qty/Unit
				</label>
				<input
					type="number"
					min={0.0001}
					step={0.1}
					value={qtyPerUnit}
					onChange={(e) => setQtyPerUnit(e.target.value)}
					className="tabular h-9 w-20 rounded-md border border-border-default bg-background px-2 text-center text-sm"
				/>
			</div>
			<div className="flex shrink-0 gap-1.5">
				<button
					type="button"
					onClick={handleAdd}
					disabled={!canSave || pending}
					className="press-down inline-flex h-8 items-center rounded-md bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{pending ? "Saving" : "Add"}
				</button>
				<button
					type="button"
					onClick={onCancel}
					disabled={pending}
					className="press-down inline-flex h-8 items-center rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium hover:bg-muted"
				>
					Batal
				</button>
			</div>
		</div>
	);
}
