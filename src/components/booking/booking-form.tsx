"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { TimePicker } from "@/components/ui/time-picker";
import type { BookingFormState, BookingInput } from "@/lib/actions/bookings";
import {
	ADDON_CATEGORY_LABELS,
	CHANNEL_TYPE_LABELS,
	FRAME_SIZE_LABELS,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";

const CHANNEL_OPTIONS = Object.entries(CHANNEL_TYPE_LABELS);
const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS);
const FRAME_SIZE_OPTIONS = Object.entries(FRAME_SIZE_LABELS);

const BACKDROP_TYPE_LABEL: Record<string, string> = {
	basic_included: "Basic (gratis)",
	rental_owned: "Rental",
	vendor_decor: "Vendor Decor",
};

type Action = (
	prev: BookingFormState,
	formData: FormData,
) => Promise<BookingFormState>;

export type PackageOption = {
	id: string;
	name: string;
	category: string;
	frame_size: string;
	duration_hours: number;
	base_price: number;
};

export type AddonOption = {
	id: string;
	name: string;
	category: string;
	unit: string;
	price: number;
};

export type BackdropOption = {
	id: string;
	code: string;
	name: string;
	type: "basic_included" | "rental_owned" | "vendor_decor";
	rental_price: number;
};

export type EventTypeOption = {
	code: string;
	label: string;
};

export type AddonSelection = { addon_id: string; quantity: number };

export type BookingFormDefaults = Partial<{
	channel: string;
	client_name: string;
	client_wa: string;
	client_email: string;
	service_type: string;
	package_id: string;
	frame_size: string;
	event_category: string;
	event_date: string;
	setup_time: string;
	start_time: string;
	end_time: string;
	venue_name: string;
	venue_address: string;
	venue_city: string;
	backdrop_id: string;
	vendor_decor_markup: number;
	include_flashdisk_pouch: boolean;
	base_price: number;
	discount_amount: number;
	gross_up_pph_amount: number;
	crew_notes: string;
	addons: AddonSelection[];
}>;

