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

/**
 * <RestockDialog /> — buy-stock-purpose-built variant of stock movement form.
 *
 * Scoped to direction='in' + source='purchase'. Lets owner type quantity in
 * the unit they prefer (roll OR a derived unit from inventory_items.unit_conversion)
 * — server converts via JSONB lookup. Unit cost is per-chosen-unit; server
 * converts to per-base-unit and updates weighted-avg cost.
 *
 * Use this instead of the generic Adjust dialog when the user is recording
 * a purchase. Adjust stays for: damage, loss, manual correction, stock-take.
 */

interface RestockDialogProps {
	itemId: string;
	itemName: string;
	itemUnit: string; // base unit (e.g. "roll", "pcs")
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

	// Unit picker: keys of unit_conversion (base unit + alt units). Default = base.
	const unitOptions = unitConversion
		? Object.keys(unitConversion)
		: [itemUnit];
	const [chosenUnit, setChosenUnit] = useState<string>(itemUnit);
	const conversionFactor = unitConversion?.[chosenUnit] ?? 1;
	const isBaseUnit = chosenUnit === itemUnit;

	// Submission close-on-success (same pattern as stock-adjust-dialog Sprint B.3)
	const [submitTick, setSubmitTick] = useState(0);
	useEffect(() => {
		if (submitTick === 0 || pending) return;
		const hasErrors =
			state?.errors &&
			Object.values(state.errors).some((arr) => arr && arr.length > 0);
		if (!hasErrors) setOpen(false);
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
						Catat pembelian stok baru. Stok saat ini:{" "}
						<span className="tabular font-semibold text-foreground">
							{currentStock.toLocaleString("id-ID", { maximumFractionDigits: 3 })}{" "}
							{itemUnit}
						</span>
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
						<div className="border-destructive bg-destructive/10 rounded-md border p-3">
							<p className="text-destructive text-sm font-medium">
								{formError}
							</p>
						</div>
					)}

					{/* Locked direction + source — this is purchase-only */}
					<input type="hidden" name="direction" value="in" />
					<input type="hidden" name="source" value="purchase" />

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
									onValueChange={setChosenUnit}
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
						label={`Unit Cost (Rp per ${chosenUnit})`}
						name="unit_cost"
						error={err("unit_cost")}
						required
						hint={`Harga beli ${chosenUnit} ini. Avg saat ini (per ${itemUnit}): Rp ${avgCost.toLocaleString("id-ID")}.`}
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
								placeholder="0"
								className="pl-9"
								aria-invalid={!!err("unit_cost")}
							/>
						</div>
					</Field>

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
						<DialogClose className="border-border-default bg-surface-2 hover:bg-muted inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium">
							Batal
						</DialogClose>
						<button
							type="submit"
							disabled={pending}
							className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
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
				{required && <span className="text-primary ml-0.5">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-destructive text-xs">{error}</p>
			) : hint ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}
