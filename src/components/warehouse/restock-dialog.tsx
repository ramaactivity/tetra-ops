"use client";

import { ArrowDownToLine, ShoppingCart } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
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

/**
 * <RestockDialog /> — buy-stock-purpose-built variant of stock movement form.
 *
 * Locked to direction='in' + source='purchase'. User types qty in their unit
 * of choice (when unit_conversion exists), server converts to base. Unit cost
 * is per-chosen-unit; server converts to per-base-unit for weighted-avg.
 *
 * Adds a live "Setelah restock" preview so owner sees total cost + new stock
 * before submitting.
 */
interface RestockDialogProps {
	itemId: string;
	itemName: string;
	itemUnit: string;
	unitConversion: Record<string, number> | null;
	currentStock: number;
	avgCost: number;
}

export function RestockDialog({
	itemId,
	itemName,
	itemUnit,
	unitConversion,
	currentStock,
	avgCost,
}: RestockDialogProps) {
	const [open, setOpen] = useState(false);
	const action = addStockMovement.bind(null, itemId);
	const [state, formAction, pending] = useActionState<
		StockMovementFormState,
		FormData
	>(action, undefined);

	const unitOptions = unitConversion
		? Object.keys(unitConversion)
		: [itemUnit];
	const [chosenUnit, setChosenUnit] = useState<string>(itemUnit);
	const conversionFactor = unitConversion?.[chosenUnit] ?? 1;
	const isBaseUnit = chosenUnit === itemUnit;

	const [qtyInput, setQtyInput] = useState<string>("");
	const [costInput, setCostInput] = useState<string>("");

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
				className="press-down inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				title="Restock"
			>
				<ArrowDownToLine className="size-3.5" />
				Restock
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShoppingCart className="size-5 text-primary" aria-hidden />
						Restock {itemName}
					</DialogTitle>
					<DialogDescription>
						Catat pembelian stok baru.
					</DialogDescription>
				</DialogHeader>

				<form
					action={(fd) => {
						setSubmitTick((t) => t + 1);
						formAction(fd);
					}}
					className="space-y-4"
				>
					{formError && (
						<div className="rounded-md border border-destructive bg-destructive/10 p-3">
							<p className="text-sm font-medium text-destructive">
								{formError}
							</p>
						</div>
					)}

					<input type="hidden" name="direction" value="in" />
					<input type="hidden" name="source" value="purchase" />

					{/* Current stock context */}
					<div className="flex items-center justify-between rounded-md border border-border-default bg-surface-2/60 px-3 py-2 text-fluid-caption">
						<span className="text-muted-foreground">Stok saat ini</span>
						<span className="tabular font-semibold text-foreground">
							{currentStock.toLocaleString("id-ID", {
								maximumFractionDigits: 4,
							})}{" "}
							{itemUnit}
						</span>
					</div>

					<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
						<Field
							label={`Quantity (${chosenUnit})`}
							name="quantity"
							error={err("quantity")}
							required
						>
							<NumberField
								id="quantity"
								name="quantity"
								min={0.0001}
								step={isBaseUnit && itemUnit === "roll" ? 0.01 : 1}
								required
								defaultValue={get("quantity")}
								onChange={(e) => setQtyInput(e.target.value)}
								placeholder={isBaseUnit && itemUnit === "roll" ? "2" : "10"}
								autoFocus
								aria-invalid={!!err("quantity")}
							/>
						</Field>

						{unitOptions.length > 1 ? (
							<Field
								label="Unit"
								name="quantity_unit"
								error={err("quantity_unit")}
							>
								<Combobox
									id="quantity_unit"
									value={chosenUnit}
									onValueChange={(v) => setChosenUnit(v ?? itemUnit)}
									options={unitOptions.map((u) => ({ value: u, label: u }))}
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
							<input type="hidden" name="quantity_unit" value={itemUnit} />
						)}
					</div>

					{!isBaseUnit && (
						<div className="rounded-md border border-border-default/60 bg-secondary/40 p-2.5 text-[12px] text-muted-foreground">
							1 {chosenUnit} = {conversionFactor.toLocaleString("id-ID")}{" "}
							{itemUnit} · Auto-convert saat simpan.
						</div>
					)}

					<Field
						label={`Harga / ${chosenUnit}`}
						name="unit_cost"
						error={err("unit_cost")}
						required
						hint={
							avgCost > 0
								? `Avg saat ini (per ${itemUnit}): ${formatRupiah(avgCost)}`
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

					{/* Live preview */}
					{(qtyValid || costValid) && (
						<div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-fluid-caption">
							<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
								Setelah Restock
							</div>
							<dl className="grid grid-cols-2 gap-x-4 gap-y-1">
								<dt className="text-muted-foreground">Stok jadi</dt>
								<dd className="text-right tabular font-medium text-foreground">
									{stockAfter.toLocaleString("id-ID", {
										maximumFractionDigits: 4,
									})}{" "}
									{itemUnit}
								</dd>
								{qtyValid && costValid && (
									<>
										<dt className="text-muted-foreground">Total bayar</dt>
										<dd className="text-right tabular font-medium text-foreground">
											{formatRupiah(totalCost)}
										</dd>
										<dt className="text-muted-foreground">
											Avg cost baru ({itemUnit})
										</dt>
										<dd className="text-right tabular font-medium text-foreground">
											{formatRupiah(Math.round(newAvgCost))}
										</dd>
									</>
								)}
							</dl>
						</div>
					)}

					<Field
						label="Catatan"
						name="notes"
						error={err("notes")}
						hint="Opsional — supplier, nomor invoice, dll"
					>
						<TextareaField
							id="notes"
							name="notes"
							rows={2}
							maxLength={500}
							defaultValue={get("notes")}
						/>
					</Field>

					<DialogFooter>
						<DialogClose className="inline-flex h-10 items-center rounded-md border border-border-default bg-surface-2 px-4 text-sm font-medium hover:bg-muted">
							Batal
						</DialogClose>
						<button
							type="submit"
							disabled={pending}
							className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
						>
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
