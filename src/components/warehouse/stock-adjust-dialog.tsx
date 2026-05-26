"use client";

import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Equal,
	Package,
	Sliders,
} from "lucide-react";
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
	const sourceMeta = SOURCES.find((s) => s.value === source);
	const willGoNegative = direction === "out" && stockAfter < 0;
	const directionTone =
		direction === "in" ? "emerald" : direction === "out" ? "rose" : "amber";

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
				title="Adjust / Koreksi Stok (damage / loss / manual)"
				aria-label={`Adjust stock ${itemName}`}
			>
				<Sliders className="size-4" />
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sliders className="size-5 text-primary" aria-hidden />
						Adjust Stok — {itemName}
					</DialogTitle>
					<DialogDescription>
						Koreksi non-pembelian (damage / loss / manual / transfer).
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

					<div className="grid gap-4 md:grid-cols-[1fr_280px]">
						{/* LEFT: form */}
						<div className="space-y-3">
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

								<Field
									label="Sumber"
									name="source"
									error={err("source")}
									required
								>
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

							{sourceMeta && (
								<div className="rounded-md border border-border-default/60 bg-secondary/40 p-2.5 text-[12px] text-muted-foreground">
									<span className="font-medium text-foreground">
										{sourceMeta.label}:
									</span>{" "}
									{sourceMeta.hint}
								</div>
							)}

							{direction === "in" && (
								<Field
									label="Unit Cost"
									name="unit_cost"
									error={err("unit_cost")}
									hint={`Opsional — biasanya kosongin. Avg saat ini: ${formatRupiah(avgCost)}`}
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

							<Field
								label="Catatan"
								name="notes"
								error={err("notes")}
								hint="opsional"
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
						</div>

						{/* RIGHT: info panel */}
						<aside className="space-y-3">
							<InfoPanel label="Stok saat ini" tone="muted">
								<div className="flex items-baseline gap-1">
									<span className="tabular text-fluid-h3 font-semibold text-foreground">
										{currentStock.toLocaleString("id-ID", {
											maximumFractionDigits: 4,
										})}
									</span>
									<span className="text-[11px] text-muted-foreground">
										{itemUnit}
									</span>
								</div>
							</InfoPanel>

							<InfoPanel
								label="Setelah adjust"
								tone={
									!qtyValid
										? "muted"
										: willGoNegative
											? "rose"
											: directionTone
								}
								icon={<Package className="size-3" />}
							>
								<div className="flex items-baseline justify-between gap-2">
									<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
										Stok jadi
									</span>
									<div className="text-right">
										<span
											className={`tabular text-fluid-body font-semibold ${
												stockAfter < 0
													? "text-rose-600 dark:text-rose-400"
													: "text-foreground"
											}`}
										>
											{stockAfter.toLocaleString("id-ID", {
												maximumFractionDigits: 4,
											})}
										</span>
										<span className="ml-1 text-[10px] text-muted-foreground">
											{itemUnit}
										</span>
									</div>
								</div>
								{willGoNegative && (
									<p className="mt-2 border-t border-rose-500/15 pt-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
										⚠ Stok jadi minus — server akan tolak (negative-stock guard).
									</p>
								)}
								{qtyValid && !willGoNegative && (
									<div className="mt-1.5 border-t border-current/15 pt-1.5 text-[10px] text-muted-foreground">
										{direction === "in"
											? `+${qtyNum.toLocaleString("id-ID")} ${itemUnit} masuk`
											: direction === "out"
												? `−${qtyNum.toLocaleString("id-ID")} ${itemUnit} keluar`
												: `±${qtyNum.toLocaleString("id-ID")} ${itemUnit} koreksi`}
									</div>
								)}
							</InfoPanel>
						</aside>
					</div>

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

function InfoPanel({
	label,
	tone,
	icon,
	children,
}: {
	label: string;
	tone: "muted" | "emerald" | "amber" | "sky" | "rose";
	icon?: React.ReactNode;
	children: React.ReactNode;
}) {
	const cls =
		tone === "emerald"
			? "border-emerald-500/30 bg-emerald-500/5"
			: tone === "amber"
				? "border-amber-500/30 bg-amber-500/5"
				: tone === "sky"
					? "border-sky-500/30 bg-sky-500/5"
					: tone === "rose"
						? "border-rose-500/30 bg-rose-500/5"
						: "border-border-default bg-surface-2/60";
	const labelTone =
		tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "amber"
				? "text-amber-700 dark:text-amber-300"
				: tone === "sky"
					? "text-sky-700 dark:text-sky-300"
					: tone === "rose"
						? "text-rose-700 dark:text-rose-300"
						: "text-muted-foreground";
	return (
		<div className={`rounded-lg border p-2.5 ${cls}`}>
			<div
				className={`mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${labelTone}`}
			>
				{icon}
				{label}
			</div>
			{children}
		</div>
	);
}
