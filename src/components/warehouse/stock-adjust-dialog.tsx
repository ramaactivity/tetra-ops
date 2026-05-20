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
import { NumberField, TextareaField } from "@/components/ui/form-fields";
import {
	addStockMovement,
	type StockMovementFormState,
} from "@/lib/actions/stock-movements";
import { formatRupiah } from "@/lib/format";

/**
 * Adjust dialog (Inventory v2): purchases moved to <RestockDialog />. This is
 * for correction-style movements only — damage, loss, manual adjust, transfer,
 * stock-take. No weighted-avg updates here.
 */
const SOURCES: ReadonlyArray<{
	value: string;
	label: string;
	hint: string;
}> = [
	{
		value: "manual_adjust",
		label: "Manual Adjust",
		hint: "Koreksi karena salah catat sebelumnya.",
	},
	{
		value: "damage",
		label: "Damage",
		hint: "Stok rusak — keluar tanpa terjual.",
	},
	{
		value: "loss",
		label: "Loss",
		hint: "Stok hilang / tercecer.",
	},
	{
		value: "stock_take",
		label: "Stock Opname",
		hint: "Biasanya auto via Commit di /warehouse/stock-take. Pakai manual cuma kalau ada koreksi standalone.",
	},
	{
		value: "transfer",
		label: "Transfer",
		hint: "Pindah lokasi/gudang.",
	},
];

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
	const [source, setSource] = useState<string>("manual_adjust");
	const [qtyInput, setQtyInput] = useState<string>("");
	const [submitTick, setSubmitTick] = useState(0);

	useEffect(() => {
		if (submitTick === 0 || pending) return;
		const hasErrors =
			state?.errors &&
			Object.values(state.errors).some((arr) => arr && arr.length > 0);
		if (!hasErrors) {
			setOpen(false);
			setQtyInput("");
		}
	}, [submitTick, pending, state]);

	const get = (key: string, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const formError = state?.errors?._form?.[0];

	const qtyNum = Number(qtyInput);
	const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0;
	const stockAfter = qtyValid
		? direction === "in"
			? currentStock + qtyNum
			: direction === "out"
				? currentStock - qtyNum
				: currentStock + qtyNum
		: currentStock;
	const sourceHint = SOURCES.find((s) => s.value === source)?.hint;
	const willGoNegative = direction === "out" && stockAfter < 0;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className="inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				title="Adjust stock (damage / loss / manual)"
			>
				<Sliders className="h-3.5 w-3.5" />
				Adjust
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sliders className="size-5 text-primary" aria-hidden />
						Adjust Stok
					</DialogTitle>
					<DialogDescription>
						{itemName} — koreksi non-pembelian (damage / loss / manual).
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

					<div className="grid grid-cols-3 gap-1 rounded-md border border-border-default bg-muted/30 p-1">
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
								onChange={(e) => setQtyInput(e.target.value)}
								placeholder="10"
								autoFocus
								aria-invalid={!!err("quantity")}
							/>
						</Field>

						<Field label="Sumber" name="source" error={err("source")} required>
							<Combobox
								id="source"
								value={source}
								onValueChange={(v) => setSource(v ?? "manual_adjust")}
								options={SOURCES.map((s) => ({
									value: s.value,
									label: s.label,
								}))}
								placeholder="— pilih sumber —"
								allowFreeText={false}
								aria-invalid={!!err("source")}
							/>
							<input type="hidden" name="source" value={source} required />
						</Field>
					</div>

					{sourceHint && (
						<div className="rounded-md border border-border-default/60 bg-secondary/40 p-2.5 text-[12px] text-muted-foreground">
							{sourceHint}
						</div>
					)}

					{direction === "in" && (
						<Field
							label="Unit Cost"
							name="unit_cost"
							error={err("unit_cost")}
							hint={`Optional — biasanya kosongin. Avg saat ini: ${formatRupiah(avgCost)}.`}
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
									defaultValue={get("unit_cost")}
									placeholder="0"
									className="pl-9"
									aria-invalid={!!err("unit_cost")}
								/>
							</div>
						</Field>
					)}

					{/* Live preview */}
					{qtyValid && (
						<div
							className={`rounded-lg border p-3 text-fluid-caption ${
								willGoNegative
									? "border-rose-500/40 bg-rose-500/10"
									: direction === "in"
										? "border-emerald-500/30 bg-emerald-500/5"
										: direction === "out"
											? "border-rose-500/25 bg-rose-500/5"
											: "border-amber-500/30 bg-amber-500/5"
							}`}
						>
							<div
								className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${
									willGoNegative
										? "text-rose-700 dark:text-rose-300"
										: direction === "in"
											? "text-emerald-700 dark:text-emerald-300"
											: direction === "out"
												? "text-rose-700 dark:text-rose-300"
												: "text-amber-700 dark:text-amber-300"
								}`}
							>
								Setelah Adjust
							</div>
							<dl className="grid grid-cols-2 gap-x-4 gap-y-1">
								<dt className="text-muted-foreground">Stok jadi</dt>
								<dd
									className={`text-right tabular font-medium ${
										stockAfter < 0
											? "text-rose-600 dark:text-rose-400"
											: "text-foreground"
									}`}
								>
									{stockAfter.toLocaleString("id-ID", {
										maximumFractionDigits: 4,
									})}{" "}
									{itemUnit}
								</dd>
							</dl>
							{willGoNegative && (
								<p className="mt-2 text-[11px] font-medium text-rose-700 dark:text-rose-300">
									⚠ Stok akan jadi minus — server akan tolak save (negative-stock guard).
								</p>
							)}
						</div>
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
						<DialogClose className="inline-flex h-10 items-center rounded-md border border-border-default bg-surface-2 px-4 text-sm font-medium hover:bg-muted">
							Batal
						</DialogClose>
						<button
							type="submit"
							disabled={pending}
							className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
						>
							{pending ? "Menyimpan…" : "Catat Adjust"}
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
