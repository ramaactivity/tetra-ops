"use client";

import { ArrowDownToLine, ArrowUpFromLine, Equal, Sliders } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
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
	addStockMovement,
	type StockMovementFormState,
} from "@/lib/actions/stock-movements";

const SOURCES = [
	{ value: "manual_adjust", label: "Manual Adjust" },
	{ value: "purchase", label: "Purchase / Restock" },
	{ value: "damage", label: "Damage" },
	{ value: "loss", label: "Loss" },
	{ value: "stock_take", label: "Stock Take" },
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

	// Close dialog on successful submit (state becomes undefined again)
	useEffect(() => {
		if (state === undefined && !pending && open) {
			// no-op — initial state is also undefined; we use a different signal
		}
	}, [state, pending, open]);

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
				className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium transition-colors"
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
						formAction(fd);
						// Optimistic close — server revalidate refreshes the table
						setOpen(false);
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

					<div className="border-border bg-muted/30 grid grid-cols-3 gap-1 rounded-md border p-1">
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
							<input
								type="number"
								name="quantity"
								min={1}
								step={1}
								required
								defaultValue={get("quantity")}
								placeholder="10"
								className={`${inputClass} tabular`}
								autoFocus
							/>
						</Field>

						<Field label="Sumber" name="source" error={err("source")} required>
							<select
								name="source"
								required
								defaultValue={get(
									"source",
									direction === "in" ? "purchase" : "manual_adjust",
								)}
								className={selectClass}
							>
								{SOURCES.map((s) => (
									<option key={s.value} value={s.value}>
										{s.label}
									</option>
								))}
							</select>
						</Field>
					</div>

					{direction === "in" && (
						<Field
							label="Unit Cost (Rp)"
							name="unit_cost"
							error={err("unit_cost")}
							hint={`Avg saat ini: Rp ${avgCost.toLocaleString("id-ID")}. Kosongkan jika tidak update harga.`}
						>
							<input
								type="number"
								name="unit_cost"
								min={0}
								step={1}
								defaultValue={get("unit_cost")}
								placeholder="0"
								className={`${inputClass} tabular`}
							/>
						</Field>
					)}

					<Field
						label="Catatan"
						name="notes"
						error={err("notes")}
						hint="Optional"
					>
						<textarea
							name="notes"
							rows={2}
							maxLength={500}
							defaultValue={get("notes")}
							className={`${inputClass} resize-none`}
						/>
					</Field>

					<DialogFooter>
						<DialogClose className="border-border bg-card hover:bg-muted inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium">
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

const inputClass =
	"border-border bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
const selectClass = `${inputClass} appearance-none`;

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
