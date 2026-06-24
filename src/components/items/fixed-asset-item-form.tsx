"use client";

import { Info, Wand2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import {
	createFixedAssetItem,
	type FixedAssetItemFormState,
	updateFixedAssetItem,
} from "@/lib/actions/items-fixed-asset";
import {
	ASSET_MIN_LIFE_MONTHS,
	ASSET_MIN_PRICE,
	qualifiesAsFixedAsset,
} from "@/lib/inventory/capitalization-policy";
import { generateFixedAssetSku } from "@/lib/inventory/sku-generator";
import { Field, inputClass, SectionHeader } from "./item-form-primitives";
import { ItemImageUpload } from "./item-image-upload";

export type AcquisitionType =
	| "new_commercial"
	| "used_commercial"
	| "owner_contribution";

export type FixedAssetItemDefaults = {
	name: string;
	sku: string;
	unit: string;
	asset_number: string;
	serial_number: string;
	acquisition_type: AcquisitionType;
	purchase_price: string;
	purchase_date: string;
	salvage_value: string;
	useful_life_months: string;
	depreciation_start_date: string;
	condition: string;
	current_location: string;
	image_url: string;
	notes: string;
	is_active: boolean;
};

export const EMPTY_FIXED_ASSET_DEFAULTS: FixedAssetItemDefaults = {
	name: "",
	sku: "",
	unit: "unit",
	asset_number: "",
	serial_number: "",
	acquisition_type: "new_commercial",
	purchase_price: "0",
	purchase_date: "",
	salvage_value: "0",
	useful_life_months: "",
	depreciation_start_date: "",
	condition: "normal",
	current_location: "gudang_pusat",
	image_url: "",
	notes: "",
	is_active: true,
};

const UNIT_OPTIONS = [
	{ value: "unit", label: "Unit" },
	{ value: "pcs", label: "Pcs" },
	{ value: "set", label: "Set" },
];

const ACQUISITION_OPTIONS = [
	{ value: "new_commercial", label: "Beli Baru" },
	{ value: "used_commercial", label: "Beli Bekas / Second" },
	{
		value: "owner_contribution",
		label: "Setoran Modal Owner (Aset pribadi → perusahaan)",
	},
];

const CONDITION_OPTIONS = [
	{ value: "normal", label: "Normal" },
	{ value: "service", label: "Service" },
	{ value: "damaged", label: "Rusak" },
	{ value: "lost", label: "Hilang" },
];

const LOCATION_OPTIONS = [
	{ value: "gudang_pusat", label: "Gudang Pusat" },
	{ value: "event", label: "Sedang di Event" },
	{ value: "service_center", label: "Service Center" },
	{ value: "crew_carry", label: "Dibawa Crew" },
	{ value: "lost", label: "Hilang" },
];

export function FixedAssetItemForm({
	mode,
	id,
	defaults = EMPTY_FIXED_ASSET_DEFAULTS,
	returnTo,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: FixedAssetItemDefaults;
	returnTo?: "/warehouse";
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
		const def = defaults[key];
		return fallback ?? (typeof def === "boolean" ? "" : String(def ?? ""));
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const [name, setName] = useState<string>(get("name"));
	const [skuOverride, setSkuOverride] = useState<string>(
		mode === "edit" ? defaults.sku : "",
	);
	const [skuEditable, setSkuEditable] = useState<boolean>(mode === "edit");
	const [unit, setUnit] = useState<string>(get("unit"));
	const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>(
		(get("acquisition_type") as AcquisitionType) || "new_commercial",
	);
	const [purchaseDate, setPurchaseDate] = useState<string>(
		get("purchase_date"),
	);
	const [deprStartDate, setDeprStartDate] = useState<string>(
		get("depreciation_start_date"),
	);
	const [condition, setCondition] = useState<string>(get("condition"));
	const [location, setLocation] = useState<string>(get("current_location"));
	const [imageUrl, setImageUrl] = useState<string | null>(
		get("image_url") || null,
	);

	const generatedSku = useMemo(
		() => (name.trim() ? generateFixedAssetSku(name) : ""),
		[name],
	);
	const effectiveSku = skuEditable ? skuOverride || generatedSku : generatedSku;

	// Controlled so the capitalization-policy banner + depreciation preview
	// update live as the owner types price / useful life.
	const [purchasePrice, setPurchasePrice] = useState<string>(
		get("purchase_price"),
	);
	const [salvage, setSalvage] = useState<string>(get("salvage_value"));
	const [usefulLife, setUsefulLife] = useState<string>(
		get("useful_life_months"),
	);
	const purchasePriceVal = Number(purchasePrice) || 0;
	const salvageVal = Number(salvage) || 0;
	const usefulLifeVal = Number(usefulLife) || 0;
	const capitalized = qualifiesAsFixedAsset(purchasePriceVal, usefulLifeVal);
	const monthlyDepr =
		capitalized && usefulLifeVal > 0
			? Math.round((purchasePriceVal - salvageVal) / usefulLifeVal)
			: 0;

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

				<Field label="Nama Alat" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Canon EOS R6 Mark II, DNP DS620A Printer, Godox AD200…"
						className={inputClass}
						autoFocus={mode === "create"}
					/>
				</Field>

				{/* Auto-SKU + asset number preview */}
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
							onChange={(e) => setSkuOverride(e.target.value.toUpperCase())}
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
					<p className="text-muted-foreground mt-1.5 text-[11px]">
						Asset Number otomatis = SKU. Bisa ganti di Edit kalau perlu nomor
						inventaris berbeda.
					</p>
					{/* Asset number defaults to SKU on create; on edit allow manual */}
					{mode === "edit" && (
						<input
							type="text"
							name="asset_number"
							defaultValue={get("asset_number")}
							placeholder={effectiveSku}
							className={`${inputClass} mt-2 font-mono`}
						/>
					)}
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<Field
						label="Serial Number"
						name="serial_number"
						error={err("serial_number")}
						hint="Nomor seri dari pabrik (cek body alat)"
					>
						<input
							type="text"
							name="serial_number"
							defaultValue={get("serial_number")}
							placeholder="opsional"
							className={`${inputClass} font-mono`}
						/>
					</Field>

					<Field label="Unit" name="unit" error={err("unit")} required>
						<NativeSelect
							value={unit}
							onValueChange={setUnit}
							options={UNIT_OPTIONS}
							triggerClassName="w-full"
						/>
						<input type="hidden" name="unit" value={unit} />
					</Field>
				</div>
			</div>

			{/* ── Info: harga vendor via Market List ─────────────────────── */}
			<div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5">
				<p className="text-[12px] leading-relaxed text-sky-800 dark:text-sky-200">
					<span className="font-semibold">💡 Harga vendor di Market List.</span>{" "}
					<span className="text-sky-700/80 dark:text-sky-300/80">
						Harga di bawah adalah <strong>harga akuisisi historical</strong>{" "}
						(masuk ke books). Buat catatan harga vendor (untuk
						re-purchase/replacement), buka tab <strong>Market List</strong>.
					</span>
				</p>
			</div>

			{/* ── Pembelian ─────────────────────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader
					title="Pembelian"
					subtitle="Asal-usul + harga + masa pakai"
				/>

				<Field
					label="Asal-Usul Aset"
					name="acquisition_type"
					error={err("acquisition_type")}
					hint={
						acquisitionType === "used_commercial"
							? "Saran: Sesuaikan Target Masa Pakai (lebih pendek dari barang baru)."
							: acquisitionType === "owner_contribution"
								? "Bukan pengeluaran kas — sistem akan jurnal sebagai Setoran Modal Owner (Dr 1-400 / Cr 3-100)."
								: "Cara aset ini masuk ke perusahaan. Mempengaruhi pencatatan finance."
					}
					required
				>
					<NativeSelect
						value={acquisitionType}
						onValueChange={(v) => setAcquisitionType(v as AcquisitionType)}
						options={ACQUISITION_OPTIONS}
						triggerClassName="w-full md:max-w-md"
					/>
					<input
						type="hidden"
						name="acquisition_type"
						value={acquisitionType}
					/>
				</Field>

				<div className="grid gap-4 md:grid-cols-3">
					<Field
						label={
							acquisitionType === "owner_contribution"
								? "Nilai Estimasi Aset (Rp)"
								: "Harga Beli (Rp)"
						}
						name="purchase_price"
						error={err("purchase_price")}
						hint={
							acquisitionType === "owner_contribution"
								? "Estimasi nilai wajar saat diserahkan ke perusahaan"
								: undefined
						}
						required
					>
						<input
							type="number"
							name="purchase_price"
							min={0}
							step={1}
							value={purchasePrice}
							onChange={(e) => setPurchasePrice(e.target.value)}
							className={`${inputClass} tabular`}
						/>
					</Field>

					<Field
						label={
							acquisitionType === "owner_contribution"
								? "Tanggal Penyerahan Aset"
								: "Tanggal Beli"
						}
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
						label="Target Masa Pakai (Bulan)"
						name="useful_life_months"
						error={err("useful_life_months")}
						hint={
							acquisitionType === "used_commercial"
								? "Lebih pendek karena barang second"
								: "Estimasi alat bisa dipakai berapa bulan sebelum perlu diganti"
						}
					>
						<input
							type="number"
							name="useful_life_months"
							min={1}
							step={1}
							value={usefulLife}
							onChange={(e) => setUsefulLife(e.target.value)}
							placeholder={
								acquisitionType === "used_commercial"
									? "mis. 18 = 1.5 tahun"
									: "mis. 36 = 3 tahun"
							}
							className={`${inputClass} tabular`}
						/>
					</Field>
				</div>

				<Field
					label="Perkiraan Harga Jual Bekas (Opsional)"
					name="salvage_value"
					error={err("salvage_value")}
					hint="Estimasi nilai alat saat masa pakai habis — biasanya 10-20% dari harga beli. Kosongkan / 0 kalau tidak yakin."
				>
					<input
						type="number"
						name="salvage_value"
						min={0}
						step={1}
						value={salvage}
						onChange={(e) => setSalvage(e.target.value)}
						className={`${inputClass} tabular md:max-w-xs`}
					/>
				</Field>

				{/* Capitalization policy feedback — live */}
				{capitalized && monthlyDepr > 0 ? (
					<div className="rounded-md bg-sky-500/10 px-3 py-2 text-[12px] text-sky-900 dark:text-sky-100">
						<Info className="mr-1.5 inline size-3.5" />
						Memenuhi kriteria aset tetap. Sistem akan membebankan{" "}
						<strong className="tabular">
							Rp {monthlyDepr.toLocaleString("id-ID")}
						</strong>{" "}
						per bulan sebagai penyusutan (straight-line).
					</div>
				) : purchasePriceVal > 0 || usefulLifeVal > 0 ? (
					<div className="rounded-md border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
						<Info className="mr-1.5 inline size-3.5" />
						<strong>Tidak memenuhi kriteria aset tetap</strong> (harga &gt; Rp
						{ASSET_MIN_PRICE.toLocaleString("id-ID")} DAN umur ≥{" "}
						{ASSET_MIN_LIFE_MONTHS} bulan). Item ini akan dicatat sebagai{" "}
						<strong>beban</strong> — langsung habis, tanpa penyusutan.
					</div>
				) : null}

				{acquisitionType === "owner_contribution" && (
					<div className="rounded-md bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
						<Info className="mr-1.5 inline size-3.5" />
						<strong>Setoran Modal Owner</strong> — saat disimpan, sistem
						otomatis buat jurnal{" "}
						<code>
							{capitalized
								? "Dr 1-400 Peralatan"
								: "Dr 5-250 Beban Perlengkapan"}{" "}
							/ Cr 3-100 Modal Owner
						</code>
						. TIDAK ada cash outflow & tidak perlu catat Pembelian terpisah.
					</div>
				)}

				{/* Hidden — depreciation method auto + start date defaults to purchase_date */}
				<input
					type="hidden"
					name="depreciation_start_date"
					value={deprStartDate}
				/>
			</div>

			{/* ── Status Operasional ──────────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader
					title="Status Operasional"
					subtitle="Kondisi + lokasi alat saat ini"
				/>

				<div className="grid gap-4 md:grid-cols-2">
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

				<Field
					label="Foto Alat"
					name="image_url"
					error={err("image_url")}
					hint={
						mode === "edit"
							? "Drag & drop foto, atau klik area untuk pilih file. Auto-upload ke Google Drive."
							: "Foto bisa di-upload setelah aset dibuat. Sementara: paste link Drive di bawah (opsional)."
					}
				>
					{mode === "edit" && id ? (
						<>
							<ItemImageUpload
								itemId={id}
								value={imageUrl}
								onChange={setImageUrl}
							/>
							<input type="hidden" name="image_url" value={imageUrl ?? ""} />
						</>
					) : (
						<input
							type="url"
							name="image_url"
							defaultValue={get("image_url")}
							placeholder="https://drive.google.com/… (opsional)"
							className={inputClass}
						/>
					)}
				</Field>

				<Field
					label="Catatan"
					name="notes"
					error={err("notes")}
					hint="Opsional — kondisi spesifik, history service, lokasi penyimpanan, dll"
				>
					<RichTextarea
						name="notes"
						rows={2}
						maxLength={500}
						defaultValue={get("notes")}
						toolbar={false}
					/>
				</Field>
			</div>

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
					— alat nonaktif tidak muncul di register / event check-out
				</span>
			</label>

			<div className="flex items-center justify-end gap-3 pt-2">
				<p className="text-muted-foreground mr-auto text-[11px]">
					Akun akuntansi otomatis di-mapping (bisa di-edit Rama dari Finance).
				</p>
				<button
					type="submit"
					disabled={pending || !name.trim()}
					className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-10 items-center rounded-md px-5 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Buat Aset Tetap"
							: "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}
