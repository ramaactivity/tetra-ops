"use client";

import { useActionState } from "react";
import {
	createInventoryItem,
	type InventoryItemFormState,
	updateInventoryItem,
} from "@/lib/actions/items-inventory";
import { defaultsForInventorySku } from "@/lib/inventory/coa-defaults";
import { Field, inputClass, SectionHeader } from "./item-form-primitives";

export type InventoryItemDefaults = {
	sku: string;
	name: string;
	base_unit: string;
	min_stock_alert: string;
	selling_price: string;
	coa_account_inventory: string;
	coa_account_cogs: string;
	coa_account_wastage: string;
	notes: string;
	is_active: boolean;
};

export const EMPTY_INVENTORY_DEFAULTS: InventoryItemDefaults = {
	sku: "",
	name: "",
	base_unit: "pcs",
	min_stock_alert: "0",
	selling_price: "",
	coa_account_inventory: "",
	coa_account_cogs: "",
	coa_account_wastage: "",
	notes: "",
	is_active: true,
};

export function InventoryItemForm({
	mode,
	id,
	defaults = EMPTY_INVENTORY_DEFAULTS,
	returnTo,
	onBack,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: InventoryItemDefaults;
	returnTo?: "/settings/items" | "/warehouse";
	onBack?: () => void;
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
		return fallback ?? String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	// Auto-suggest COA defaults when SKU is filled and user hasn't customized
	const skuValue = get("sku");
	const suggestedCoa = skuValue
		? defaultsForInventorySku(skuValue)
		: { inventory: "", cogs: "", wastage: "5-510" };

	return (
		<form action={formAction} className="space-y-5">
			{returnTo && <input type="hidden" name="return_to" value={returnTo} />}

			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="space-y-4">
				<SectionHeader title="Identitas" />

				<div className="grid gap-4 sm:grid-cols-2">
					<Field
						label="SKU"
						name="sku"
						error={err("sku")}
						hint="Huruf kapital, angka, hyphen. Contoh: SLEEVE-2R"
						required
					>
						<input
							type="text"
							name="sku"
							required
							defaultValue={get("sku")}
							placeholder="SLEEVE-2R"
							className={`${inputClass} font-mono uppercase`}
							readOnly={mode === "edit"}
						/>
					</Field>

					<Field
						label="Unit Dasar"
						name="base_unit"
						error={err("base_unit")}
						hint="Satuan terkecil yg disimpan di stok (pcs, roll, dst.)"
						required
					>
						<input
							type="text"
							name="base_unit"
							required
							defaultValue={get("base_unit")}
							placeholder="pcs / roll / box"
							className={inputClass}
						/>
					</Field>
				</div>

				<Field label="Nama" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						defaultValue={get("name")}
						placeholder="Sleeve 2R"
						className={inputClass}
					/>
				</Field>
			</div>

			<div className="space-y-4">
				<SectionHeader
					title="Pengaturan Stok"
					subtitle="Alert + harga jual (jika dipasarkan)"
				/>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field
						label="Min Stock Alert"
						name="min_stock_alert"
						error={err("min_stock_alert")}
						hint="Notifikasi muncul kalau stok ≤ angka ini"
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

					<Field
						label="Harga Jual (Rp)"
						name="selling_price"
						error={err("selling_price")}
						hint="Opsional — kosongkan jika tidak dijual"
					>
						<input
							type="number"
							name="selling_price"
							min={0}
							step={1}
							defaultValue={get("selling_price")}
							placeholder="—"
							className={`${inputClass} tabular`}
						/>
					</Field>
				</div>
			</div>

			<div className="space-y-4">
				<SectionHeader
					title="Mapping Akun (COA)"
					subtitle={`Default per SKU prefix; bisa di-override. Kosongkan untuk pakai default sistem (${suggestedCoa.inventory || "1-209"} / ${suggestedCoa.cogs || "5-109"} / ${suggestedCoa.wastage}).`}
				/>

				<div className="grid gap-4 sm:grid-cols-3">
					<Field
						label="Persediaan"
						name="coa_account_inventory"
						error={err("coa_account_inventory")}
						hint="Asset 1-2xx"
					>
						<input
							type="text"
							name="coa_account_inventory"
							defaultValue={get("coa_account_inventory")}
							placeholder={suggestedCoa.inventory || "1-209"}
							className={`${inputClass} font-mono`}
						/>
					</Field>

					<Field
						label="HPP (COGS)"
						name="coa_account_cogs"
						error={err("coa_account_cogs")}
						hint="Expense 5-1xx"
					>
						<input
							type="text"
							name="coa_account_cogs"
							defaultValue={get("coa_account_cogs")}
							placeholder={suggestedCoa.cogs || "5-109"}
							className={`${inputClass} font-mono`}
						/>
					</Field>

					<Field
						label="Wastage"
						name="coa_account_wastage"
						error={err("coa_account_wastage")}
						hint="Expense 5-510"
					>
						<input
							type="text"
							name="coa_account_wastage"
							defaultValue={get("coa_account_wastage")}
							placeholder={suggestedCoa.wastage}
							className={`${inputClass} font-mono`}
						/>
					</Field>
				</div>
			</div>

			<Field label="Catatan" name="notes" error={err("notes")} hint="Optional">
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

			<div className="flex items-center justify-between pt-2">
				{onBack ? (
					<button
						type="button"
						onClick={onBack}
						className="text-muted-foreground hover:text-foreground text-sm font-medium"
					>
						← Ubah kategori
					</button>
				) : (
					<span />
				)}
				<button
					type="submit"
					disabled={pending}
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
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
