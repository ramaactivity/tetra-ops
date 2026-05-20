"use client";

import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
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
	type PurchaseFormState,
	recordPurchaseBatch,
} from "@/lib/actions/purchases";
import { formatRupiah } from "@/lib/format";

export type PembelianItemOption = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	unit_conversion: Record<string, number> | null;
};

export type PembelianSupplierOption = {
	id: string;
	name: string;
	default_payment_term: string;
	default_top_days: number;
};

interface LineRow {
	id: string;
	item_id: string;
	quantity: string;
	quantity_unit: string;
	unit_cost: string;
	notes: string;
}

const PAYMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "cash", label: "Cash" },
	{ value: "top_7", label: "TOP 7 hari" },
	{ value: "top_14", label: "TOP 14 hari" },
	{ value: "top_30", label: "TOP 30 hari" },
	{ value: "top_60", label: "TOP 60 hari" },
	{ value: "top_custom", label: "TOP custom" },
];

function newLine(): LineRow {
	return {
		id: crypto.randomUUID(),
		item_id: "",
		quantity: "",
		quantity_unit: "",
		unit_cost: "",
		notes: "",
	};
}

export function PembelianDialog({
	trigger,
	items,
	suppliers,
}: {
	trigger: React.ReactNode;
	items: PembelianItemOption[];
	suppliers: PembelianSupplierOption[];
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [supplierId, setSupplierId] = useState<string>("");
	const [paymentMethod, setPaymentMethod] = useState<string>("cash");
	const [topDays, setTopDays] = useState<string>("0");
	const [lines, setLines] = useState<LineRow[]>([newLine()]);

	const [state, formAction, pending] = useActionState<
		PurchaseFormState,
		FormData
	>(recordPurchaseBatch, undefined);

	useEffect(() => {
		if (state?.success) {
			const baseMsg = `Pembelian disimpan — ${state.movementsCreated} stock movement dibuat`;
			toast.success(
				state.journalEntryRef
					? `${baseMsg} · jurnal ${state.journalEntryRef}`
					: baseMsg,
			);
			setOpen(false);
			setLines([newLine()]);
			setSupplierId("");
			setPaymentMethod("cash");
			setTopDays("0");
			router.refresh();
		}
	}, [state, router]);

	// Auto-fill payment method from supplier default
	useEffect(() => {
		const supplier = suppliers.find((s) => s.id === supplierId);
		if (supplier) {
			setPaymentMethod(supplier.default_payment_term);
			if (supplier.default_payment_term === "top_custom") {
				setTopDays(String(supplier.default_top_days));
			} else if (supplier.default_payment_term === "cash") {
				setTopDays("0");
			}
		}
	}, [supplierId, suppliers]);

	const itemsById = useMemo(() => {
		const m = new Map<string, PembelianItemOption>();
		for (const it of items) m.set(it.id, it);
		return m;
	}, [items]);

	function updateLine(id: string, patch: Partial<LineRow>) {
		setLines((curr) =>
			curr.map((l) => (l.id === id ? { ...l, ...patch } : l)),
		);
	}
	function removeLine(id: string) {
		setLines((curr) => (curr.length > 1 ? curr.filter((l) => l.id !== id) : curr));
	}

	const total = lines.reduce((sum, l) => {
		const q = Number(l.quantity);
		const p = Number(l.unit_cost);
		return Number.isFinite(q) && Number.isFinite(p) ? sum + q * p : sum;
	}, 0);

	const validLines = lines.filter(
		(l) =>
			l.item_id &&
			Number(l.quantity) > 0 &&
			Number(l.unit_cost) >= 0 &&
			l.quantity_unit,
	);

	const formError = state?.errors?._form?.[0];
	const lineError = state?.errors?.lines?.[0];

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{/* Render trigger as a child that opens the dialog when clicked */}
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="contents"
				aria-label="Buka catat pembelian"
			>
				{trigger}
			</button>

			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShoppingCart className="size-5 text-primary" />
						Catat Pembelian
					</DialogTitle>
					<DialogDescription>
						Catat belanja multi-item dalam 1 transaksi. Setiap baris jadi 1
						stock movement (direction=in, source=purchase).
					</DialogDescription>
				</DialogHeader>

				<form
					action={(fd) => {
						fd.set(
							"lines",
							JSON.stringify(
								validLines.map((l) => ({
									item_id: l.item_id,
									quantity: Number(l.quantity),
									quantity_unit: l.quantity_unit,
									unit_cost: Number(l.unit_cost),
									notes: l.notes || undefined,
								})),
							),
						);
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

					<div className="grid gap-3 sm:grid-cols-2">
						<Field label="Tanggal Pembelian" name="purchase_date" required>
							<input
								type="date"
								id="purchase_date"
								name="purchase_date"
								defaultValue={new Date().toISOString().slice(0, 10)}
								required
								className="h-10 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
							/>
						</Field>
						<Field label="Supplier" name="supplier_id" hint="opsional — kosongin kalau warung dadakan">
							<Combobox
								id="supplier_id"
								value={supplierId}
								onValueChange={(v) => setSupplierId(v ?? "")}
								options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
								placeholder="— pilih atau biarkan kosong —"
								allowFreeText={false}
							/>
							<input type="hidden" name="supplier_id" value={supplierId} />
						</Field>
					</div>

					<div className="grid gap-3 sm:grid-cols-3">
						<Field label="Metode Pembayaran" name="payment_method">
							<Combobox
								id="payment_method"
								value={paymentMethod}
								onValueChange={(v) => setPaymentMethod(v ?? "cash")}
								options={PAYMENT_OPTIONS}
								allowFreeText={false}
							/>
							<input type="hidden" name="payment_method" value={paymentMethod} />
						</Field>
						{paymentMethod === "top_custom" && (
							<Field label="TOP (hari)" name="top_days">
								<NumberField
									id="top_days"
									name="top_days"
									min={1}
									max={365}
									step={1}
									value={topDays}
									onChange={(e) => setTopDays(e.target.value)}
									placeholder="30"
								/>
							</Field>
						)}
						<Field label="No. Invoice" name="invoice_no" hint="opsional">
							<input
								type="text"
								id="invoice_no"
								name="invoice_no"
								maxLength={60}
								placeholder="mis. INV-2026-0042"
								className="h-10 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
							/>
						</Field>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label className="text-sm font-medium">Daftar Belanja</label>
							<button
								type="button"
								onClick={() => setLines((l) => [...l, newLine()])}
								className="press-down inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 text-[12px] font-medium hover:bg-surface-3"
							>
								<Plus className="size-3.5" /> Tambah Baris
							</button>
						</div>
						{lineError && (
							<p className="text-xs text-destructive">{lineError}</p>
						)}
						<div className="space-y-2">
							{lines.map((line) => {
								const item = itemsById.get(line.item_id);
								const unitOptions = item?.unit_conversion
									? Object.keys(item.unit_conversion)
									: item
										? [item.unit]
										: [];
								const subtotal =
									Number(line.quantity) * Number(line.unit_cost);
								return (
									<div
										key={line.id}
										className="grid gap-2 rounded-md border border-border-default bg-surface-2 p-2.5 sm:grid-cols-[2fr_1fr_auto_1fr_auto_auto] sm:items-end"
									>
										<div className="sm:col-span-1">
											<Combobox
												id={`item-${line.id}`}
												value={line.item_id}
												onValueChange={(v) => {
													const chosen = itemsById.get(v ?? "");
													updateLine(line.id, {
														item_id: v ?? "",
														quantity_unit: chosen?.unit ?? "",
													});
												}}
												options={items.map((i) => ({
													value: i.id,
													label: `${i.name} (${i.sku})`,
												}))}
												placeholder="Pilih bahan..."
												allowFreeText={false}
											/>
										</div>
										<div>
											<NumberField
												id={`qty-${line.id}`}
												name={`qty-${line.id}`}
												min={0.0001}
												step={item?.unit === "roll" ? 0.01 : 1}
												value={line.quantity}
												onChange={(e) =>
													updateLine(line.id, { quantity: e.target.value })
												}
												placeholder="QTY"
											/>
										</div>
										<div className="w-24">
											{unitOptions.length > 1 ? (
												<Combobox
													id={`unit-${line.id}`}
													value={line.quantity_unit}
													onValueChange={(v) =>
														updateLine(line.id, {
															quantity_unit: v ?? item?.unit ?? "",
														})
													}
													options={unitOptions.map((u) => ({
														value: u,
														label: u,
													}))}
													allowFreeText={false}
												/>
											) : (
												<div className="flex h-10 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[12px] text-muted-foreground">
													{line.quantity_unit || "—"}
												</div>
											)}
										</div>
										<div className="relative">
											<span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
												Rp
											</span>
											<NumberField
												id={`cost-${line.id}`}
												name={`cost-${line.id}`}
												min={0}
												step={1}
												value={line.unit_cost}
												onChange={(e) =>
													updateLine(line.id, { unit_cost: e.target.value })
												}
												placeholder="Harga /unit"
												className="pl-7"
											/>
										</div>
										<div className="hidden text-right text-fluid-caption tabular text-muted-foreground sm:block">
											{Number.isFinite(subtotal) && subtotal > 0
												? formatRupiah(subtotal)
												: "—"}
										</div>
										<button
											type="button"
											onClick={() => removeLine(line.id)}
											disabled={lines.length === 1}
											title="Hapus baris"
											className="press-down inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
										>
											<Trash2 className="size-4" />
										</button>
									</div>
								);
							})}
						</div>
					</div>

					<Field label="Catatan" name="notes" hint="opsional — patah, retur, dll">
						<TextareaField
							id="notes"
							name="notes"
							rows={2}
							maxLength={500}
						/>
					</Field>

					<div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-fluid-caption">
						<span className="font-medium text-foreground">Total Pembelian</span>
						<span className="tabular text-fluid-h3 font-semibold text-emerald-700 dark:text-emerald-300">
							{formatRupiah(total)}
						</span>
					</div>

					{total > 0 && (
						<div
							className={`rounded-md border p-2.5 text-[12px] ${
								paymentMethod === "cash"
									? "border-sky-500/30 bg-sky-500/5"
									: "border-amber-500/30 bg-amber-500/5"
							}`}
						>
							<div
								className={`mb-0.5 font-semibold ${
									paymentMethod === "cash"
										? "text-sky-700 dark:text-sky-300"
										: "text-amber-700 dark:text-amber-300"
								}`}
							>
								{paymentMethod === "cash"
									? "Jurnal otomatis: Kas Tunai turun"
									: "Jurnal otomatis: Hutang Vendor naik"}
							</div>
							<div className="text-muted-foreground">
								{paymentMethod === "cash" ? (
									<>
										DEBIT Persediaan{" "}
										<span className="tabular text-foreground">
											{formatRupiah(total)}
										</span>{" "}
										· CREDIT Kas Tunai (1-100){" "}
										<span className="tabular text-foreground">
											{formatRupiah(total)}
										</span>
									</>
								) : (
									<>
										DEBIT Persediaan{" "}
										<span className="tabular text-foreground">
											{formatRupiah(total)}
										</span>{" "}
										· CREDIT Hutang Vendor (2-101){" "}
										<span className="tabular text-foreground">
											{formatRupiah(total)}
										</span>
									</>
								)}
							</div>
						</div>
					)}

					<DialogFooter>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="inline-flex h-10 items-center rounded-md border border-border-default bg-surface-2 px-4 text-sm font-medium hover:bg-muted"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending || validLines.length === 0}
							className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
						>
							{pending
								? "Menyimpan…"
								: `Simpan ${validLines.length} baris`}
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
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
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
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}
