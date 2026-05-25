"use client";

import { useActionState, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import {
	createItem,
	type ItemFormState,
	updateItem,
} from "@/lib/actions/items";

type Defaults = {
	sku: string;
	name: string;
	category: "inventory" | "fixed_asset";
	unit: string;
	min_stock_alert: string;
	purchase_price_avg: string;
	purchase_price: string;
	purchase_date: string;
	useful_life_months: string;
	condition: string;
	current_location: string;
	notes: string;
	is_active: boolean;
};

const EMPTY: Defaults = {
	sku: "",
	name: "",
	category: "inventory",
	unit: "pcs",
	min_stock_alert: "0",
	purchase_price_avg: "0",
	purchase_price: "",
	purchase_date: "",
	useful_life_months: "",
	condition: "normal",
	current_location: "gudang_pusat",
	notes: "",
	is_active: true,
};

const CONDITION_OPTIONS: Array<[string, string]> = [
	["normal", "Normal"],
	["service", "Service"],
	["damaged", "Damaged"],
	["lost", "Lost"],
];

const LOCATION_OPTIONS: Array<[string, string]> = [
	["gudang_pusat", "Gudang Pusat"],
	["event", "Sedang di Event"],
	["service_center", "Service Center"],
	["crew_carry", "Dibawa Crew"],
	["lost", "Lost"],
];

export function ItemForm({
	mode,
	id,
	defaults = EMPTY,
	returnTo,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: Defaults;
	/** Server actions read this to decide redirect destination after success.
	 *  Allow-list checked server-side — see `safeReturnTo` in actions/items.ts. */
	returnTo?: "/settings/items" | "/warehouse";
}) {
	const action =
		mode === "create" ? createItem : updateItem.bind(null, id ?? "");
	const [state, formAction, pending] = useActionState<ItemFormState, FormData>(
		action,
		undefined,
	);

	const [category, setCategory] = useState<"inventory" | "fixed_asset">(
		defaults.category,
	);
	const [condition, setCondition] = useState<string>(defaults.condition);
	const [currentLocation, setCurrentLocation] = useState<string>(
		defaults.current_location,
	);
	const [purchaseDate, setPurchaseDate] = useState<string>(
		defaults.purchase_date,
	);

	const get = (key: keyof Defaults, fallback?: string) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return fallback ?? String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const isEquipment = category === "fixed_asset";

	return (
		<form action={formAction} className="space-y-5">
			{returnTo ? (
				<input type="hidden" name="return_to" value={returnTo} />
			) : null}
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="SKU"
					name="sku"
					error={err("sku")}
					hint="Huruf kapital, angka, hyphen. Contoh: ITM-SLEEVE-2R"
					required
				>
					<input
						type="text"
						name="sku"
						required
						defaultValue={get("sku")}
						placeholder="ITM-SLEEVE-2R"
						className={`${inputClass} font-mono uppercase`}
						readOnly={mode === "edit"}
					/>
				</Field>

				<Field
					label="Kategori"
					name="category"
					error={err("category")}
					required
				>
					<NativeSelect
						value={category}
						onValueChange={(v) =>
							setCategory(v as "inventory" | "fixed_asset")
						}
						options={[
							{ value: "inventory", label: "Persediaan" },
							{ value: "fixed_asset", label: "Aset Tetap" },
						]}
						triggerClassName="w-full"
						aria-invalid={!!err("category")}
					/>
					<input
						type="hidden"
						name="category"
						value={category}
						required
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

			<div className="grid gap-4 sm:grid-cols-3">
				<Field label="Unit" name="unit" error={err("unit")} required>
					<input
						type="text"
						name="unit"
						required
						defaultValue={get("unit")}
						placeholder="pcs / box / set"
						className={inputClass}
					/>
				</Field>

				{!isEquipment && (
					<>
						<Field
							label="Min Stock Alert"
							name="min_stock_alert"
							error={err("min_stock_alert")}
							hint="Trigger alert kalau stok ≤ angka ini"
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
							label="Avg Cost (Rp)"
							name="purchase_price_avg"
							error={err("purchase_price_avg")}
							hint="Harga rata-rata pembelian"
						>
							<input
								type="number"
								name="purchase_price_avg"
								min={0}
								step={1}
								defaultValue={get("purchase_price_avg")}
								className={`${inputClass} tabular`}
							/>
						</Field>
					</>
				)}

				{/* Hidden fallback fields for equipment so server gets defaults */}
				{isEquipment && (
					<>
						<input
							type="hidden"
							name="min_stock_alert"
							value={get("min_stock_alert", "0")}
						/>
						<input
							type="hidden"
							name="purchase_price_avg"
							value={get("purchase_price_avg", "0")}
						/>
					</>
				)}
			</div>

			{isEquipment && (
				<div className="border-border-default bg-muted/20 space-y-4 rounded-md border p-4">
					<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
						Equipment-only
					</p>

					<div className="grid gap-4 sm:grid-cols-3">
						<Field
							label="Harga Beli (Rp)"
							name="purchase_price"
							error={err("purchase_price")}
						>
							<input
								type="number"
								name="purchase_price"
								min={0}
								step={1}
								defaultValue={get("purchase_price")}
								className={`${inputClass} tabular`}
							/>
						</Field>

						<Field
							label="Tanggal Beli"
							name="purchase_date"
							error={err("purchase_date")}
						>
							<DatePicker
								value={purchaseDate}
								onValueChange={setPurchaseDate}
								placeholder="Pilih tanggal"
								aria-invalid={!!err("purchase_date")}
							/>
							<input
								type="hidden"
								name="purchase_date"
								value={purchaseDate}
							/>
						</Field>

						<Field
							label="Useful Life (bulan)"
							name="useful_life_months"
							error={err("useful_life_months")}
							hint="Untuk depresiasi"
						>
							<input
								type="number"
								name="useful_life_months"
								min={1}
								step={1}
								defaultValue={get("useful_life_months")}
								className={`${inputClass} tabular`}
							/>
						</Field>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Kondisi" name="condition" error={err("condition")}>
							<NativeSelect
								value={condition}
								onValueChange={setCondition}
								options={CONDITION_OPTIONS.map(([v, l]) => ({
									value: v,
									label: l,
								}))}
								triggerClassName="w-full"
							/>
							<input
								type="hidden"
								name="condition"
								value={condition}
							/>
						</Field>

						<Field
							label="Lokasi Saat Ini"
							name="current_location"
							error={err("current_location")}
						>
							<NativeSelect
								value={currentLocation}
								onValueChange={setCurrentLocation}
								options={LOCATION_OPTIONS.map(([v, l]) => ({
									value: v,
									label: l,
								}))}
								triggerClassName="w-full"
							/>
							<input
								type="hidden"
								name="current_location"
								value={currentLocation}
							/>
						</Field>
					</div>
				</div>
			)}

			{!isEquipment && (
				<>
					<input type="hidden" name="condition" value="" />
					<input type="hidden" name="current_location" value="" />
					<input type="hidden" name="purchase_price" value="" />
					<input type="hidden" name="purchase_date" value="" />
					<input type="hidden" name="useful_life_months" value="" />
				</>
			)}

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

			<div className="flex justify-end pt-2">
				<button
					type="submit"
					disabled={pending}
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Buat item"
							: "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none read-only:opacity-70";
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
