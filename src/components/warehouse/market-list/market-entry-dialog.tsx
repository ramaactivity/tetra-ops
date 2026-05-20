"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import {
	Dialog,
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
				mode === "create" ? "Entry ditambahkan" : "Entry disimpan",
			);
			onOpenChange(false);
			router.refresh();
		}
	}, [state, mode, onOpenChange, router]);

	const formError = state?.errors?._form?.[0];
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	const packUnitOptions = item.unit_conversion
		? Object.keys(item.unit_conversion)
		: [item.unit];

	const priceNum = Number(packPrice);
	const sizeNum = Number(packSize);
	const conv = item.unit_conversion;
	let baseQty = sizeNum;
	if (packUnit !== item.unit && conv && conv[packUnit]) {
		baseQty = sizeNum * conv[packUnit];
	}
	const effective =
		Number.isFinite(priceNum) && Number.isFinite(sizeNum) && baseQty > 0
			? priceNum / baseQty
			: 0;

	const willSyncMessage =
		isPrimary && effective > 0
			? `Master cost ${item.name} sekarang = ${formatRupiah(item.purchase_price_avg)}/${item.unit} → akan di-update ke ${formatRupiah(Math.round(effective))} kalau disimpan`
			: null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Tambah Harga Supplier" : "Edit Harga Supplier"}
					</DialogTitle>
					<DialogDescription>
						{item.name} · catat harga belanja dari supplier. Tag Primary →
						auto-sync master cost.
					</DialogDescription>
				</DialogHeader>

				<form action={formAction} className="space-y-4">
					{formError && (
						<div className="rounded-md border border-destructive bg-destructive/10 p-3">
							<p className="text-sm font-medium text-destructive">
								{formError}
							</p>
						</div>
					)}

					{entry?.id && <input type="hidden" name="id" value={entry.id} />}
					<input type="hidden" name="item_id" value={item.id} />

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
							options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
							placeholder="— pilih supplier —"
							allowFreeText={false}
						/>
						<input type="hidden" name="supplier_id" value={supplierId} />
					</Field>

					<div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
						<Field
							label="Harga / pack (Rp)"
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
						<Field
							label="Pack size"
							name="pack_size"
							error={err("pack_size")}
							required
						>
							<NumberField
								id="pack_size"
								name="pack_size"
								min={0.0001}
								step={0.01}
								required
								defaultValue={packSize}
								onChange={(e) => setPackSize(e.target.value)}
								placeholder="1"
							/>
						</Field>
						<Field
							label="Unit"
							name="pack_unit"
							error={err("pack_unit")}
							required
						>
							<Combobox
								id="pack_unit"
								value={packUnit}
								onValueChange={(v) => setPackUnit(v ?? item.unit)}
								options={packUnitOptions.map((u) => ({
									value: u,
									label: u,
								}))}
								allowFreeText={false}
							/>
							<input type="hidden" name="pack_unit" value={packUnit} />
						</Field>
					</div>

					{effective > 0 && (
						<div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-fluid-caption">
							<div className="font-semibold text-sky-700 dark:text-sky-300">
								Effective cost = {formatRupiah(Math.round(effective))} /{" "}
								{item.unit}
							</div>
							{willSyncMessage && (
								<div className="mt-1 text-[11px] text-muted-foreground">
									{willSyncMessage}
								</div>
							)}
						</div>
					)}

					<label
						className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors ${
							isPrimary
								? "border-emerald-500/40 bg-emerald-500/10"
								: "border-border-default bg-surface-2"
						}`}
					>
						<input
							type="checkbox"
							name="is_primary"
							value="true"
							checked={isPrimary}
							onChange={(e) => setIsPrimary(e.target.checked)}
							className="mt-0.5 size-3.5"
						/>
						<div className="space-y-0.5">
							<div className="inline-flex items-center gap-1 text-sm font-medium">
								<Star
									className={`size-3.5 ${isPrimary ? "fill-emerald-500 text-emerald-500" : ""}`}
								/>
								Set sebagai supplier utama (Primary)
							</div>
							<div className="text-[11px] text-muted-foreground">
								Kalau dicentang, effective cost-nya akan otomatis update{" "}
								<code>purchase_price_avg</code> bahan ini. Hanya 1 Primary per
								bahan.
							</div>
						</div>
					</label>

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

					<DialogFooter>
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="inline-flex h-10 items-center rounded-md border border-border-default bg-surface-2 px-4 text-sm font-medium hover:bg-muted"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending || !supplierId}
							className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
						>
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
			<label htmlFor={name} className="text-sm font-medium">
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
