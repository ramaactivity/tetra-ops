"use client";

import { useActionState, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import {
	createFixedAssetItem,
	type FixedAssetItemFormState,
	updateFixedAssetItem,
} from "@/lib/actions/items-fixed-asset";
import { defaultsForFixedAsset } from "@/lib/inventory/coa-defaults";
import { Field, inputClass, SectionHeader } from "./item-form-primitives";

export type FixedAssetItemDefaults = {
	sku: string;
	name: string;
	unit: string;
	asset_number: string;
	serial_number: string;
	purchase_price: string;
	purchase_date: string;
	salvage_value: string;
	useful_life_months: string;
	depreciation_method: string;
	depreciation_start_date: string;
	condition: string;
	current_location: string;
	coa_account_asset: string;
	coa_account_accum_depr: string;
	coa_account_depr_expense: string;
	image_url: string;
	notes: string;
	is_active: boolean;
};

export const EMPTY_FIXED_ASSET_DEFAULTS: FixedAssetItemDefaults = {
	sku: "",
	name: "",
	unit: "unit",
	asset_number: "",
	serial_number: "",
	purchase_price: "0",
	purchase_date: "",
	salvage_value: "0",
	useful_life_months: "",
	depreciation_method: "straight_line",
	depreciation_start_date: "",
	condition: "normal",
	current_location: "gudang_pusat",
	coa_account_asset: "",
	coa_account_accum_depr: "",
	coa_account_depr_expense: "",
	image_url: "",
	notes: "",
	is_active: true,
};

const CONDITION_OPTIONS = [
	{ value: "normal", label: "Normal" },
	{ value: "service", label: "Service" },
	{ value: "damaged", label: "Damaged" },
	{ value: "lost", label: "Lost" },
];

const LOCATION_OPTIONS = [
	{ value: "gudang_pusat", label: "Gudang Pusat" },
	{ value: "event", label: "Sedang di Event" },
	{ value: "service_center", label: "Service Center" },
	{ value: "crew_carry", label: "Dibawa Crew" },
	{ value: "lost", label: "Lost" },
];

const DEPR_OPTIONS = [
	{ value: "straight_line", label: "Garis Lurus (Straight-line)" },
	{ value: "none", label: "Tidak disusutkan" },
];

export function FixedAssetItemForm({
	mode,
	id,
	defaults = EMPTY_FIXED_ASSET_DEFAULTS,
	returnTo,
	onBack,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: FixedAssetItemDefaults;
	returnTo?: "/settings/items" | "/warehouse";
	onBack?: () => void;
}) {
	const action =
		mode === "create"
			? createFixedAssetItem
			: updateFixedAssetItem.bind(null, id ?? "");
	const [state, formAction, pending] = useActionState<
		FixedAssetItemFormState,
		FormData
	>(action, undefined);

	const get = (key: keyof FixedAssetItemDefaults, fallback?: string) => {
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

	const [condition, setCondition] = useState<string>(get("condition"));
	const [location, setLocation] = useState<string>(get("current_location"));
	const [deprMethod, setDeprMethod] = useState<string>(
		get("depreciation_method"),
	);
	const [purchaseDate, setPurchaseDate] = useState<string>(get("purchase_date"));
	const [deprStartDate, setDeprStartDate] = useState<string>(
		get("depreciation_start_date"),
	);

	const suggestedCoa = defaultsForFixedAsset();
	const usefulLifeMonthsVal = get("useful_life_months");
	const purchasePriceVal = Number(get("purchase_price")) || 0;
	const salvageVal = Number(get("salvage_value")) || 0;
	const monthlyDepr =
		deprMethod === "straight_line" &&
		usefulLifeMonthsVal &&
		Number(usefulLifeMonthsVal) > 0
			? Math.round((purchasePriceVal - salvageVal) / Number(usefulLifeMonthsVal))
			: 0;

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
						hint="Contoh: AST-CAM-001, EQ-PRINTER-DSXX"
						required
					>
						<input
							type="text"
							name="sku"
							required
							defaultValue={get("sku")}
							placeholder="AST-CAM-001"
							className={`${inputClass} font-mono uppercase`}
							readOnly={mode === "edit"}
						/>
					</Field>

					<Field
						label="Asset Number"
						name="asset_number"
						error={err("asset_number")}
						hint="Nomor inventaris internal (opsional, unique)"
					>
						<input
							type="text"
							name="asset_number"
							defaultValue={get("asset_number")}
							placeholder="AST-CAM-001"
							className={`${inputClass} font-mono`}
						/>
					</Field>
				</div>

				<Field label="Nama" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						defaultValue={get("name")}
						placeholder="Canon EOS R6 Mark II"
						className={inputClass}
					/>
				</Field>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field
						label="Serial Number"
						name="serial_number"
						error={err("serial_number")}
						hint="Nomor seri pabrik (kalau ada)"
					>
						<input
							type="text"
							name="serial_number"
							defaultValue={get("serial_number")}
							placeholder="—"
							className={`${inputClass} font-mono`}
						/>
					</Field>

					<Field
						label="Unit"
						name="unit"
						error={err("unit")}
						hint="Biasanya 'unit' untuk asset"
					>
						<input
							type="text"
							name="unit"
							defaultValue={get("unit")}
							placeholder="unit"
							className={inputClass}
						/>
					</Field>
				</div>
			</div>

			<div className="space-y-4">
				<SectionHeader
					title="Pembelian (CapEx)"
					subtitle="Harga + tanggal beli untuk basis depresiasi"
				/>

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
						<input type="hidden" name="purchase_date" value={purchaseDate} />
					</Field>

					<Field
						label="Salvage Value (Rp)"
						name="salvage_value"
						error={err("salvage_value")}
						hint="Estimasi nilai akhir useful life"
					>
						<input
							type="number"
							name="salvage_value"
							min={0}
							step={1}
							defaultValue={get("salvage_value")}
							className={`${inputClass} tabular`}
						/>
					</Field>
				</div>
			</div>

			<div className="space-y-4">
				<SectionHeader
					title="Depresiasi"
					subtitle="Metode + lifetime untuk perhitungan beban bulanan"
				/>

				<div className="grid gap-4 sm:grid-cols-3">
					<Field
						label="Metode"
						name="depreciation_method"
						error={err("depreciation_method")}
					>
						<NativeSelect
							value={deprMethod}
							onValueChange={setDeprMethod}
							options={DEPR_OPTIONS}
							triggerClassName="w-full"
						/>
						<input
							type="hidden"
							name="depreciation_method"
							value={deprMethod}
						/>
					</Field>

					<Field
						label="Useful Life (bulan)"
						name="useful_life_months"
						error={err("useful_life_months")}
						hint="Min. 1 bulan"
					>
						<input
							type="number"
							name="useful_life_months"
							min={1}
							step={1}
							defaultValue={get("useful_life_months")}
							placeholder="36"
							className={`${inputClass} tabular`}
							disabled={deprMethod === "none"}
						/>
					</Field>

					<Field
						label="Mulai Depresiasi"
						name="depreciation_start_date"
						error={err("depreciation_start_date")}
						hint="Default = tanggal beli"
					>
						<DatePicker
							value={deprStartDate}
							onValueChange={setDeprStartDate}
							placeholder="Pilih tanggal"
							aria-invalid={!!err("depreciation_start_date")}
						/>
						<input
							type="hidden"
							name="depreciation_start_date"
							value={deprStartDate}
						/>
					</Field>
				</div>

				{monthlyDepr > 0 && (
					<div className="rounded-md bg-sky-500/10 px-3 py-2 text-[12px] text-sky-900 dark:text-sky-100">
						Estimasi beban depresiasi bulanan:{" "}
						<strong className="tabular">
							Rp {monthlyDepr.toLocaleString("id-ID")}
						</strong>
					</div>
				)}
			</div>

			<div className="space-y-4">
				<SectionHeader title="Status Operasional" />

				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Kondisi" name="condition" error={err("condition")}>
						<NativeSelect
							value={condition}
							onValueChange={setCondition}
							options={CONDITION_OPTIONS}
							triggerClassName="w-full"
						/>
						<input type="hidden" name="condition" value={condition} />
					</Field>

					<Field
						label="Lokasi Saat Ini"
						name="current_location"
						error={err("current_location")}
					>
						<NativeSelect
							value={location}
							onValueChange={setLocation}
							options={LOCATION_OPTIONS}
							triggerClassName="w-full"
						/>
						<input type="hidden" name="current_location" value={location} />
					</Field>
				</div>
			</div>

			<div className="space-y-4">
				<SectionHeader
					title="Mapping Akun (COA)"
					subtitle={`Default sistem: ${suggestedCoa.asset} / ${suggestedCoa.accum_depr} / ${suggestedCoa.depr_expense}`}
				/>

				<div className="grid gap-4 sm:grid-cols-3">
					<Field
						label="Aktiva"
						name="coa_account_asset"
						error={err("coa_account_asset")}
						hint="Asset 1-4xx"
					>
						<input
							type="text"
							name="coa_account_asset"
							defaultValue={get("coa_account_asset")}
							placeholder={suggestedCoa.asset}
							className={`${inputClass} font-mono`}
						/>
					</Field>

					<Field
						label="Akum. Penyusutan"
						name="coa_account_accum_depr"
						error={err("coa_account_accum_depr")}
						hint="Contra-asset 1-4xx"
					>
						<input
							type="text"
							name="coa_account_accum_depr"
							defaultValue={get("coa_account_accum_depr")}
							placeholder={suggestedCoa.accum_depr}
							className={`${inputClass} font-mono`}
						/>
					</Field>

					<Field
						label="Beban Penyusutan"
						name="coa_account_depr_expense"
						error={err("coa_account_depr_expense")}
						hint="Expense 5-5xx"
					>
						<input
							type="text"
							name="coa_account_depr_expense"
							defaultValue={get("coa_account_depr_expense")}
							placeholder={suggestedCoa.depr_expense}
							className={`${inputClass} font-mono`}
						/>
					</Field>
				</div>
			</div>

			<Field
				label="URL Foto"
				name="image_url"
				error={err("image_url")}
				hint="Opsional — link foto asset (Drive, S3, dll)"
			>
				<input
					type="url"
					name="image_url"
					defaultValue={get("image_url")}
					placeholder="https://…"
					className={inputClass}
				/>
			</Field>

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
					— asset nonaktif tidak muncul di register / event check-out
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
							? "Buat Aktiva Tetap"
							: "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}
