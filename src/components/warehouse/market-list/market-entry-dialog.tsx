"use client";

import { Loader2, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { NumberField, TextareaField } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import {
	type SupplierPriceFormState,
	upsertSupplierPrice,
} from "@/lib/actions/suppliers";
import { formatRupiah } from "@/lib/format";
import {
	listUnitsByKind,
	normalizeConversion,
} from "@/lib/inventory/unit-conversion";
import type {
	MarketListEntry,
	MarketListItem,
	SupplierOption,
} from "./market-list-table";

export function MarketEntryDialog({
	open,
	onOpenChange,
	mode,
	item,
	entry,
	suppliers,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	item: MarketListItem;
	entry?: MarketListEntry;
	suppliers: SupplierOption[];
}) {
	const router = useRouter();
	const [state, formAction, pending] = useActionState<
		SupplierPriceFormState,
		FormData
	>(upsertSupplierPrice, undefined);

	const [supplierId, setSupplierId] = useState<string>(
		entry?.supplier_id ?? "",
	);
	const [packUnit, setPackUnit] = useState<string>(
		entry?.pack_unit ?? item.unit,
	);
	const [packPrice, setPackPrice] = useState<string>(
		entry ? String(entry.pack_price) : "",
	);
	const [packSize, setPackSize] = useState<string>(
		entry ? String(entry.pack_size) : "1",
	);
	const [isPrimary, setIsPrimary] = useState<boolean>(
		entry?.is_primary ?? false,
	);

	useEffect(() => {
		if (state?.success) {
			toast.success(
				mode === "create"
					? "Harga supplier ditambahkan"
					: "Perubahan disimpan",
				{
					description: `${item.name} · Avg cost auto-sync ke ${formatRupiah(Math.round(effective))} / ${item.unit}`,
					duration: 5000,
				},
			);
			// Use rAF supaya sonner toast frame ke-paint dulu sebelum modal
			// unmount + router refresh trigger re-render
			requestAnimationFrame(() => {
				onOpenChange(false);
				router.refresh();
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state?.success]);

	const formError = state?.errors?._form?.[0];
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	const conversionMap = useMemo(
		() => normalizeConversion(item.unit_conversion, item.unit),
		[item.unit_conversion, item.unit],
	);

	// Market List harga belanja → tampilkan purchase + base units dari conversion
	// item INI, lalu MERGE dengan canonical bulk units (Box/Pack/Roll/Pcs/Sheet/
	// Set/Bundle) supaya user tetap bisa pilih satuan lain walau item tidak punya
	// unit_conversion yang detail. Trigger sync_primary_to_master_cost akan
	// fallback ke pack_size sebagai base-qty kalau pack_unit nggak ada di
	// conversion map — math tetap benar.
	const packUnitOptions = useMemo(() => {
		const fromConversion = listUnitsByKind(conversionMap, "purchase", "base");
		const existing = new Set(
			fromConversion.map((o) => o.code.toLowerCase()),
		);
		const CANONICAL: ReadonlyArray<{ value: string; label: string }> = [
			{ value: "pcs", label: "Pcs" },
			{ value: "box", label: "Box" },
			{ value: "pack", label: "Pack" },
			{ value: "roll", label: "Roll" },
			{ value: "sheet", label: "Sheet" },
			{ value: "set", label: "Set" },
			{ value: "bundle", label: "Bundle" },
			{ value: "unit", label: "Unit" },
		];
		const fromMap = fromConversion.map(({ code, def }) => ({
			value: code,
			label: def.label || code,
		}));
		const extras = CANONICAL.filter((u) => !existing.has(u.value));
		return [...fromMap, ...extras];
	}, [conversionMap]);

	const priceNum = Number(packPrice);
	const sizeNum = Number(packSize);
	// Semantic Model A: pack_size = berapa BASE unit dalam 1 pack purchased
	// (e.g., "1 Box berisi 2 Roll" → pack_size=2). Effective = price / size.
	// MATCH server trigger sync_primary_to_master_cost (v2 fallback branch).
	// Don't call toBase here — itu menggandakan multiplier dan menghasilkan
	// preview yang tidak match dengan actual saved value.
	const baseQty = Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : 0;
	const effective =
		Number.isFinite(priceNum) && baseQty > 0 ? priceNum / baseQty : 0;

	const willSyncMessage =
		isPrimary && effective > 0
			? `Master cost saat ini ${formatRupiah(item.purchase_price_avg)} / ${item.unit} → akan di-update ke ${formatRupiah(Math.round(effective))} / ${item.unit}`
			: null;

	// Capitalize bulk unit untuk label dinamis ("Pack" → "Harga per Pack").
	const satuanBeliLabel =
		packUnit.charAt(0).toUpperCase() + packUnit.slice(1);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
			>
				<DialogHeader className="shrink-0 border-b border-border-default/50 bg-surface-1 px-8 pt-6 pb-5">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0 flex-1">
							<DialogTitle className="text-[18px] font-bold tracking-tight text-foreground">
								{mode === "create"
									? "Tambah Harga Supplier"
									: "Edit Harga Supplier"}
							</DialogTitle>
							<DialogDescription className="mt-1.5 text-[12px] text-muted-foreground/80">
								<span className="font-medium text-foreground">{item.name}</span> ·
								catat harga belanja dari supplier. Tag Primary untuk auto-sync
								master cost.
							</DialogDescription>
						</div>
						<DialogClose
							aria-label="Tutup"
							className="press-down inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
						>
							<X className="size-4" />
						</DialogClose>
					</div>
				</DialogHeader>

				<form
					action={formAction}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
					{formError && (
						<div className="rounded-lg bg-destructive/10 p-3.5 ring-1 ring-destructive/30">
							<p className="text-sm font-medium text-destructive">
								{formError}
							</p>
						</div>
					)}

					{entry?.id && <input type="hidden" name="id" value={entry.id} />}
					<input type="hidden" name="item_id" value={item.id} />

					{/* Row 1 — Supplier (full width) */}
					<Field
						label="Supplier"
						name="supplier_id"
						error={err("supplier_id")}
						required
					>
						<Combobox
							id="supplier_id"
							value={supplierId}
							onValueChange={(v) => setSupplierId(v ?? "")}
							options={suppliers.map((s) => ({
								value: s.id,
								label: s.name,
							}))}
							placeholder="— pilih supplier —"
							allowFreeText={false}
						/>
						<input type="hidden" name="supplier_id" value={supplierId} />
					</Field>

					{/* Row 2 — Satuan Beli + Isi per Satuan Beli */}
					<div className="grid gap-5 sm:grid-cols-2">
						<Field
							label="Satuan Beli (Bulk)"
							name="pack_unit"
							error={err("pack_unit")}
							required
							hint="Box, Pack, Roll, atau unit dasar item"
						>
							<Combobox
								id="pack_unit"
								value={packUnit}
								onValueChange={(v) => setPackUnit(v ?? item.unit)}
								options={packUnitOptions}
								allowFreeText={false}
							/>
							<input type="hidden" name="pack_unit" value={packUnit} />
						</Field>

						<Field
							label={`Isi per ${satuanBeliLabel}`}
							name="pack_size"
							error={err("pack_size")}
							required
							hint={
								packUnit === item.unit
									? `Isi 1 kalau beli per ${item.unit}, atau qty kalau bulk`
									: `Berapa ${item.unit} dalam 1 ${satuanBeliLabel}?`
							}
						>
							<NumberField
								id="pack_size"
								name="pack_size"
								min={1}
								step={1}
								required
								defaultValue={packSize}
								onChange={(e) => setPackSize(e.target.value)}
								placeholder={packUnit === item.unit ? "1" : "1000"}
							/>
						</Field>
					</div>

					{/* Row 3 — Harga per {satuan} (full width) */}
					<Field
						label={`Harga per ${satuanBeliLabel} (Rp)`}
						name="pack_price"
						error={err("pack_price")}
						required
					>
						<NumberField
							id="pack_price"
							name="pack_price"
							min={0}
							step={1}
							required
							defaultValue={packPrice}
							onChange={(e) => setPackPrice(e.target.value)}
							placeholder="0"
						/>
					</Field>

					{/* Row 4 — Live Effective Cost preview */}
					<div className="rounded-lg border border-border-default/60 bg-surface-1/80 px-4 py-3.5">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
									Estimasi Harga per {item.unit} (Effective Cost)
								</div>
								<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
									Auto-hitung dari Harga ÷ Isi. Cek angka sebelum simpan.
								</p>
							</div>
							<div
								className={`whitespace-nowrap tabular text-right ${
									effective > 0
										? "text-emerald-600 dark:text-emerald-400"
										: "text-muted-foreground/40"
								}`}
							>
								<span className="text-[10px] mr-0.5 font-normal text-muted-foreground/60">
									≈
								</span>
								<span className="text-xl font-bold">
									{effective > 0
										? formatRupiah(Math.round(effective))
										: "Rp —"}
								</span>
								<span className="ml-1 text-[11px] font-normal text-muted-foreground">
									/ {item.unit}
								</span>
							</div>
						</div>
					</div>

					{/* Row 5 — Catatan */}
					<Field
						label="Catatan"
						name="notes"
						error={err("notes")}
						hint="opsional — promo, lebaran, kontrak"
					>
						<TextareaField
							id="notes"
							name="notes"
							rows={2}
							maxLength={300}
							defaultValue={entry?.notes ?? ""}
						/>
					</Field>

					{/* Row 6 — Primary toggle */}
					<label
						className={`block cursor-pointer rounded-lg p-3.5 transition-all ${
							isPrimary
								? "bg-amber-500/10 ring-1 ring-amber-500/30"
								: "bg-surface-1 ring-1 ring-border-default/60 hover:bg-surface-2"
						}`}
					>
						<div className="flex items-start gap-3">
							<input
								type="checkbox"
								name="is_primary"
								value="true"
								checked={isPrimary}
								onChange={(e) => setIsPrimary(e.target.checked)}
								className="mt-0.5 size-4 accent-amber-500"
							/>
							<div className="min-w-0 space-y-0.5">
								<div className="inline-flex items-center gap-1.5 text-sm font-medium">
									<Star
										className={`size-3.5 ${
											isPrimary
												? "fill-amber-500 text-amber-500"
												: "text-muted-foreground"
										}`}
									/>
									Set sebagai Supplier Utama (Primary)
								</div>
								<p className="text-[11px] leading-relaxed text-muted-foreground">
									Hanya 1 Primary per item. Master cost auto-sync ke effective
									cost di atas.
								</p>
								{willSyncMessage && (
									<p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
										{willSyncMessage}
									</p>
								)}
							</div>
						</div>
					</label>
					</div>

					<DialogFooter className="shrink-0 flex items-center justify-end gap-3 border-t border-border-default/50 bg-surface-1/60 px-8 py-5 sm:py-6">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							disabled={pending}
							className="press-down inline-flex h-10 items-center rounded-md px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-40"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending || !supplierId}
							className="press-down inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
						>
							{pending && (
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
							)}
							{pending
								? "Menyimpan…"
								: mode === "create"
									? "Simpan"
									: "Simpan Perubahan"}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	name,
	hint,
	error,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-[13px] font-medium text-foreground">
				{label}
				{required && <span className="ml-0.5 text-primary">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : hint ? (
				<p className="text-xs text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
