"use client";

import { Info, Layers, Sparkles, Wand2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import {
	createFixedAssetItem,
	type FixedAssetItemFormState,
	updateFixedAssetItem,
} from "@/lib/actions/items-fixed-asset";
import { formatRupiah } from "@/lib/format";
import {
	type AssetModelOption,
	normalizeModelName,
} from "@/lib/inventory/asset-models";
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

const MAX_UNITS_PER_SUBMIT = 20;

export function FixedAssetItemForm({
	mode,
	id,
	defaults = EMPTY_FIXED_ASSET_DEFAULTS,
	returnTo,
	suppliers = [],
	assetModels = [],
	initialModelId,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: FixedAssetItemDefaults;
	returnTo?: "/warehouse";
	suppliers?: Array<{ id: string; name: string }>;
	/** Alat yang sudah terdaftar — dipilih kalau owner menambah unit, bukan alat baru. */
	assetModels?: AssetModelOption[];
	/** Pra-pilih model (dari tombol "+ unit" di Asset Register). */
	initialModelId?: string;
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

	// Pra-pilih model dari tombol "+ unit" di Asset Register.
	const initialModel =
		mode === "create" && initialModelId
			? assetModels.find((m) => m.id === initialModelId)
			: undefined;

	const [name, setName] = useState<string>(initialModel?.name ?? get("name"));
	const [skuOverride, setSkuOverride] = useState<string>(
		mode === "edit" ? defaults.sku : "",
	);
	const [skuEditable, setSkuEditable] = useState<boolean>(mode === "edit");
	const [unit, setUnit] = useState<string>(initialModel?.unit ?? get("unit"));
	const [quantity, setQuantity] = useState<string>("1");
	const [serials, setSerials] = useState<string[]>([]);
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

	// Controlled so the capitalization-policy banner + depreciation preview
	// update live as the owner types price / useful life.
	const [purchasePrice, setPurchasePrice] = useState<string>(
		initialModel ? String(initialModel.lastPrice) : get("purchase_price"),
	);
	const [salvage, setSalvage] = useState<string>(
		initialModel ? String(initialModel.salvageValue) : get("salvage_value"),
	);
	const [usefulLife, setUsefulLife] = useState<string>(
		initialModel
			? String(initialModel.usefulLifeMonths ?? "")
			: get("useful_life_months"),
	);

	// Langkah pertama: alat baru, atau unit ke-sekian dari alat yang sudah ada?
	// Ditentukan dari nama — persis pola vendor picker di New Booking. Pilih dari
	// daftar (atau ketik nama yang sudah ada) = tambah unit; nama lain = alat baru.
	const model = useMemo(() => {
		if (mode !== "create") return undefined;
		const key = normalizeModelName(name);
		if (!key) return undefined;
		return assetModels.find((m) => normalizeModelName(m.name) === key);
	}, [assetModels, mode, name]);

	const qty = Math.min(
		Math.max(Number.parseInt(quantity, 10) || 1, 1),
		MAX_UNITS_PER_SUBMIT,
	);
	// Nomor unit yang akan dibuat: lanjut dari unit yang sudah ada.
	const firstUnitNo = (model?.units.length ?? 0) + 1;
	const unitNumbers = Array.from({ length: qty }, (_, i) => firstUnitNo + i);

	function pickName(next: string) {
		setName(next);
		const key = normalizeModelName(next);
		const picked = assetModels.find((m) => normalizeModelName(m.name) === key);
		if (!picked) return;
		// Ikut spesifikasi unit yang sudah ada — owner tinggal ubah yang beda.
		setSkuEditable(false);
		setSkuOverride("");
		setUnit(picked.unit);
		if (picked.lastPrice > 0) setPurchasePrice(String(picked.lastPrice));
		setSalvage(String(picked.salvageValue));
		if (picked.usefulLifeMonths) setUsefulLife(String(picked.usefulLifeMonths));
	}

	const generatedSku = useMemo(
		() => (name.trim() ? generateFixedAssetSku(name) : ""),
		[name],
	);
	const baseSku = model ? model.baseSku : generatedSku;
	const effectiveSku = skuEditable ? skuOverride || baseSku : baseSku;
	// Preview penomoran: unit ke-2 dst dapat sufiks; nomor final dipastikan server.
	const skuPreview =
		model || qty > 1
			? qty > 1
				? `${effectiveSku}${firstUnitNo > 1 ? `-${firstUnitNo}` : ""} … ${effectiveSku}-${firstUnitNo + qty - 1}`
				: `${effectiveSku}${firstUnitNo > 1 ? `-${firstUnitNo}` : ""}`
			: effectiveSku;

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
				<SectionHeader
					title="Identitas"
					subtitle={
						mode === "create"
							? "Mulai dari nama alat — pilih dari daftar kalau alatnya sudah ada, ketik sendiri kalau alat baru."
							: undefined
					}
				/>

				<Field
					label="Nama Alat"
					name="name"
					error={err("name")}
					hint={
						mode === "create" && assetModels.length > 0
							? "Klik nama yang sudah ada = nambah unit alat itu. Ketik nama lain = alat baru."
							: undefined
					}
					required
				>
					{mode === "create" ? (
						<>
							<Combobox
								id="name"
								value={name}
								onValueChange={pickName}
								options={assetModels.map(
									(m): ComboboxOption => ({
										value: m.name,
										label: m.name,
										// Tanpa nominal — isi dropdown tak bisa ikut mode privasi.
										sublabel: `${m.unitCount} unit · ${m.baseSku}`,
									}),
								)}
								placeholder="Canon EOS R6 Mark II, DNP DS620A Printer, Godox AD200…"
								emptyMessage="Alat baru — belum ada di daftar aset"
								aria-invalid={!!err("name")}
							/>
							<input type="hidden" name="name" value={name} />
							<input
								type="hidden"
								name="base_item_id"
								value={model?.id ?? ""}
							/>
						</>
					) : (
						<input
							type="text"
							name="name"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Canon EOS R6 Mark II, DNP DS620A Printer, Godox AD200…"
							className={inputClass}
						/>
					)}
				</Field>

				{mode === "create" && name.trim() !== "" && (
					<ModeBanner model={model} qty={qty} firstUnitNo={firstUnitNo} />
				)}

				{/* Auto-SKU + asset number preview */}
				<div className="rounded-md bg-surface-3 px-3 py-2.5 text-[12px]">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Wand2 className="size-3.5 text-muted-foreground" />
							<span className="text-muted-foreground">SKU otomatis:</span>
							<span className="font-mono text-sm font-semibold text-foreground">
								{skuPreview || "—"}
							</span>
						</div>
						{mode === "create" && !model && qty === 1 && (
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

				<div
					className={`grid gap-4 ${mode === "create" ? "md:grid-cols-3" : "md:grid-cols-2"}`}
				>
					{mode === "create" && (
						<Field
							label="Jumlah Unit"
							name="quantity"
							error={err("quantity")}
							hint="Beli 3 printer sekaligus? Isi 3 — dibuat 3 unit terpisah."
						>
							<input
								type="number"
								name="quantity"
								min={1}
								max={MAX_UNITS_PER_SUBMIT}
								step={1}
								value={quantity}
								onChange={(e) => {
									setQuantity(e.target.value);
									if ((Number.parseInt(e.target.value, 10) || 1) > 1) {
										setSkuEditable(false);
										setSkuOverride("");
									}
								}}
								className={`${inputClass} tabular`}
							/>
						</Field>
					)}

					{qty === 1 && (
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
					)}

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

				{/* Tiap unit fisik punya serial sendiri — diisi sekalian di sini. */}
				{mode === "create" && qty > 1 && (
					<div className="rounded-lg border border-border-default bg-surface-3 p-3.5">
						<p className="text-[12px] font-medium text-foreground">
							Serial number tiap unit{" "}
							<span className="text-muted-foreground font-normal">
								(opsional — boleh diisi nanti lewat Edit)
							</span>
						</p>
						<div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{unitNumbers.map((unitNo, i) => (
								<label key={unitNo} className="flex items-center gap-2">
									<span className="text-muted-foreground w-14 shrink-0 text-[11px]">
										Unit #{unitNo}
									</span>
									<input
										type="text"
										name="serial_numbers"
										value={serials[i] ?? ""}
										onChange={(e) => {
											const next = [...serials];
											next[i] = e.target.value;
											setSerials(next);
										}}
										placeholder="S/N"
										className={`${inputClass} h-9 font-mono text-[13px]`}
									/>
								</label>
							))}
						</div>
					</div>
				)}
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
								? `Nilai Estimasi Aset${qty > 1 ? " / Unit" : ""} (Rp)`
								: `Harga Beli${qty > 1 ? " / Unit" : ""} (Rp)`
						}
						name="purchase_price"
						error={err("purchase_price")}
						hint={
							acquisitionType === "owner_contribution"
								? "Estimasi nilai wajar saat diserahkan ke perusahaan"
								: model
									? "Terisi dari harga unit terakhir — ubah kalau harganya beda."
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

				{/* Catat pembelian ke pembukuan — sebelumnya alat yang dibeli hanya
				    masuk daftar aset, uangnya tak pernah terlihat di buku. */}
				{mode === "create" && acquisitionType !== "owner_contribution" && (
					<AssetPurchaseBooking
						suppliers={suppliers}
						price={purchasePrice}
						date={purchaseDate}
						quantity={qty}
					/>
				)}

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
						per bulan sebagai penyusutan (straight-line)
						{qty > 1 ? (
							<>
								{" "}
								<span className="tabular">
									per unit — {qty} unit = Rp{" "}
									{(monthlyDepr * qty).toLocaleString("id-ID")}/bulan
								</span>
							</>
						) : null}
						.
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
						: mode !== "create"
							? "Simpan perubahan"
							: qty > 1
								? `Tambah ${qty} Unit`
								: model
									? `Tambah Unit ke-${firstUnitNo}`
									: "Buat Aset Tetap"}
				</button>
			</div>
		</form>
	);
}

const CONDITION_SHORT: Record<string, string> = {
	normal: "normal",
	service: "service",
	damaged: "rusak",
	lost: "hilang",
};

/**
 * Jawaban atas pertanyaan pertama: alat baru, atau unit tambahan?
 * Ditentukan dari nama yang dipilih/diketik — banner ini yang membuat
 * keputusan itu terlihat sebelum owner mengisi apa pun di bawahnya.
 */
function ModeBanner({
	model,
	qty,
	firstUnitNo,
}: {
	model: AssetModelOption | undefined;
	qty: number;
	firstUnitNo: number;
}) {
	if (!model) {
		return (
			<div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-emerald-900 dark:text-emerald-100">
				<Sparkles className="mt-0.5 size-3.5 shrink-0" />
				<span>
					<strong>Alat baru</strong> — belum ada di daftar aset.
					{qty > 1 ? ` Akan dibuat ${qty} unit sekaligus.` : ""}
				</span>
			</div>
		);
	}

	const active = model.units.filter((u) => !u.disposedAt);
	return (
		<div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-sky-900 dark:text-sky-100">
			<div className="flex items-start gap-2">
				<Layers className="mt-0.5 size-3.5 shrink-0" />
				<span>
					<strong>
						{qty > 1
							? `Nambah ${qty} unit (ke-${firstUnitNo}–${firstUnitNo + qty - 1})`
							: `Nambah unit ke-${firstUnitNo}`}
					</strong>{" "}
					untuk <strong>{model.name}</strong> — sekarang {model.unitCount} unit.
					Nama & spesifikasinya ikut yang sudah ada; yang beda cuma serial
					number, harga, dan tanggal beli.
				</span>
			</div>
			{active.length > 0 && (
				<ul className="mt-2 space-y-0.5 pl-5 text-[11px] text-sky-800/80 dark:text-sky-200/80">
					{active.map((u) => (
						<li key={u.id} className="font-mono">
							{u.assetNumber ?? u.sku}
							{u.serial ? ` · S/N ${u.serial}` : ""}
							{u.condition && u.condition !== "normal"
								? ` · ${CONDITION_SHORT[u.condition] ?? u.condition}`
								: ""}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * Sambungan ke pembukuan untuk alat yang DIBELI. Nominal & tanggalnya memakai
 * field "Harga Beli"/"Tanggal Beli" di atas — jadi owner tidak mengetik angka
 * yang sama dua kali. Yang ditanya di sini hanya info yang belum ada:
 * dari siapa, dibayar bagaimana, dan nomor notanya.
 *
 * Kalau dimatikan, alat tetap terdaftar tapi tidak ada jurnal — untuk alat yang
 * sudah lama dimiliki tapi baru sekarang didata.
 */
function AssetPurchaseBooking({
	suppliers,
	price,
	date,
	quantity,
}: {
	suppliers: Array<{ id: string; name: string }>;
	price: string;
	date: string;
	/** Beli beberapa unit sekaligus → satu nota berisi beberapa baris. */
	quantity: number;
}) {
	const [on, setOn] = useState(true);
	const [method, setMethod] = useState("cash");
	const [supplierId, setSupplierId] = useState("");
	const priceNum = Number(price) || 0;
	const totalNum = priceNum * quantity;

	return (
		<div className="rounded-xl border border-border-default bg-surface-2 p-4">
			<label className="flex items-start justify-between gap-3">
				<span className="min-w-0">
					<span className="block text-sm font-medium text-foreground">
						Catat pembeliannya ke pembukuan
					</span>
					<span className="text-muted-foreground mt-0.5 block text-[12px] leading-relaxed">
						Uang keluar{" "}
						<span className="tabular">
							{quantity > 1
								? `${quantity} × ${formatRupiah(priceNum)} = ${formatRupiah(totalNum)}`
								: formatRupiah(priceNum)}
						</span>{" "}
						ikut tercatat: jurnal dibuat otomatis & alat masuk sebagai aset
						(atau beban perlengkapan kalau di bawah batas kapitalisasi)
						{quantity > 1 ? " — satu nota berisi seluruh unit" : ""}. Matikan
						kalau alat ini sudah lama dimiliki dan hanya didata sekarang.
					</span>
				</span>
				<input
					type="checkbox"
					checked={on}
					onChange={(e) => setOn(e.target.checked)}
					className="border-border-default accent-primary mt-1 h-4 w-4 shrink-0 rounded"
				/>
			</label>

			{/* Jumlah 0 = server melewati pencatatan pembelian. */}
			<input
				type="hidden"
				name="buy_quantity"
				value={on ? String(quantity) : "0"}
			/>
			<input type="hidden" name="buy_unit" value="unit" />
			<input type="hidden" name="buy_unit_cost" value={price} />
			<input type="hidden" name="buy_date" value={date} />
			<input type="hidden" name="buy_payment_method" value={method} />
			<input type="hidden" name="buy_supplier_id" value={supplierId} />

			{on && (
				<div className="mt-3 grid gap-3 sm:grid-cols-3">
					<div className="space-y-1">
						<span className="block text-[12px] font-medium text-foreground">
							Cara bayar
						</span>
						<NativeSelect
							value={method}
							onValueChange={setMethod}
							options={[
								{ value: "cash", label: "Tunai" },
								{ value: "top_7", label: "Tempo 7 hari" },
								{ value: "top_14", label: "Tempo 14 hari" },
								{ value: "top_30", label: "Tempo 30 hari" },
							]}
							triggerClassName="h-10! w-full"
						/>
					</div>
					<div className="space-y-1">
						<span className="block text-[12px] font-medium text-foreground">
							Supplier (opsional)
						</span>
						<NativeSelect
							value={supplierId}
							onValueChange={setSupplierId}
							placeholder="Pilih supplier…"
							options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
							triggerClassName="h-10! w-full"
						/>
					</div>
					<div className="space-y-1">
						<span className="block text-[12px] font-medium text-foreground">
							No. nota (opsional)
						</span>
						<input
							type="text"
							name="buy_invoice_no"
							placeholder="INV-8891"
							className={inputClass}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
