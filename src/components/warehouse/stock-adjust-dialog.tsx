"use client";

import { Loader2, Sliders, X } from "lucide-react";
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

/**
 * Reason-driven Adjust: user pilih kenapa stok berubah, sistem hitung
 * direction + source + delta sendiri. Lebih intuitive dari "Tambah/Kurang"
 * manual yang rawan operator error.
 *
 * Mapping ke schema lama:
 *  - opname    → direction = sign(delta), source='stock_take', qty=|delta|
 *  - damage    → direction='out', source='damage', qty=user input
 *  - testing   → direction='out', source='damage' (kategorikan sbg damage
 *                karena belum ada source code khusus 'testing')
 *  - loss      → direction='out', source='loss', qty=user input
 */
type ReasonCode = "opname" | "damage" | "testing" | "loss";

const REASONS: ReadonlyArray<{
	value: ReasonCode;
	label: string;
	hint: string;
	inputLabel: (unit: string) => string;
	inputHint: string;
}> = [
	{
		value: "opname",
		label: "Penyesuaian Fisik (Quick Opname)",
		hint: "Hitung fisik di rak, isi jumlah real-nya. Sistem hitung selisih.",
		inputLabel: (unit) => `Jumlah Fisik Sebenarnya (${unit})`,
		inputHint:
			"Angka real yang dihitung di rak — bukan selisih. Sistem hitung delta otomatis.",
	},
	{
		value: "damage",
		label: "Barang Rusak / Cacat (Wastage)",
		hint: "Barang rusak / tidak bisa dipakai, dibuang.",
		inputLabel: (unit) => `Jumlah Dibuang (${unit})`,
		inputHint: "Qty yang dibuang dari stok karena rusak.",
	},
	{
		value: "testing",
		label: "Keperluan Testing / Trial",
		hint: "Stok terpakai untuk testing (cetak tes, sample, dll).",
		inputLabel: (unit) => `Jumlah Dipakai Testing (${unit})`,
		inputHint: "Qty yang habis terpakai untuk testing / trial.",
	},
	{
		value: "loss",
		label: "Hilang / Tercecer",
		hint: "Stok hilang tidak diketahui sebabnya.",
		inputLabel: (unit) => `Jumlah Hilang (${unit})`,
		inputHint: "Qty yang hilang dari stok.",
	},
];