export function BookingForm({
	action,
	packages,
	addons,
	backdrops,
	eventTypes,
	defaults,
	submitLabel = "Save as draft",
}: {
	action: Action;
	packages: PackageOption[];
	addons: AddonOption[];
	backdrops: BackdropOption[];
	eventTypes: EventTypeOption[];
	defaults?: BookingFormDefaults;
	submitLabel?: string;
}) {
	const [state, formAction, pending] = useActionState(action, undefined);

	const get = (key: keyof BookingInput, fallback?: string) =>
		state?.values?.[key] ??
		(
			defaults?.[key as keyof BookingFormDefaults] as
				| string
				| number
				| undefined
		)?.toString() ??
		fallback ??
		"";

	const err = (key: keyof BookingInput) => state?.errors?.[key]?.[0];

	const initialPkgId = state?.values?.package_id ?? defaults?.package_id ?? "";
	const initialBase = Number(
		state?.values?.base_price ?? defaults?.base_price ?? 0,
	);
	const initialDiscount = Number(
		state?.values?.discount_amount ?? defaults?.discount_amount ?? 0,
	);
	const initialGrossUp = Number(
		state?.values?.gross_up_pph_amount ?? defaults?.gross_up_pph_amount ?? 0,
	);

	const [packageId, setPackageId] = useState(initialPkgId);
	const [basePrice, setBasePrice] = useState(initialBase);
	const [discount, setDiscount] = useState(initialDiscount);
	const [grossUp, setGrossUp] = useState(initialGrossUp);

	const initialBackdropId =
		state?.values?.backdrop_id ?? defaults?.backdrop_id ?? "";
	const initialVendorMarkup = Number(
		state?.values?.vendor_decor_markup ?? defaults?.vendor_decor_markup ?? 0,
	);
	const [backdropId, setBackdropId] = useState<string>(initialBackdropId);
	const [vendorMarkup, setVendorMarkup] = useState<number>(initialVendorMarkup);

	// Controlled state for form values that used native <select> / <input type=date|time>.
	// Each is mirrored via a hidden <input name="..."> so the FormData submission
	// pipeline (server action) keeps working unchanged.
	const [channel, setChannel] = useState(get("channel", "direct"));
	const [serviceType, setServiceType] = useState(get("service_type", ""));
	const [frameSize, setFrameSize] = useState(get("frame_size", ""));
	const [eventCategory, setEventCategory] = useState(get("event_category", ""));
	const [eventDate, setEventDate] = useState(get("event_date", ""));
	const [setupTime, setSetupTime] = useState(get("setup_time", "16:00"));
	const [startTime, setStartTime] = useState(get("start_time", "18:00"));
	const [endTime, setEndTime] = useState(get("end_time", "22:00"));

	const selectedBackdrop = useMemo(
		() => backdrops.find((b) => b.id === backdropId),
		[backdrops, backdropId],
	);
	const isVendorDecor = selectedBackdrop?.type === "vendor_decor";
	const backdropContribution = useMemo(() => {
		if (!selectedBackdrop) return 0;
		if (selectedBackdrop.type === "rental_owned") {
			return selectedBackdrop.rental_price + (isVendorDecor ? vendorMarkup : 0);
		}
		if (selectedBackdrop.type === "vendor_decor") {
			return vendorMarkup;
		}
		return 0;
	}, [selectedBackdrop, isVendorDecor, vendorMarkup]);

	const initialAddons = useMemo(() => {
		const map: Record<string, number> = {};
		for (const a of defaults?.addons ?? []) map[a.addon_id] = a.quantity;
		return map;
	}, [defaults?.addons]);

	const [selectedAddons, setSelectedAddons] =
		useState<Record<string, number>>(initialAddons);

	const addonsByCategory = useMemo(() => {
		const groups = new Map<string, AddonOption[]>();
		for (const a of addons) {
			if (!groups.has(a.category)) groups.set(a.category, []);
			groups.get(a.category)!.push(a);
		}
		return Array.from(groups.entries());
	}, [addons]);

	const addonsTotal = useMemo(() => {
		let sum = 0;
		for (const a of addons) {
			const qty = selectedAddons[a.id];
			if (qty) sum += a.price * qty;
		}
		return sum;
	}, [addons, selectedAddons]);

	const addonsJson = useMemo(
		() =>
			JSON.stringify(
				Object.entries(selectedAddons)
					.filter(([, qty]) => qty > 0)
					.map(([addon_id, quantity]) => ({ addon_id, quantity })),
			),
		[selectedAddons],
	);

	const grandTotal = useMemo(
		() =>
			Math.max(
				0,
				basePrice + addonsTotal + backdropContribution - discount + grossUp,
			),
		[basePrice, addonsTotal, backdropContribution, discount, grossUp],
	);

	function toggleAddon(id: string, enabled: boolean) {
		setSelectedAddons((prev) => {
			const next = { ...prev };
			if (enabled) next[id] = next[id] || 1;
			else delete next[id];
			return next;
		});
	}

	function setAddonQty(id: string, qty: number) {
		setSelectedAddons((prev) => ({ ...prev, [id]: Math.max(1, qty) }));
	}

	function handlePackageChange(id: string) {
		setPackageId(id);
		if (id) {
			const pkg = packages.find((p) => p.id === id);
			if (pkg && (basePrice === 0 || basePrice === initialBase)) {
				setBasePrice(pkg.base_price);
			}
		}
	}

	return (
		<form action={formAction} className="space-y-8">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<Section
				title="Channel & Client"
				description="Sumber booking dan kontak klien"
			>
				<Field
					label="Sales Channel"
					name="channel"
					error={err("channel")}
					required
				>
					<NativeSelect
						value={channel}
						onValueChange={setChannel}
						options={CHANNEL_OPTIONS.map(([value, label]) => ({
							value,
							label,
						}))}
						triggerClassName="w-full"
						aria-invalid={!!err("channel")}
					/>
					<input type="hidden" name="channel" value={channel} required />
				</Field>

				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Nama Klien"
						name="client_name"
						error={err("client_name")}
						required
					>
						<input
							type="text"
							name="client_name"
							required
							defaultValue={get("client_name")}
							placeholder="cth. Andi Pratama"
							className={inputClass}
						/>
					</Field>

					<Field
						label="WA Klien"
						name="client_wa"
						error={err("client_wa")}
						hint="Format: 08xxxxxxxxxx atau +628xxxxxxxxxx"
						required
					>
						<input
							type="tel"
							name="client_wa"
							required
							defaultValue={get("client_wa")}
							placeholder="081234567890"
							className={`${inputClass} tabular`}
						/>
					</Field>
				</div>

				<Field
					label="Email Klien"
					name="client_email"
					error={err("client_email")}
					hint="Opsional"
				>
					<input
						type="email"
						name="client_email"
						defaultValue={get("client_email")}
						placeholder="andi@email.com"
						className={inputClass}
					/>
				</Field>
			</Section>

			<Section title="Service" description="Jenis layanan dan paket">
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Service Type"
						name="service_type"
						error={err("service_type")}
						required
					>
						<NativeSelect
							value={serviceType}
							onValueChange={setServiceType}
							placeholder="Pilih service…"
							options={SERVICE_TYPE_OPTIONS.map(([value, label]) => ({
								value,
								label,
							}))}
							triggerClassName="w-full"
							aria-invalid={!!err("service_type")}
						/>
						<input
							type="hidden"
							name="service_type"
							value={serviceType}
							required
						/>
					</Field>

					<Field
						label="Frame Size"
						name="frame_size"
						error={err("frame_size")}
						required
					>
						<NativeSelect
							value={frameSize}
							onValueChange={setFrameSize}
							placeholder="Pilih frame…"
							options={FRAME_SIZE_OPTIONS.map(([value, label]) => ({
								value,
								label: label === "—" ? "None" : label,
							}))}
							triggerClassName="w-full"
							aria-invalid={!!err("frame_size")}
						/>
						<input
							type="hidden"
							name="frame_size"
							value={frameSize}
							required
						/>
					</Field>
				</div>

				<Field
					label="Package (Opsional)"
					name="package_id"
					error={err("package_id")}
					hint="Pilih dari pricelist; base price akan auto-fill"
				>
					<NativeSelect
						value={packageId}
						onValueChange={(value) => handlePackageChange(value)}
						placeholder="— Custom / belum dipilih —"
						options={[
							{ value: "", label: "— Custom / belum dipilih —" },
							...packages.map((pkg) => ({
								value: pkg.id,
								label: `${pkg.name} · ${pkg.duration_hours}j · ${formatRupiah(pkg.base_price)}`,
							})),
						]}
						triggerClassName="w-full"
					/>
					<input type="hidden" name="package_id" value={packageId} />
				</Field>
			</Section>

			<Section title="Customization" description="Backdrop dan add-on standar">
				<Field
					label="Backdrop"
					name="backdrop_id"
					error={err("backdrop_id" as keyof BookingInput)}
					hint={
						selectedBackdrop?.type === "rental_owned"
							? `Auto-add ${formatRupiah(selectedBackdrop.rental_price)} sewa ke grand total`
							: selectedBackdrop?.type === "vendor_decor"
								? "Klien pakai vendor decor — isi markup di field bawah"
								: selectedBackdrop?.type === "basic_included"
									? "Gratis (basic Tetra)"
									: "Pilih backdrop dari katalog"
					}
				>
					<NativeSelect
						value={backdropId}
						onValueChange={setBackdropId}
						placeholder="— Belum dipilih —"
						options={[
							{ value: "", label: "— Belum dipilih —" },
							...backdrops.map((b) => ({
								value: b.id,
								label: `${b.name} · ${BACKDROP_TYPE_LABEL[b.type] ?? b.type}${
									b.type === "rental_owned" && b.rental_price > 0
										? ` · ${formatRupiah(b.rental_price)}`
										: ""
								}`,
							})),
						]}
						triggerClassName="w-full"
					/>
					<input type="hidden" name="backdrop_id" value={backdropId} />
				</Field>

				{isVendorDecor && (
					<Field
						label="Markup Vendor Decor (Rp)"
						name="vendor_decor_markup"
						error={err("vendor_decor_markup" as keyof BookingInput)}
						hint="Otomatis ditambahkan ke grand total. Default Rp 300k baseline."
					>
						<input
							type="number"
							name="vendor_decor_markup"
							min={0}
							step={1}
							value={vendorMarkup === 0 ? "" : vendorMarkup}
							onChange={(e) =>
								setVendorMarkup(Math.max(0, Number(e.target.value || 0)))
							}
							placeholder="300000"
							className={`${inputClass} tabular`}
						/>
					</Field>
				)}
				{!isVendorDecor && (
					<input
						type="hidden"
						name="vendor_decor_markup"
						value={String(vendorMarkup || 0)}
					/>
				)}

				<label className="border-border-default bg-surface-2 flex items-center gap-3 rounded-md border p-4">
					<input
						type="checkbox"
						name="include_flashdisk_pouch"
						defaultChecked={
							state?.values
								? state.values.include_flashdisk_pouch === "on"
								: (defaults?.include_flashdisk_pouch ?? true)
						}
						className="text-primary h-4 w-4 rounded"
					/>
					<div className="space-y-0.5">
						<div className="text-sm font-medium">Include flashdisk pouch</div>
						<div className="text-muted-foreground text-xs">
							Standar Tetra: pouch + flashdisk berisi semua foto/video event.
						</div>
					</div>
				</label>
			</Section>

			<Section title="Event Details" description="Tipe acara dan jadwal">
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Kategori Event"
						name="event_category"
						error={err("event_category")}
						required
					>
						<NativeSelect
							value={eventCategory}
							onValueChange={setEventCategory}
							placeholder="— Pilih kategori —"
							options={eventTypes.map((t) => ({
								value: t.code,
								label: t.label,
							}))}
							triggerClassName="w-full"
							aria-invalid={!!err("event_category")}
						/>
						<input
							type="hidden"
							name="event_category"
							value={eventCategory}
							required
						/>
					</Field>

					<Field
						label="Tanggal Event"
						name="event_date"
						error={err("event_date")}
						required
					>
						<DatePicker
							value={eventDate}
							onValueChange={setEventDate}
							placeholder="Pilih tanggal"
							aria-invalid={!!err("event_date")}
						/>
						<input
							type="hidden"
							name="event_date"
							value={eventDate}
							required
						/>
					</Field>
				</div>

				<div className="grid gap-6 md:grid-cols-3">
					<Field
						label="Setup"
						name="setup_time"
						error={err("setup_time")}
						required
					>
						<TimePicker
							value={setupTime}
							onValueChange={setSetupTime}
							aria-invalid={!!err("setup_time")}
						/>
						<input
							type="hidden"
							name="setup_time"
							value={setupTime}
							required
						/>
					</Field>
					<Field
						label="Mulai"
						name="start_time"
						error={err("start_time")}
						required
					>
						<TimePicker
							value={startTime}
							onValueChange={setStartTime}
							aria-invalid={!!err("start_time")}
						/>
						<input
							type="hidden"
							name="start_time"
							value={startTime}
							required
						/>
					</Field>
					<Field
						label="Selesai"
						name="end_time"
						error={err("end_time")}
						required
					>
						<TimePicker
							value={endTime}
							onValueChange={setEndTime}
							aria-invalid={!!err("end_time")}
						/>
						<input type="hidden" name="end_time" value={endTime} required />
					</Field>
				</div>
			</Section>

			<Section title="Lokasi" description="Tempat acara">
				<Field
					label="Nama Venue"
					name="venue_name"
					error={err("venue_name")}
					required
				>
					<input
						type="text"
						name="venue_name"
						required
						defaultValue={get("venue_name")}
						placeholder="cth. Grand Ballroom Hotel ABC"
						className={inputClass}
					/>
				</Field>

				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Alamat"
						name="venue_address"
						error={err("venue_address")}
						hint="Opsional"
					>
						<input
							type="text"
							name="venue_address"
							defaultValue={get("venue_address")}
							placeholder="Jl. ..."
							className={inputClass}
						/>
					</Field>
					<Field
						label="Kota"
						name="venue_city"
						error={err("venue_city")}
						hint="Opsional"
					>
						<input
							type="text"
							name="venue_city"
							defaultValue={get("venue_city")}
							placeholder="Bogor"
							className={inputClass}
						/>
					</Field>
				</div>
			</Section>

			<Section
				title="Add-ons"
				description="Voucher, print extras, costume, dll"
			>
				<input type="hidden" name="addons_json" value={addonsJson} />
				{addons.length === 0 ? (
					<p className="text-muted-foreground text-sm italic">
						Belum ada add-on aktif. Tambah dari Settings → Add-ons.
					</p>
				) : (
					<div className="space-y-4">
						{addonsByCategory.map(([category, items]) => (
							<div key={category} className="space-y-2">
								<h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
									{ADDON_CATEGORY_LABELS[category] ?? category}
								</h4>
								<div className="space-y-1">
									{items.map((addon) => {
										const qty = selectedAddons[addon.id];
										const enabled = qty !== undefined;
										return (
											<label
												key={addon.id}
												className="border-border-default bg-surface-2 hover:bg-muted/30 flex items-center gap-3 rounded-md border p-3 cursor-pointer"
											>
												<input
													type="checkbox"
													checked={enabled}
													onChange={(e) =>
														toggleAddon(addon.id, e.target.checked)
													}
													className="text-primary h-4 w-4 rounded shrink-0"
												/>
												<div className="min-w-0 flex-1">
													<div className="text-sm font-medium truncate">
														{addon.name}
													</div>
													<div className="text-muted-foreground text-xs">
														{formatRupiah(addon.price)} per {addon.unit}
													</div>
												</div>
												{enabled ? (
													<>
														<input
															type="number"
															min={1}
															max={99}
															value={qty}
															onChange={(e) =>
																setAddonQty(addon.id, Number(e.target.value))
															}
															onClick={(e) => e.stopPropagation()}
															className={`${inputClass} tabular h-8 w-16 shrink-0 text-right`}
														/>
														<span className="tabular text-foreground w-28 shrink-0 text-right text-sm font-medium">
															{formatRupiah(addon.price * qty)}
														</span>
													</>
												) : (
													<span className="text-muted-foreground w-44 shrink-0 text-right text-xs">
														Klik untuk pilih
													</span>
												)}
											</label>
										);
									})}
								</div>
							</div>
						))}
						<div className="bg-muted flex items-center justify-between rounded-md px-4 py-2 text-sm">
							<span className="text-muted-foreground">Add-ons subtotal</span>
							<span className="tabular font-medium">
								{formatRupiah(addonsTotal)}
							</span>
						</div>
					</div>
				)}
			</Section>

			<Section title="Financial" description="Harga dan modifier">
				<Field
					label="Base Price (IDR)"
					name="base_price"
					error={err("base_price")}
					hint="Auto-fill dari package; bisa override manual"
				>
					<input
						type="number"
						name="base_price"
						min={0}
						step={1}
						value={basePrice || ""}
						onChange={(e) => setBasePrice(Number(e.target.value) || 0)}
						placeholder="3000000"
						className={`${inputClass} tabular`}
					/>
				</Field>

				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Discount (IDR)"
						name="discount_amount"
						error={err("discount_amount")}
						hint="Potongan dalam Rupiah"
					>
						<input
							type="number"
							name="discount_amount"
							min={0}
							step={1}
							value={discount || ""}
							onChange={(e) => setDiscount(Number(e.target.value) || 0)}
							placeholder="0"
							className={`${inputClass} tabular`}
						/>
					</Field>

					<Field
						label="Gross-up PPh (IDR)"
						name="gross_up_pph_amount"
						error={err("gross_up_pph_amount")}
						hint="Markup pajak untuk corporate; biarkan 0 kalau tidak relevan"
					>
						<input
							type="number"
							name="gross_up_pph_amount"
							min={0}
							step={1}
							value={grossUp || ""}
							onChange={(e) => setGrossUp(Number(e.target.value) || 0)}
							placeholder="0"
							className={`${inputClass} tabular`}
						/>
					</Field>
				</div>

				<Field
					label="Catatan untuk Crew"
					name="crew_notes"
					error={err("crew_notes")}
					hint="Optional — instruksi spesifik untuk tim lapangan"
				>
					<textarea
						name="crew_notes"
						rows={2}
						maxLength={500}
						defaultValue={get("crew_notes")}
						placeholder="cth. Akses parkir di basement, tanya security PIC: Pak Agus"
						className={`${inputClass} resize-none`}
					/>
				</Field>
			</Section>

			<div className="border-border-default bg-surface-2 sticky bottom-0 -mx-4 flex flex-col gap-3 border-t px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-surface-2/85 sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:px-8">
				<dl className="flex items-baseline gap-6 text-sm">
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wider">
							Grand Total
						</dt>
						<dd className="tabular text-foreground text-xl font-semibold">
							{formatRupiah(grandTotal)}
						</dd>
					</div>
					<div className="text-muted-foreground text-xs">
						{formatRupiah(basePrice)}
						{addonsTotal > 0 && <> + {formatRupiah(addonsTotal)} addons</>}
						{backdropContribution > 0 && (
							<> + {formatRupiah(backdropContribution)} backdrop</>
						)}
						{discount > 0 && <> − {formatRupiah(discount)}</>}
						{grossUp > 0 && <> + {formatRupiah(grossUp)} PPh</>}
					</div>
				</dl>
				<div className="flex items-center gap-3">
					<Link
						href="/operations"
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
			</div>
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";

const selectClass = `${inputClass} appearance-none`;

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-0.5">
				<h3 className="text-base font-semibold">{title}</h3>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
			<div className="space-y-4">{children}</div>
		</div>
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
