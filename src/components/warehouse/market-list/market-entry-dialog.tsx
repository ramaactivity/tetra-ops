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
			? `Master cost saat ini ${formatRupiah(item.purchase_price_avg)} / ${item.unit} → akan di-update ke ${formatRupiah(Math.round(effective))} / ${item.unit}`
			: null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden">
				<DialogHeader className="px-7 pt-6 pb-4 bg-surface-1">
					<DialogTitle className="text-lg font-semibold tracking-tight">
						{mode === "create" ? "Tambah Harga Supplier" : "Edit Harga Supplier"}
					</DialogTitle>
					<DialogDescription className="text-[13px] text-muted-foreground">
						<span className="font-medium text-foreground">{item.name}</span> ·
						catat harga belanja dari supplier. Tag Primary untuk auto-sync
						master cost.
					</DialogDescription>
				</DialogHeader>

				<form action={formAction} className="px-7 pb-6 pt-2 space-y-6">
					{formError && (
						<div className="rounded-lg bg-destructive/10 p-3.5 ring-1 ring-destructive/30">
							<p className="text-sm font-medium text-destructive">
								{formError}
							</p>
						</div>
					)}

					{entry?.id && <input type="hidden" name="id" value={entry.id} />}
					<input type="hidden" name="item_id" value={item.id} />

					<div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
						{/* Left column — form fields */}
						<div className="space-y-5">
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
									options={suppliers.map((s) => ({
										value: s.id,
										label: s.name,
									}))}
									placeholder="— pilih supplier —"
									allowFreeText={false}
								/>
								<input type="hidden" name="supplier_id" value={supplierId} />
							</Field>

							<div className="grid gap-4 sm:grid-cols-12">
								<div className="sm:col-span-5">
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
								</div>
								<div className="sm:col-span-3">
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
								</div>
								<div className="sm:col-span-4">
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
										<input
											type="hidden"
											name="pack_unit"
											value={packUnit}
										/>
									</Field>
								</div>
							</div>

							<Field
								label="Catatan"
								name="notes"
								error={err("notes")}
								hint="opsional — promo, lebaran, kontrak"
							>
								<TextareaField
									id="notes"
									name="notes"
									rows={3}
									maxLength={300}
									defaultValue={entry?.notes ?? ""}
								/>
							</Field>
						</div>

						{/* Right column — live preview + primary toggle */}
						<aside className="space-y-4">
							<div className="rounded-xl bg-surface-1 p-5 shadow-sm">
								<div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
									Effective cost
								</div>
								<div
									className={`mt-2 text-xl font-semibold tabular ${
										effective > 0
											? "text-sky-700 dark:text-sky-300"
											: "text-muted-foreground/60"
									}`}
								>
									{effective > 0
										? formatRupiah(Math.round(effective))
										: "Rp —"}
									<span className="ml-1 text-xs font-normal text-muted-foreground">
										/ {item.unit}
									</span>
								</div>
								<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
									Preview otomatis update saat ngetik harga / size / unit.
								</p>
							</div>

							<label
								className={`block cursor-pointer rounded-xl p-5 transition-all ${
									isPrimary
										? "bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/30"
										: "bg-surface-1 hover:bg-surface-2"
								}`}
							>
								<div className="flex items-start gap-3">
									<input
										type="checkbox"
										name="is_primary"
										value="true"
										checked={isPrimary}
										onChange={(e) => setIsPrimary(e.target.checked)}
										className="mt-0.5 size-4"
									/>
									<div className="space-y-1">
										<div className="inline-flex items-center gap-1.5 text-sm font-medium">
											<Star
												className={`size-3.5 ${
													isPrimary
														? "fill-emerald-500 text-emerald-500"
														: "text-muted-foreground"
												}`}
											/>
											Set sebagai Primary
										</div>
										<p className="text-[11px] leading-relaxed text-muted-foreground">
											Hanya 1 Primary per bahan. Master cost{" "}
											<code className="rounded bg-surface-3 px-1 py-0.5 text-[10px]">
												purchase_price_avg
											</code>{" "}
											akan ikut effective cost di sini.
										</p>
										{willSyncMessage && (
											<p className="mt-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
												{willSyncMessage}
											</p>
										)}
									</div>
								</div>
							</label>
						</aside>
					</div>

					<DialogFooter className="border-t border-foreground/5 pt-5 -mx-7 px-7 -mb-6 pb-5 bg-surface-1/40">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="press-down inline-flex h-10 items-center rounded-md bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending || !supplierId}
							className="press-down inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
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
