"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import type { AddonFormState, AddonInput } from "@/lib/actions/addons";
import { ADDON_CATEGORY_LABELS } from "@/lib/format";

const CATEGORY_OPTIONS = Object.entries(ADDON_CATEGORY_LABELS);

type Action = (
	prev: AddonFormState,
	formData: FormData,
) => Promise<AddonFormState>;

export type AddonDefaults = Partial<{
	name: string;
	category: string;
	unit: string;
	price: number;
	requires_extra_crew: boolean;
	is_active: boolean;
	inventory_item_id: string;
}>;

export type InventoryItemOption = {
	id: string;
	sku: string;
	name: string;
	unit: string;
};

export function AddonForm({
	action,
	defaults,
	inventoryItems = [],
	submitLabel = "Save",
}: {
	action: Action;
	defaults?: AddonDefaults;
	inventoryItems?: InventoryItemOption[];
	submitLabel?: string;
}) {
	const [state, formAction, pending] = useActionState(action, undefined);

	const get = (key: keyof AddonInput) =>
		state?.values?.[key] ??
		(defaults?.[key as keyof AddonDefaults] as
			| string
			| number
			| undefined
		)?.toString() ??
		"";

	const err = (key: keyof AddonInput) => state?.errors?.[key]?.[0];

	return (
		<form action={formAction} className="space-y-5">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<Field label="Nama Add-on" name="name" error={err("name")} required>
				<input
					type="text"
					name="name"
					required
					defaultValue={get("name")}
					placeholder="cth. Voucher Reprint 2R"
					className={inputClass}
				/>
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Kategori"
					name="category"
					error={err("category")}
					required
				>
					<AddonCategorySelect
						defaultValue={get("category")}
						error={!!err("category")}
					/>
				</Field>

				<Field label="Unit" name="unit" error={err("unit")} required>
					<input
						type="text"
						name="unit"
						required
						defaultValue={get("unit")}
						placeholder="pcs / jam / sesi"
						className={inputClass}
					/>
				</Field>
			</div>

			<Field
				label="Harga (IDR)"
				name="price"
				error={err("price")}
				hint="0 untuk add-on gratis"
				required
			>
				<input
					type="number"
					name="price"
					min={0}
					step={1}
					required
					defaultValue={get("price")}
					placeholder="50000"
					className={`${inputClass} tabular`}
				/>
			</Field>

			<Field
				label="Link ke Inventory (opsional)"
				name="inventory_item_id"
				error={err("inventory_item_id")}
				hint="Kalau add-on ini consume stock fisik (cth. magnet, keychain, sleeve), link ke item warehouse-nya. Wajib di-set kalau mau bonus item ini auto-deduct stok + masuk HPP saat rekap approved."
			>
				<InventoryItemSelect
					defaultValue={get("inventory_item_id")}
					options={inventoryItems}
					error={!!err("inventory_item_id")}
				/>
			</Field>

			<label className="border-border-default bg-surface-2 flex items-center gap-3 rounded-md border p-3">
				<input
					type="checkbox"
					name="requires_extra_crew"
					defaultChecked={
						state?.values
							? state.values.requires_extra_crew === "on"
							: (defaults?.requires_extra_crew ?? false)
					}
					className="text-primary h-4 w-4 rounded"
				/>
				<div className="space-y-0.5">
					<div className="text-sm font-medium">Butuh extra crew</div>
					<div className="text-muted-foreground text-xs">
						Centang kalau add-on ini perlu personel tambahan saat event.
					</div>
				</div>
			</label>

			<label className="border-border-default bg-surface-2 flex items-center gap-3 rounded-md border p-3">
				<input
					type="checkbox"
					name="is_active"
					defaultChecked={
						state?.values
							? state.values.is_active === "on"
							: (defaults?.is_active ?? true)
					}
					className="text-primary h-4 w-4 rounded"
				/>
				<div className="space-y-0.5">
					<div className="text-sm font-medium">Aktif</div>
					<div className="text-muted-foreground text-xs">
						Hanya add-on aktif yang muncul di booking baru.
					</div>
				</div>
			</label>

			<div className="border-border-default flex items-center justify-end gap-3 border-t pt-5">
				<Link
					href="/settings/addons"
					className="border-border-default bg-surface-2 hover:bg-muted h-10 rounded-md border px-4 text-sm font-medium leading-10"
				>
					Cancel
				</Link>
				<button
					type="submit"
					disabled={pending}
					className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending ? "Menyimpan…" : submitLabel}
				</button>
			</div>
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
const selectClass = `${inputClass} appearance-none`;

function AddonCategorySelect({
	defaultValue,
	error,
}: {
	defaultValue: string;
	error: boolean;
}) {
	const [category, setCategory] = useState(defaultValue);
	return (
		<>
			<NativeSelect
				value={category}
				onValueChange={setCategory}
				placeholder="Pilih kategori…"
				options={CATEGORY_OPTIONS.map(([value, label]) => ({
					value,
					label,
				}))}
				triggerClassName="w-full"
				aria-invalid={error}
			/>
			<input type="hidden" name="category" value={category} required />
		</>
	);
}

function InventoryItemSelect({
	defaultValue,
	options,
	error,
}: {
	defaultValue: string;
	options: InventoryItemOption[];
	error: boolean;
}) {
	const [value, setValue] = useState(defaultValue);
	const selectOptions = [
		{ value: "", label: "— tidak di-link (no stock tracking) —" },
		...options.map((it) => ({
			value: it.id,
			label: `${it.sku} · ${it.name}${it.unit ? ` (${it.unit})` : ""}`,
		})),
	];
	return (
		<>
			<NativeSelect
				value={value}
				onValueChange={setValue}
				placeholder="Pilih item inventory…"
				options={selectOptions}
				triggerClassName="w-full"
				aria-invalid={error}
			/>
			<input type="hidden" name="inventory_item_id" value={value} />
		</>
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
