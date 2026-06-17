"use client";

import { ArrowDownToLine, Loader2, ShoppingCart, X } from "lucide-react";
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
	DialogTrigger,
} from "@/components/ui/dialog";
import { NumberField, TextareaField } from "@/components/ui/form-fields";
import {
	addStockMovement,
	type StockMovementFormState,
} from "@/lib/actions/stock-movements";
import { formatRupiah } from "@/lib/format";
import {
	listUnitsByKind,
	normalizeConversion,
	toBase,
} from "@/lib/inventory/unit-conversion";

export type RestockSupplierOption = {
	id: string;
	name: string;
};

interface RestockDialogProps {
	itemId: string;
	itemName: string;
	itemUnit: string;
	unitConversion: unknown;
	currentStock: number;
	avgCost: number;
	suppliers?: RestockSupplierOption[];
	preferredSupplierId?: string | null;
}

export function RestockDialog({
	itemId,
	itemName,
	itemUnit,
	unitConversion,
	currentStock,
	avgCost,
	suppliers = [],
	preferredSupplierId = null,
}: RestockDialogProps) {
	const [open, setOpen] = useState(false);
	const action = addStockMovement.bind(null, itemId);
	const [state, formAction, pending] = useActionState<
		StockMovementFormState,
		FormData
	>(action, undefined);

	const conversionMap = useMemo(
		() => normalizeConversion(unitConversion, itemUnit),
		[unitConversion, itemUnit],
	);
	const unitOptionEntries = useMemo(
		() => listUnitsByKind(conversionMap, "purchase", "base"),
		[conversionMap],
	);
	const unitOptions = unitOptionEntries.map(({ code }) => code);
	const [chosenUnit, setChosenUnit] = useState<string>(itemUnit);
	const isBaseUnit = chosenUnit === itemUnit;
	const conversionFactor = useMemo(() => {
		try {
			return toBase(1, chosenUnit, conversionMap);
		} catch {
			return 1;
		}
	}, [chosenUnit, conversionMap]);

	const [qtyInput, setQtyInput] = useState<string>("");
	const [costInput, setCostInput] = useState<string>("");
	const [supplierId, setSupplierId] = useState<string>(
		preferredSupplierId ?? "",
	);

	const qtyNum = Number(qtyInput);
	const costNum = Number(costInput);
	const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0;
	const costValid = Number.isFinite(costNum) && costNum >= 0;
	const baseQty = qtyValid ? qtyNum * conversionFactor : 0;
	const totalCost = qtyValid && costValid ? qtyNum * costNum : 0;
	const stockAfter = currentStock + baseQty;
	const newAvgCost =
		qtyValid && costValid && stockAfter > 0
			? (currentStock * avgCost + totalCost) / stockAfter
			: avgCost;

	const [submitTick, setSubmitTick] = useState(0);
	useEffect(() => {
		if (submitTick === 0 || pending) return;
		const hasErrors =
			state?.errors &&
			Object.values(state.errors).some((arr) => arr && arr.length > 0);
		if (!hasErrors) {
			setOpen(false);
			setQtyInput("");
			setCostInput("");
		}
	}, [submitTick, pending, state]);

	// Reset supplier to preferred when dialog opens
	useEffect(() => {
		if (open) setSupplierId(preferredSupplierId ?? "");
	}, [open, preferredSupplierId]);

	const get = (key: string, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const formError = state?.errors?._form?.[0];

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
				title="Restock — catat pembelian stok baru"
				aria-label={`Restock ${itemName}`}
			>
				<ArrowDownToLine className="size-4" />
			</DialogTrigger>
			<DialogContent
				showCloseButton={false}
				className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
			>
				<DialogHeader className="shrink-0 border-b border-border-default/50 bg-surface-1 px-8 pt-6 pb-5">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0 flex-1">
							<DialogTitle className="flex items-center gap-2 text-[18px] font-bold tracking-tight text-foreground">
								<ShoppingCart className="size-5 text-primary" aria-hidden />
								Restock
							</DialogTitle>
							<DialogDescription className="mt-1.5 text-[12px] text-muted-foreground/80">
								<span className="font-medium text-foreground">{itemName}</span> ·
								catat pembelian stok baru. Auto-update weighted-avg cost.
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
					action={(fd) => {
						setSubmitTick((t) => t + 1);
						formAction(fd);
					}}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-5 overflow-y-auto px-8 py-6">
						{formError && (
							<div className="rounded-lg bg-destructive/10 p-3.5 ring-1 ring-destructive/30">
								<p className="text-sm font-medium text-destructive">
									{formError}
								</p>
							</div>
						)}

						<input type="hidden" name="direction" value="in" />
						<input type="hidden" name="source" value="purchase" />

						{/* Row 1 — Supplier (full width) */}
						<Field
							label="Supplier / Vendor"
							name="supplier_id"
							error={err("supplier_id")}
							hint={
								preferredSupplierId
									? "Auto-pick supplier utama. Bisa diganti."
									: "opsional — boleh kosong kalau beli di warung dadakan"
							}
						>
							<Combobox
								id="supplier_id"
								value={supplierId}
								onValueChange={(v) => setSupplierId(v ?? "")}
								options={suppliers.map((s) => ({
									value: s.id,
									label: s.name,
								}))}
								placeholder="Pilih supplier (opsional)"
								allowFreeText={false}
							/>
							<input type="hidden" name="supplier_id" value={supplierId} />
						</Field>

						{/* Row 2 — Qty + Unit (2-col) */}
						<div className="grid gap-5 sm:grid-cols-2">
							<Field
								label={`Jumlah Beli (${chosenUnit})`}
								name="quantity"
								error={err("quantity")}
								required
							>
								<NumberField
									id="quantity"
									name="quantity"
									min={isBaseUnit && itemUnit === "roll" ? 0.01 : 1}
									step={isBaseUnit && itemUnit === "roll" ? 0.01 : 1}
									required
									defaultValue={get("quantity")}
									onChange={(e) => setQtyInput(e.target.value)}
									placeholder={
										isBaseUnit && itemUnit === "roll" ? "2" : "10"
									}
									autoFocus
									aria-invalid={!!err("quantity")}
								/>
							</Field>

							{unitOptions.length > 1 ? (
								<Field
									label="Satuan Beli (Bulk)"
									name="quantity_unit"
									error={err("quantity_unit")}
								>
									<Combobox
										id="quantity_unit"
										value={chosenUnit}
										onValueChange={(v) => setChosenUnit(v ?? itemUnit)}
										options={unitOptionEntries.map(({ code, def }) => ({
											value: code,
											label: def.label || code,
										}))}
										allowFreeText={false}
										aria-invalid={!!err("quantity_unit")}
									/>
									<input
										type="hidden"
										name="quantity_unit"
										value={chosenUnit}
									/>
								</Field>
							) : (
								<div>
									<label className="text-[13px] font-medium text-foreground">
										Satuan
									</label>
									<div className="mt-1.5 flex h-10 items-center rounded-md border border-border-default bg-surface-2/60 px-3 text-sm text-muted-foreground">
										{itemUnit}
									</div>
									<input type="hidden" name="quantity_unit" value={itemUnit} />
								</div>
							)}
						</div>

						{/* Conversion preview when bulk unit */}
						{!isBaseUnit && qtyValid && (
							<div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5 text-[12px] text-emerald-800 dark:text-emerald-200">
								≈ Otomatis menambah{" "}
								<strong className="tabular">
									{baseQty.toLocaleString("id-ID", {
										maximumFractionDigits: 4,
									})}{" "}
									{itemUnit}
								</strong>{" "}
								ke stok fisik gudang
							</div>
						)}

						{/* Row 3 — Harga per unit */}
						<Field
							label={`Harga per ${chosenUnit} (Rp)`}
							name="unit_cost"
							error={err("unit_cost")}
							required
							hint={
								avgCost > 0
									? `Avg saat ini: ${formatRupiah(avgCost)} / ${itemUnit}`
									: "Belum ada harga rata-rata"
							}
						>
							<div className="relative">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
									Rp
								</span>
								<NumberField
									id="unit_cost"
									name="unit_cost"
									min={0}
									step={1}
									required
									defaultValue={get("unit_cost")}
									onChange={(e) => setCostInput(e.target.value)}
									placeholder="0"
									className="pl-9"
									aria-invalid={!!err("unit_cost")}
								/>
							</div>
						</Field>

						{/* Live preview card */}
						<div className="rounded-lg border border-border-default/60 bg-surface-1/80 px-4 py-3.5">
							<div className="grid gap-3 sm:grid-cols-3">
								<PreviewCell label="Stok saat ini" tone="muted">
									{currentStock.toLocaleString("id-ID", {
										maximumFractionDigits: 4,
									})}{" "}
									<span className="text-[10px] font-normal text-muted-foreground">
										{itemUnit}
									</span>
								</PreviewCell>
								<PreviewCell
									label="Stok jadi"
									tone={qtyValid ? "emerald" : "muted"}
								>
									{stockAfter.toLocaleString("id-ID", {
										maximumFractionDigits: 4,
									})}{" "}
									<span className="text-[10px] font-normal text-muted-foreground">
										{itemUnit}
									</span>
								</PreviewCell>
								<PreviewCell
									label="Total bayar"
									tone={qtyValid && costValid && totalCost > 0 ? "sky" : "muted"}
								>
									{totalCost > 0 ? formatRupiah(totalCost) : "Rp —"}
								</PreviewCell>
							</div>
							{qtyValid && costValid && totalCost > 0 && (
								<div className="mt-3 border-t border-border-default/50 pt-2.5 text-[11px] text-muted-foreground">
									Weighted-avg cost baru:{" "}
									<strong className="tabular text-emerald-700 dark:text-emerald-300">
										{formatRupiah(Math.round(newAvgCost))} / {itemUnit}
									</strong>
								</div>
							)}
						</div>

						<Field
							label="Catatan"
							name="notes"
							error={err("notes")}
							hint="opsional — supplier note, nomor invoice, dll"
						>
							<TextareaField
								id="notes"
								name="notes"
								rows={2}
								maxLength={500}
								defaultValue={get("notes")}
							/>
						</Field>
					</div>

					<DialogFooter className="shrink-0 flex items-center justify-end gap-3 border-t border-border-default/50 bg-surface-1/60 px-8 py-5 sm:py-6">
						<button
							type="button"
							onClick={() => setOpen(false)}
							disabled={pending}
							className="press-down inline-flex h-10 items-center rounded-md px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-40"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending}
							className="press-down inline-flex h-10 items-center gap-2 rounded-md bg-[#059669] dark:bg-[#0b9e6a] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#047857] dark:hover:bg-[#059669] disabled:opacity-60"
						>
							{pending && (
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
							)}
							{pending ? "Menyimpan…" : "Catat Restock"}
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

function PreviewCell({
	label,
	tone,
	children,
}: {
	label: string;
	tone: "muted" | "emerald" | "sky";
	children: React.ReactNode;
}) {
	const labelTone =
		tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "sky"
				? "text-sky-700 dark:text-sky-300"
				: "text-muted-foreground/80";
	const valueTone =
		tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "sky"
				? "text-sky-700 dark:text-sky-300"
				: "text-foreground/60";
	return (
		<div>
			<div
				className={`text-[9px] font-semibold uppercase tracking-wider ${labelTone}`}
			>
				{label}
			</div>
			<div className={`mt-0.5 whitespace-nowrap tabular text-base font-bold ${valueTone}`}>
				{children}
			</div>
		</div>
	);
}