export function StockAdjustDialog({
	itemId,
	itemName,
	currentStock,
	itemUnit,
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

	const [reason, setReason] = useState<ReasonCode>("opname");
	const [qtyInput, setQtyInput] = useState<string>("");
	const [notes, setNotes] = useState<string>("");
	const [submitTick, setSubmitTick] = useState(0);

	const reasonMeta = useMemo(
		() => REASONS.find((r) => r.value === reason),
		[reason],
	);

	useEffect(() => {
		if (submitTick === 0 || pending) return;
		const hasErrors =
			state?.errors &&
			Object.values(state.errors).some((arr) => arr && arr.length > 0);
		if (!hasErrors) {
			setOpen(false);
			setQtyInput("");
			setNotes("");
		}
	}, [submitTick, pending, state]);

	// Reset reason when reopening
	useEffect(() => {
		if (open) {
			setReason("opname");
			setQtyInput("");
			setNotes("");
		}
	}, [open]);

	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];
	const formError = state?.errors?._form?.[0];

	const qtyNum = Number(qtyInput);
	const qtyValid = Number.isFinite(qtyNum) && qtyNum >= 0;

	// Compute direction + source + actual qty based on reason
	const computed = useMemo(() => {
		if (!qtyValid) {
			return {
				direction: null as "in" | "out" | null,
				source: null as string | null,
				absoluteQty: 0,
				delta: 0,
				stockAfter: currentStock,
				willGoNegative: false,
			};
		}
		if (reason === "opname") {
			const delta = qtyNum - currentStock;
			return {
				direction: delta > 0 ? "in" : delta < 0 ? "out" : null,
				source: "stock_take",
				absoluteQty: Math.abs(delta),
				delta,
				stockAfter: qtyNum,
				willGoNegative: qtyNum < 0,
			};
		}
		// damage / testing / loss → always out
		const stockAfter = currentStock - qtyNum;
		return {
			direction: "out" as const,
			source: reason === "loss" ? "loss" : "damage",
			absoluteQty: qtyNum,
			delta: -qtyNum,
			stockAfter,
			willGoNegative: stockAfter < 0,
		};
	}, [reason, qtyValid, qtyNum, currentStock]);

	const canSubmit =
		qtyValid &&
		computed.direction !== null &&
		!computed.willGoNegative &&
		!pending;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
				title="Adjust / Koreksi Stok (opname / damage / loss / testing)"
				aria-label={`Adjust stock ${itemName}`}
			>
				<Sliders className="size-4" />
			</DialogTrigger>
			<DialogContent
				showCloseButton={false}
				className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
			>
				<DialogHeader className="shrink-0 border-b border-border-default/50 bg-surface-1 px-8 pt-6 pb-5">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0 flex-1">
							<DialogTitle className="flex items-center gap-2 text-[18px] font-bold tracking-tight text-foreground">
								<Sliders className="size-5 text-primary" aria-hidden />
								Adjust Stok
							</DialogTitle>
							<DialogDescription className="mt-1.5 text-[12px] text-muted-foreground/80">
								<span className="font-medium text-foreground">{itemName}</span> ·
								koreksi non-pembelian (opname / wastage / loss / testing).
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
						if (computed.direction)
							fd.set("direction", computed.direction);
						if (computed.source) fd.set("source", computed.source);
						fd.set("quantity", String(computed.absoluteQty));
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

						{/* Row 1 — Reason Code (full width) */}
						<Field
							label="Alasan Koreksi"
							name="reason"
							error={err("source") ?? err("direction")}
							required
							hint={reasonMeta?.hint}
						>
							<Combobox
								id="reason"
								value={reason}
								onValueChange={(v) =>
									setReason((v as ReasonCode) ?? "opname")
								}
								options={REASONS.map((r) => ({
									value: r.value,
									label: r.label,
								}))}
								allowFreeText={false}
							/>
						</Field>

						{/* Row 2 — Qty input + current stock display (2-col) */}
						<div className="grid gap-5 sm:grid-cols-2">
							<Field
								label={reasonMeta?.inputLabel(itemUnit) ?? "Jumlah"}
								name="quantity"
								error={err("quantity")}
								required
								hint={reasonMeta?.inputHint}
							>
								<NumberField
									id="quantity"
									name="quantity"
									min={0}
									step={1}
									required
									value={qtyInput}
									onChange={(e) => setQtyInput(e.target.value)}
									placeholder={
										reason === "opname"
											? String(Math.max(0, currentStock))
											: "0"
									}
									autoFocus
									aria-invalid={!!err("quantity")}
								/>
							</Field>

							<div>
								<label className="text-[13px] font-medium text-foreground">
									Stok Saat Ini
								</label>
								<div className="mt-1.5 flex h-10 items-center rounded-md border border-border-default bg-surface-2/60 px-3 text-sm">
									<span className="tabular font-semibold text-foreground">
										{currentStock.toLocaleString("id-ID", {
											maximumFractionDigits: 4,
										})}
									</span>
									<span className="ml-1 text-[11px] text-muted-foreground">
										{itemUnit}
									</span>
								</div>
								<p className="mt-1.5 text-xs text-muted-foreground">
									Catatan sistem saat ini (computed dari movements).
								</p>
							</div>
						</div>

						{/* Live preview card */}
						<div
							className={`rounded-lg border px-4 py-3.5 transition-colors ${
								!qtyValid
									? "border-border-default/60 bg-surface-1/80"
									: computed.willGoNegative
										? "border-rose-500/30 bg-rose-500/5"
										: computed.delta > 0
											? "border-emerald-500/30 bg-emerald-500/5"
											: computed.delta < 0
												? "border-amber-500/30 bg-amber-500/5"
												: "border-border-default/60 bg-surface-1/80"
							}`}
						>
							<div className="grid gap-3 sm:grid-cols-3">
								<PreviewCell label="Selisih" tone="muted">
									{!qtyValid ? (
										"—"
									) : (
										<>
											<span
												className={
													computed.delta > 0
														? "text-emerald-700 dark:text-emerald-300"
														: computed.delta < 0
															? "text-rose-600 dark:text-rose-400"
															: "text-foreground/60"
												}
											>
												{computed.delta > 0 ? "+" : ""}
												{computed.delta.toLocaleString("id-ID", {
													maximumFractionDigits: 4,
												})}
											</span>
											<span className="ml-1 text-[10px] font-normal text-muted-foreground">
												{itemUnit}
											</span>
										</>
									)}
								</PreviewCell>
								<PreviewCell label="Stok Jadi" tone="muted">
									{computed.stockAfter.toLocaleString("id-ID", {
										maximumFractionDigits: 4,
									})}{" "}
									<span className="text-[10px] font-normal text-muted-foreground">
										{itemUnit}
									</span>
								</PreviewCell>
								<PreviewCell label="Direction" tone="muted">
									{computed.direction === "in"
										? "IN (stok naik)"
										: computed.direction === "out"
											? "OUT (stok turun)"
											: "—"}
								</PreviewCell>
							</div>
							{computed.willGoNegative && (
								<p className="mt-3 border-t border-rose-500/15 pt-2 text-[11px] font-medium text-rose-700 dark:text-rose-300">
									⚠ Stok jadi minus — server akan tolak (negative-stock guard).
								</p>
							)}
							{qtyValid && computed.delta === 0 && (
								<p className="mt-3 border-t border-current/15 pt-2 text-[11px] text-muted-foreground">
									Tidak ada perubahan — fisik = stok sistem.
								</p>
							)}
						</div>

						<Field
							label="Catatan"
							name="notes"
							error={err("notes")}
							hint="opsional — detail tambahan untuk audit trail"
						>
							<TextareaField
								id="notes"
								name="notes"
								rows={2}
								maxLength={500}
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
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
							disabled={!canSubmit}
							className="press-down inline-flex h-10 items-center gap-2 rounded-md bg-primary dark:bg-primary px-5 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 dark:hover:bg-primary disabled:opacity-60"
						>
							{pending && (
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
							)}
							{pending ? "Menyimpan…" : "Catat Adjust"}
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
	tone: "muted" | "emerald" | "rose";
	children: React.ReactNode;
}) {
	const labelTone =
		tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "rose"
				? "text-rose-700 dark:text-rose-300"
				: "text-muted-foreground/80";
	return (
		<div>
			<div
				className={`text-[9px] font-semibold uppercase tracking-wider ${labelTone}`}
			>
				{label}
			</div>
			<div className="mt-0.5 whitespace-nowrap tabular text-base font-bold text-foreground">
				{children}
			</div>
		</div>
	);
}
