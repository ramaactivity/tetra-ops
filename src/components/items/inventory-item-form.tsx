"use client";

import { Info, Wand2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import {
	createInventoryItem,
	type InventoryItemFormState,
	updateInventoryItem,
} from "@/lib/actions/items-inventory";
import { generateInventorySku } from "@/lib/inventory/sku-generator";
import { Field, inputClass, SectionHeader } from "./item-form-primitives";

export type InventoryItemDefaults = {
	name: string;
	sku: string;
	base_unit: string;
	purchase_unit: string;
	conversion_factor: string;
	min_stock_alert: string;
	is_bom_component: boolean;
	notes: string;
	is_active: boolean;
	// Read-only avg cost (only meaningful on edit)
	purchase_price_avg?: number;
};

export const EMPTY_INVENTORY_DEFAULTS: InventoryItemDefaults = {
	name: "",
	sku: "",
	base_unit: "pcs",
	purchase_unit: "",
	conversion_factor: "",
	min_stock_alert: "0",
	is_bom_component: false,
	notes: "",
	is_active: true,
	purchase_price_avg: 0,
};

const UNIT_OPTIONS = [
	{ value: "pcs", label: "Pcs (Pieces)" },
	{ value: "box", label: "Box" },
	{ value: "pack", label: "Pack" },
	{ value: "roll", label: "Roll" },
	{ value: "sheet", label: "Sheet / Lembar" },
];

const PURCHASE_UNIT_OPTIONS = [
	{ value: "", label: "— Sama dengan unit penggunaan —" },
	...UNIT_OPTIONS,
];

export function InventoryItemForm({
	mode,
	id,
	defaults = EMPTY_INVENTORY_DEFAULTS,
	returnTo,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: InventoryItemDefaults;
	returnTo?: "/settings/items" | "/warehouse";
}) {
	const action =
		mode === "create"
			? createInventoryItem
			: updateInventoryItem.bind(null, id ?? "");
	const [state, formAction, pending] = useActionState<
		InventoryItemFormState,
		FormData
	>(action, undefined);

	const get = (key: keyof InventoryItemDefaults, fallback?: string) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		const def = defaults[key];
		return fallback ?? (typeof def === "boolean" ? "" : String(def ?? ""));
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	// State pieces driving auto-SKU + conversion display
	const [name, setName] = useState<string>(get("name"));
	const [skuOverride, setSkuOverride] = useState<string>(
		mode === "edit" ? defaults.sku : "",
	);
	const [skuEditable, setSkuEditable] = useState<boolean>(mode === "edit");
	const [baseUnit, setBaseUnit] = useState<string>(get("base_unit"));
	const [purchaseUnit, setPurchaseUnit] = useState<string>(get("purchase_unit"));
	const [conversionFactor, setConversionFactor] = useState<string>(
		get("conversion_factor"),
	);
	const [isBomComponent, setIsBomComponent] = useState<boolean>(
		state?.values?.is_bom_component !== undefined
			? state.values.is_bom_component === "on"
			: defaults.is_bom_component,
	);

	const generatedSku = useMemo(
		() => (name.trim() ? generateInventorySku(name) : ""),
		[name],
	);
	const effectiveSku = skuEditable
		? skuOverride || generatedSku
		: generatedSku;

	const needsConversion = !!purchaseUnit && purchaseUnit !== baseUnit;
	const factorNum = Number(conversionFactor);
	const conversionPreview =
		needsConversion && Number.isFinite(factorNum) && factorNum > 0
			? `1 ${prettyUnit(purchaseUnit)} = ${factorNum.toLocaleString("id-ID")} ${prettyUnit(baseUnit)}`
			: null;

	return (
		<form action={formAction} className="space-y-6">
			{returnTo && <input type="hidden" name="return_to" value={returnTo} />}

			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			{/* ── Identitas ─────────────────────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader title="Identitas" />

				<Field label="Nama Item" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Mediaset Basic Roll, Sleeve 4R, Flashdisk 8GB…"
						className={inputClass}
						autoFocus={mode === "create"}
					/>
				</Field>

				{/* Auto-SKU preview */}
				<div className="rounded-md bg-surface-3 px-3 py-2.5 text-[12px]">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Wand2 className="size-3.5 text-muted-foreground" />
							<span className="text-muted-foreground">SKU otomatis:</span>
							<span className="font-mono text-sm font-semibold text-foreground">
								{effectiveSku || "—"}
							</span>
						</div>
						{mode === "create" && (
							<button
								type="button"
								onClick={() => setSkuEditable((v) => !v)}
								className="text-[11px] text-muted-foreground underline hover:text-foreground"
							>
								{skuEditable ? "Pakai otomatis" : "Edit manual"}
							</button>
						)}
					</div>
					{skuEditable && mode === "create" && (
						<input
							type="text"
							value={skuOverride}
							onChange={(e) =>
								setSkuOverride(e.target.value.toUpperCase())
							}
							placeholder={generatedSku}
							className={`${inputClass} mt-2 font-mono uppercase`}
						/>
					)}
					{err("sku_override") && (
						<p className="text-destructive mt-1 text-[11px]">
							{err("sku_override")}
						</p>
					)}
					<input
						type="hidden"
						name="sku_override"
						value={skuEditable ? skuOverride : ""}
					/>
				</div>
			</div>

			{/* ── Unit & Konversi ──────────────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader
					title="Unit & Konversi"
					subtitle="Beli dalam unit besar, pakai dalam unit kecil. Sistem otomatis konversi."
				/>

				<div className="grid gap-4 md:grid-cols-3">
					<Field
						label="Unit Penggunaan"
						name="base_unit"
						error={err("base_unit")}
						hint="Satuan terkecil saat dipakai event (yg dihitung di rekap)"
						required
					>
						<NativeSelect
							value={baseUnit}
							onValueChange={setBaseUnit}
							options={UNIT_OPTIONS}
							triggerClassName="w-full"
						/>
						<input type="hidden" name="base_unit" value={baseUnit} />
					</Field>

					<Field
						label="Unit Pembelian"
						name="purchase_unit"
						error={err("purchase_unit")}
						hint="Satuan saat beli ke supplier"
					>
						<NativeSelect
							value={purchaseUnit}
							onValueChange={setPurchaseUnit}
							options={PURCHASE_UNIT_OPTIONS}
							triggerClassName="w-full"
						/>
						<input type="hidden" name="purchase_unit" value={purchaseUnit} />
					</Field>

					<Field
						label="Faktor Konversi"
						name="conversion_factor"
						error={err("conversion_factor")}
						hint={
							needsConversion
								? `Berapa ${prettyUnit(baseUnit)} dalam 1 ${prettyUnit(purchaseUnit)}?`
								: "Tidak perlu kalau unit beli = unit pakai"
						}
					>
						<input
							type="number"
							name="conversion_factor"
							min={0.0001}
							step="any"
							value={conversionFactor}
							onChange={(e) => setConversionFactor(e.target.value)}
							disabled={!needsConversion}
							placeholder={needsConversion ? "1000" : "—"}
							className={`${inputClass} tabular`}
						/>
					</Field>
				</div>

				{conversionPreview && (
					<div className="rounded-md bg-sky-500/10 px-3 py-2 text-[12px] text-sky-900 dark:text-sky-100">
						<Info className="mr-1.5 inline size-3.5" />
						{conversionPreview}. Beli 5 {prettyUnit(purchaseUnit)} = otomatis +
						<strong className="tabular">
							{" "}
							{(factorNum * 5).toLocaleString("id-ID")} {prettyUnit(baseUnit)}
						</strong>{" "}
						stok.
					</div>
				)}
			</div>

			{/* ── Pengaturan Stok & Harga ─────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader title="Pengaturan Stok" />

				<div className="grid gap-4 md:grid-cols-2">
					<Field
						label="Alert Stok Rendah"
						name="min_stock_alert"
						error={err("min_stock_alert")}
						hint="Notifikasi muncul kalau stok ≤ angka ini. 0 = matikan alert"
					>
						<input
							type="number"
							name="min_stock_alert"
							min={0}
							step={1}
							defaultValue={get("min_stock_alert")}
							className={`${inputClass} tabular`}
						/>
					</Field>

					<div className="space-y-1.5">
						<label className="text-sm font-medium">
							Average Cost (otomatis)
						</label>
						<div className="rounded-md bg-surface-3 px-3 py-2.5">
							<div className="tabular text-sm font-semibold text-foreground">
								Rp{" "}
								{(defaults.purchase_price_avg ?? 0).toLocaleString("id-ID")}{" "}
								<span className="text-muted-foreground font-normal">
									/ {prettyUnit(baseUnit)}
								</span>
							</div>
							<p className="text-muted-foreground mt-0.5 text-[11px]">
								Auto-update tiap kali kamu catat pembelian baru di modul
								Pembelian. Tidak perlu diisi manual.
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* ── BOM Component toggle ────────────────────────────────────── */}
			<label className="bg-surface-3 flex cursor-pointer items-start gap-3 rounded-md p-3">
				<input
					type="checkbox"
					name="is_bom_component"
					checked={isBomComponent}
					onChange={(e) => setIsBomComponent(e.target.checked)}
					className="border-border-default accent-primary mt-0.5 h-4 w-4 rounded"
				/>
				<div className="space-y-0.5">
					<div className="text-sm font-medium">
						Bisa dipakai sebagai komponen Bundle / Set
					</div>
					<p className="text-muted-foreground text-[12px]">
						Centang kalau item ini akan jadi bagian dari paket combo
						(mis. FLASHDISK + FD-BOX + POUCH jadi "Set Flashdisk Kemasan").
						Modul Bundle akan filter picker pakai flag ini.
					</p>
				</div>
			</label>

			{/* ── Catatan ──────────────────────────────────────────────────── */}
			<Field
				label="Catatan"
				name="notes"
				error={err("notes")}
				hint="Opsional — spec, supplier rekomendasi, info handling"
			>
				<textarea
					name="notes"
					rows={2}
					maxLength={500}
					defaultValue={get("notes")}
					className={`${inputClass} resize-none`}
				/>
			</Field>

			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					name="is_active"
					defaultChecked={
						state?.values?.is_active !== undefined
							? state.values.is_active === "on"
							: defaults.is_active
					}
					className="border-border-default accent-primary h-4 w-4 rounded"
				/>
				<span className="font-medium">Aktif</span>
				<span className="text-muted-foreground text-xs">
					— item nonaktif tidak muncul di Warehouse / lookup
				</span>
			</label>

			<div className="flex items-center justify-end gap-3 pt-2">
				<p className="text-muted-foreground mr-auto text-[11px]">
					Akun akuntansi otomatis di-mapping (bisa di-edit Rama dari Finance).
				</p>
				<button
					type="submit"
					disabled={pending || !name.trim()}
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-5 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Buat Persediaan"
							: "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}

function prettyUnit(u: string): string {
	if (!u) return "";
	if (u === "sheet") return "Lembar";
	return u.charAt(0).toUpperCase() + u.slice(1);
}
