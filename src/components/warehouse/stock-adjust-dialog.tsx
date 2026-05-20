"use client";

import { ArrowDownToLine, ArrowUpFromLine, Equal, Sliders } from "lucide-react";
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
import {
	INPUT_CLASS,
	MoneyInput,
	NumberField,
	TextareaField,
} from "@/components/ui/form-fields";
import {
	addStockMovement,
	type StockMovementFormState,
} from "@/lib/actions/stock-movements";

/**
 * Inventory v2 (2026-05-21): `purchase` source is no longer here — that flow
 * is now in <RestockDialog/> with unit-toggle support. Keeping this list to
 * the corrective / loss / transfer cases the Adjust dialog is purpose-built for.
 */
const SOURCES = [
	{ value: "manual_adjust", label: "Manual Adjust (correction)" },
	{ value: "damage", label: "Damage" },
	{ value: "loss", label: "Loss" },
	{ value: "stock_take", label: "Stock Take (rare — usually auto via commit_stock_take)" },
	{ value: "transfer", label: "Transfer" },
] as const;

export function StockAdjustDialog({
	itemId,
	itemName,
	currentStock,
	itemUnit,
	avgCost,
}: {
	itemId: string;
	itemName: string;
	currentStock: number;
	itemUnit: string;
	avgCost: number;
}) {
	const [open, setOpen] = useState(false);
	const action = addStockMovement.bind(null, itemId);
	const [state, formAction, pending] = useActionState<
		StockMovementFormState,
		FormData
	>(action, undefined);

	const [direction, setDirection] = useState<"in" | "out" | "adjustment">("in");
	const [source, setSource] = useState<string>("purchase");
	// Track submission attempts so we only close the dialog on a CLEAN result
	// (success = no errors, no _form error). Previous version closed
	// optimistically inside the form action, so users never saw validation
	// errors (negative-stock guard, missing unit_cost) when they fired.
	const [submitTick, setSubmitTick] = useState(0);

	useEffect(() => {
		if (submitTick === 0) return;
		if (pending) return;
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
	// Inventory v2 — Adjust dialog no longer handles purchases; purchase
	// has its own <RestockDialog/>. Unit cost is therefore always optional
	// here (used only when correcting via 'manual_adjust' with a known cost).
	const purchaseInRequiresCost = false;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2 text-xs font-medium transition-colors"
				title="Adjust stock"
			>
				<Sliders className="h-3.5 w-3.5" />
				Adjust
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Adjust Stock</DialogTitle>
					<DialogDescription>
						{itemName} · stok saat ini{" "}
						<span className="text-foreground font-semibold tabular">
							{currentStock} {itemUnit}
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

					<div className="border-border-default bg-muted/30 grid grid-cols-3 gap-1 rounded-md border p-1">
						<DirOption
							selected={direction === "in"}
							onClick={() => setDirection("in")}
							icon={<ArrowDownToLine className="h-4 w-4" />}
							label="Masuk"
							tone="emerald"
						/>
						<DirOption
							selected={direction === "out"}
							onClick={() => setDirection("out")}
							icon={<ArrowUpFromLine className="h-4 w-4" />}
							label="Keluar"
							tone="rose"
						/>
						<DirOption
							selected={direction === "adjustment"}
							onClick={() => setDirection("adjustment")}
							icon={<Equal className="h-4 w-4" />}
							label="Koreksi"
							tone="amber"
						/>
					</div>
					<input type="hidden" name="direction" value={direction} />

					<div className="grid gap-3 sm:grid-cols-2">
						<Field
							label={`Quantity (${itemUnit})`}
							name="quantity"
							error={err("quantity")}
							required
						>
							<NumberField
								id="quantity"
								name="quantity"
								min={1}
								step={1}
								required
								defaultValue={get("quantity")}
								placeholder="10"
								autoFocus
								aria-invalid={!!err("quantity")}
							/>
						</Field>

						<Field label="Sumber" name="source" error={err("source")} required>
							<Combobox
								id="source"
								value={source}
								onValueChange={setSource}
								options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
								placeholder="— pilih sumber —"
								allowFreeText={false}
								aria-invalid={!!err("source")}
							/>
							<input type="hidden" name="source" value={source} required />
						</Field>
					</div>

					{direction === "in" && (
						<Field
							label="Unit Cost"
							name="unit_cost"
							error={err("unit_cost")}
							required={purchaseInRequiresCost}
							hint={
								purchaseInRequiresCost
									? `Wajib untuk source=purchase biar weighted-avg cost akurat. Avg saat ini: ${formatIDR(avgCost)}.`
									: `Avg saat ini: ${formatIDR(avgCost)}. Kosongkan jika tidak update harga.`
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
									required={purchaseInRequiresCost}
									defaultValue={get("unit_cost")}
									placeholder="0"
									className="pl-9"
									aria-invalid={!!err("unit_cost")}
								/>
							</div>
						</Field>
					)}

					<Field
						label="Catatan"
						name="notes"
						error={err("notes")}
						hint="Optional"
					>
						<TextareaField
							id="notes"
							name="notes"
							rows={2}
							maxLength={500}
							defaultValue={get("notes")}
							aria-invalid={!!err("notes")}
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
							{pending ? "Menyimpan…" : "Catat movement"}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DirOption({
	selected,
	onClick,
	icon,
	label,
	tone,
}: {
	selected: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	tone: "emerald" | "rose" | "amber";
}) {
	const cls =
		tone === "emerald"
			? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
			: tone === "rose"
				? "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30"
				: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30";

	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onClick}
			className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-center transition-colors ${
				selected ? cls : "text-muted-foreground hover:bg-muted"
			}`}
		>
			<span>{icon}</span>
			<span className="text-xs font-medium">{label}</span>
		</button>
	);
}

function formatIDR(value: number): string {
	if (!value) return "Rp 0";
	return `Rp ${value.toLocaleString("id-ID")}`;
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
