"use client";

import { AlertTriangle, MapPin, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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

export type RelasiOption = {
	id: string;
	full_name: string;
	role: string;
};

export type VendorOption = {
	name: string;
	contact: string | null;
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
	google_maps_url: string;
	vendor_name: string;
	vendor_contact: string;
	vendor_commission_rate: number;
	vendor_commission_amount: number;
	referrer_user_id: string;
	referrer_type: string;
	referrer_commission: number;
	pic_name: string;
	pic_wa: string;
	backdrop_id: string;
	vendor_decor_markup: number;
	include_flashdisk_pouch: boolean;
	base_price: number;
	discount_amount: number;
	gross_up_pph_amount: number;
	crew_notes: string;
	addons: AddonSelection[];
}>;

/**
 * Category-specific helper fields. Each entry maps event_category code
 * to a small form that builds a structured client_name like
 * "Andi & Sari" (wedding) or "PT Mahaka — Annual Gathering" (corporate).
 *
 * Owner can always override client_name manually.
 */
const CATEGORY_HINTS: Record<
	string,
	{
		hint: string;
		fields: Array<{
			key: string;
			label: string;
			placeholder?: string;
		}>;
		assemble: (vals: Record<string, string>) => string;
	}
> = {
	pernikahan: {
		hint: "Tetra suggest: gabungkan nama kedua pengantin",
		fields: [
			{ key: "groom", label: "Nama Pengantin Pria", placeholder: "Andi" },
			{ key: "bride", label: "Nama Pengantin Wanita", placeholder: "Sari" },
		],
		assemble: (v) =>
			[v.groom, v.bride].filter(Boolean).join(" & ").trim() || "",
	},
	wedding: {
		hint: "Tetra suggest: gabungkan nama kedua pengantin",
		fields: [
			{ key: "groom", label: "Nama Pengantin Pria", placeholder: "Andi" },
			{ key: "bride", label: "Nama Pengantin Wanita", placeholder: "Sari" },
		],
		assemble: (v) =>
			[v.groom, v.bride].filter(Boolean).join(" & ").trim() || "",
	},
	birthday: {
		hint: "Nama yang berulang tahun + (opsional) usia/tema",
		fields: [
			{
				key: "celebrant",
				label: "Nama yang Berulang Tahun",
				placeholder: "Andi",
			},
			{
				key: "age",
				label: "Usia / Tema (opsional)",
				placeholder: "Sweet 17",
			},
		],
		assemble: (v) =>
			v.age ? `${v.celebrant ?? ""} ${v.age}`.trim() : (v.celebrant ?? ""),
	},
	wisuda: {
		hint: "Nama instansi + nama angkatan/acara",
		fields: [
			{
				key: "instansi",
				label: "Sekolah / Kampus",
				placeholder: "SMA Negeri 1 Bogor",
			},
			{ key: "event_name", label: "Nama Acara / Angkatan", placeholder: "Wisuda 2026" },
		],
		assemble: (v) =>
			[v.instansi, v.event_name].filter(Boolean).join(" — "),
	},
	corporate: {
		hint: "Nama perusahaan/EO + nama acara",
		fields: [
			{ key: "company", label: "Perusahaan / EO", placeholder: "PT Mahaka" },
			{ key: "event_name", label: "Nama Acara", placeholder: "Annual Gathering 2026" },
		],
		assemble: (v) =>
			[v.company, v.event_name].filter(Boolean).join(" — "),
	},
	gathering: {
		hint: "Nama perusahaan/EO + nama acara",
		fields: [
			{ key: "company", label: "Perusahaan / EO", placeholder: "PT Mahaka" },
			{ key: "event_name", label: "Nama Acara", placeholder: "Family Gathering" },
		],
		assemble: (v) =>
			[v.company, v.event_name].filter(Boolean).join(" — "),
	},
};

export function BookingForm({
	action,
	packages,
	addons,
	backdrops,
	eventTypes,
	relasiOptions = [],
	vendorOptions = [],
	defaults,
	submitLabel = "Save as draft",
}: {
	action: Action;
	packages: PackageOption[];
	addons: AddonOption[];
	backdrops: BackdropOption[];
	eventTypes: EventTypeOption[];
	relasiOptions?: RelasiOption[];
	vendorOptions?: VendorOption[];
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

	// === Channel & Referrer
	const [channel, setChannel] = useState(get("channel", "direct"));
	const [vendorName, setVendorName] = useState(get("vendor_name"));
	const [vendorContact, setVendorContact] = useState(get("vendor_contact"));
	const [vendorCommissionRate, setVendorCommissionRate] = useState(
		get("vendor_commission_rate", "10"),
	);
	const [referrerUserId, setReferrerUserId] = useState(get("referrer_user_id"));
	const [referrerCommission, setReferrerCommission] = useState(
		get("referrer_commission"),
	);

	// === Event Category + sub-fields
	const [eventCategory, setEventCategory] = useState(get("event_category", ""));
	const [categoryMeta, setCategoryMeta] = useState<Record<string, string>>({});

	// Resolve category template
	const categoryTpl = useMemo(
		() => CATEGORY_HINTS[eventCategory] ?? null,
		[eventCategory],
	);

	// === Client name (auto-derived from category sub-fields, can be overridden)
	const [clientName, setClientName] = useState(get("client_name"));
	const [clientNameTouched, setClientNameTouched] = useState(
		Boolean(get("client_name")),
	);

	useEffect(() => {
		if (categoryTpl && !clientNameTouched) {
			const assembled = categoryTpl.assemble(categoryMeta).trim();
			if (assembled) setClientName(assembled);
		}
	}, [categoryMeta, categoryTpl, clientNameTouched]);

	// === Service & Package
	const [serviceType, setServiceType] = useState(get("service_type", ""));
	const [frameSize, setFrameSize] = useState(get("frame_size", ""));
	const initialPkgId = state?.values?.package_id ?? defaults?.package_id ?? "";
	const [packageId, setPackageId] = useState(initialPkgId);
	const initialBase = Number(
		state?.values?.base_price ?? defaults?.base_price ?? 0,
	);
	const [basePrice, setBasePrice] = useState(initialBase);

	const selectedPkg = useMemo(
		() => packages.find((p) => p.id === packageId),
		[packageId, packages],
	);

	// === Schedule (auto-fill setup/end)
	const [eventDate, setEventDate] = useState(get("event_date", ""));
	const [setupTime, setSetupTime] = useState(get("setup_time", ""));
	const [startTime, setStartTime] = useState(get("start_time", ""));
	const [endTime, setEndTime] = useState(get("end_time", ""));
	const [setupTouched, setSetupTouched] = useState(Boolean(get("setup_time")));
	const [endTouched, setEndTouched] = useState(Boolean(get("end_time")));

	// Auto-derive setup = start - 1h on start change (unless owner manually touched)
	useEffect(() => {
		if (!startTime || setupTouched) return;
		const [hh, mm] = startTime.split(":").map(Number);
		if (Number.isNaN(hh)) return;
		const setupHour = hh === 0 ? 23 : hh - 1;
		const newSetup = `${String(setupHour).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
		setSetupTime(newSetup);
	}, [startTime, setupTouched]);

	// Auto-derive end = start + duration_hours on start or package change
	useEffect(() => {
		if (!startTime || endTouched) return;
		const dur = selectedPkg?.duration_hours;
		if (!dur) return;
		const [hh, mm] = startTime.split(":").map(Number);
		if (Number.isNaN(hh)) return;
		const endHour = (hh + dur) % 24;
		const newEnd = `${String(endHour).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
		setEndTime(newEnd);
	}, [startTime, selectedPkg, endTouched]);

	// === Customization
	const [backdropId, setBackdropId] = useState(get("backdrop_id"));
	const initialVendorMarkup = Number(
		state?.values?.vendor_decor_markup ?? defaults?.vendor_decor_markup ?? 0,
	);
	const [vendorMarkup, setVendorMarkup] = useState(initialVendorMarkup);
	const selectedBackdrop = useMemo(
		() => backdrops.find((b) => b.id === backdropId),
		[backdrops, backdropId],
	);
	const isVendorDecor = selectedBackdrop?.type === "vendor_decor";
	const backdropContribution = useMemo(() => {
		if (!selectedBackdrop) return 0;
		if (selectedBackdrop.type === "rental_owned")
			return selectedBackdrop.rental_price;
		if (selectedBackdrop.type === "vendor_decor") return vendorMarkup;
		return 0;
	}, [selectedBackdrop, vendorMarkup]);

	// === Location
	const [venueName, setVenueName] = useState(get("venue_name"));
	const [venueCity, setVenueCity] = useState(get("venue_city"));
	const [mapsUrl, setMapsUrl] = useState(get("google_maps_url"));

	// === Contacts
	const [clientWa, setClientWa] = useState(get("client_wa"));
	const [picName, setPicName] = useState(get("pic_name"));
	const [picWa, setPicWa] = useState(get("pic_wa"));

	// === Financial
	const initialDiscount = Number(
		state?.values?.discount_amount ?? defaults?.discount_amount ?? 0,
	);
	const [discount, setDiscount] = useState(initialDiscount);
	const initialGrossUp = Number(
		state?.values?.gross_up_pph_amount ?? defaults?.gross_up_pph_amount ?? 0,
	);
	const [grossUp, setGrossUp] = useState(initialGrossUp);

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

	function handleVendorAutoFill(name: string) {
		const found = vendorOptions.find((v) => v.name === name);
		setVendorName(name);
		if (found?.contact) setVendorContact(found.contact);
	}

	function openMapsSearch() {
		const query = [venueName, venueCity].filter(Boolean).join(", ");
		if (!query) return;
		const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
		window.open(url, "_blank", "noopener,noreferrer");
	}

	const showReferrerBlock = channel === "vendor" || channel === "relasi";
	const backdropMissing = !backdropId;

	return (
		<form action={formAction} className="space-y-8">
			{state?.errors?._form && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-fluid-body font-medium text-destructive">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			{/* === 1. CHANNEL === */}
			<Section
				step={1}
				title="Sumber Booking"
				description="Pilih dulu dari mana booking ini datang — selanjutnya form akan menyesuaikan."
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
			</Section>

			{/* === 2. REFERRER (dependent on channel) === */}
			{showReferrerBlock && (
				<Section
					step={2}
					title={
						channel === "vendor" ? "Direferensikan oleh Vendor" : "Direferensikan oleh"
					}
					description={
						channel === "vendor"
							? "Pilih vendor existing atau ketik manual (otomatis tersimpan untuk booking berikutnya)."
							: "Pilih relasi yang mereferensikan klien ini ke kita."
					}
				>
					{channel === "vendor" && (
						<>
							<Field label="Nama Vendor" name="vendor_name" required>
								<input
									type="text"
									list="vendor-suggestions"
									value={vendorName}
									onChange={(e) => handleVendorAutoFill(e.target.value)}
									placeholder="cth. PT Bunga Hias Indah"
									className={inputClass}
								/>
								<datalist id="vendor-suggestions">
									{vendorOptions.map((v) => (
										<option key={v.name} value={v.name} />
									))}
								</datalist>
								<input type="hidden" name="vendor_name" value={vendorName} />
							</Field>
							<div className="grid gap-6 md:grid-cols-2">
								<Field
									label="Kontak Vendor (WA / HP)"
									name="vendor_contact"
								>
									<input
										type="tel"
										value={vendorContact}
										onChange={(e) => setVendorContact(e.target.value)}
										placeholder="08xxxxxxxxxx"
										className={`${inputClass} tabular`}
									/>
									<input
										type="hidden"
										name="vendor_contact"
										value={vendorContact}
									/>
								</Field>
								<Field
									label="Komisi Vendor (%)"
									name="vendor_commission_rate"
									hint="Standar 10%. Override kalau ada nego."
								>
									<input
										type="number"
										min={0}
										max={100}
										step={0.5}
										value={vendorCommissionRate}
										onChange={(e) =>
											setVendorCommissionRate(e.target.value)
										}
										placeholder="10"
										className={`${inputClass} tabular`}
									/>
									<input
										type="hidden"
										name="vendor_commission_rate"
										value={vendorCommissionRate}
									/>
									<input
										type="hidden"
										name="vendor_commission_amount"
										value=""
									/>
								</Field>
							</div>
						</>
					)}
					{channel === "relasi" && (
						<>
							<Field
								label="Relasi (User Tetra)"
								name="referrer_user_id"
								hint="Pilih owner/crew yang mereferensikan. Komisi default Rp100.000."
								required
							>
								<NativeSelect
									value={referrerUserId}
									onValueChange={setReferrerUserId}
									placeholder="— Pilih relasi —"
									options={[
										{ value: "", label: "— pilih relasi —" },
										...relasiOptions.map((r) => ({
											value: r.id,
											label: `${r.full_name} · ${r.role}`,
										})),
									]}
									triggerClassName="w-full"
								/>
								<input
									type="hidden"
									name="referrer_user_id"
									value={referrerUserId}
								/>
								<input type="hidden" name="referrer_type" value="owner" />
							</Field>
							<Field
								label="Komisi Relasi (Rp)"
								name="referrer_commission"
								hint="Default Rp100.000. Tentatif/nego boleh override."
							>
								<input
									type="number"
									min={0}
									step={1}
									value={referrerCommission}
									onChange={(e) => setReferrerCommission(e.target.value)}
									placeholder="100000"
									className={`${inputClass} tabular`}
								/>
								<input
									type="hidden"
									name="referrer_commission"
									value={referrerCommission}
								/>
							</Field>
						</>
					)}
				</Section>
			)}
			{!showReferrerBlock && (
				<>
					<input type="hidden" name="vendor_name" value="" />
					<input type="hidden" name="vendor_contact" value="" />
					<input type="hidden" name="vendor_commission_rate" value="" />
					<input type="hidden" name="vendor_commission_amount" value="" />
					<input type="hidden" name="referrer_user_id" value="" />
					<input type="hidden" name="referrer_type" value="" />
					<input type="hidden" name="referrer_commission" value="" />
				</>
			)}

			{/* === 3. EVENT TYPE + Category sub-fields === */}
			<Section
				step={showReferrerBlock ? 3 : 2}
				title="Tipe Acara"
				description="Kategori event nentuin field nama klien yang muncul di bawah."
			>
				<Field
					label="Kategori Event"
					name="event_category"
					error={err("event_category")}
					required
				>
					<NativeSelect
						value={eventCategory}
						onValueChange={(v) => {
							setEventCategory(v);
							setCategoryMeta({}); // reset sub-fields
							setClientNameTouched(false); // re-derive client_name
						}}
						placeholder="— pilih kategori —"
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

				{categoryTpl && (
					<div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
						<p className="text-fluid-caption text-primary inline-flex items-center gap-1.5">
							<Sparkles className="size-3" />
							{categoryTpl.hint}
						</p>
						<div className="grid gap-3 sm:grid-cols-2">
							{categoryTpl.fields.map((f) => (
								<div key={f.key} className="space-y-1">
									<label className="text-fluid-caption font-medium text-foreground">
										{f.label}
									</label>
									<input
										type="text"
										value={categoryMeta[f.key] ?? ""}
										onChange={(e) =>
											setCategoryMeta((m) => ({
												...m,
												[f.key]: e.target.value,
											}))
										}
										placeholder={f.placeholder}
										className={inputClass}
									/>
								</div>
							))}
						</div>
					</div>
				)}

				<Field
					label="Nama Klien (final, akan tampil di event)"
					name="client_name"
					error={err("client_name")}
					hint={
						categoryTpl
							? "Auto-derive dari field di atas. Edit manual kalau perlu."
							: "Nama klien atau acara — yang muncul di list operations."
					}
					required
				>
					<input
						type="text"
						required
						value={clientName}
						onChange={(e) => {
							setClientName(e.target.value);
							setClientNameTouched(true);
						}}
						placeholder="cth. Andi & Sari"
						className={inputClass}
					/>
					<input type="hidden" name="client_name" value={clientName} required />
				</Field>
			</Section>

			{/* === 4. SCHEDULE === */}
			<Section
				step={showReferrerBlock ? 4 : 3}
				title="Jadwal"
				description="Setup auto-fill -1 jam dari mulai. Selesai auto-fill +durasi paket."
			>
				<div className="grid gap-6 md:grid-cols-2">
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
					<Field
						label="Jam Mulai"
						name="start_time"
						error={err("start_time")}
						required
						hint="Set ini dulu, setup + selesai auto-fill"
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
				</div>
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Setup"
						name="setup_time"
						error={err("setup_time")}
						required
						hint={
							setupTouched ? "Manual override" : "Auto: 1 jam sebelum mulai"
						}
					>
						<TimePicker
							value={setupTime}
							onValueChange={(v) => {
								setSetupTime(v);
								setSetupTouched(true);
							}}
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
						label="Selesai"
						name="end_time"
						error={err("end_time")}
						required
						hint={
							endTouched
								? "Manual override"
								: selectedPkg
									? `Auto: mulai +${selectedPkg.duration_hours} jam (durasi paket)`
									: "Pilih paket dulu buat auto-fill"
						}
					>
						<TimePicker
							value={endTime}
							onValueChange={(v) => {
								setEndTime(v);
								setEndTouched(true);
							}}
							aria-invalid={!!err("end_time")}
						/>
						<input type="hidden" name="end_time" value={endTime} required />
					</Field>
				</div>
			</Section>

			{/* === 5. SERVICE & PACKAGE === */}
			<Section
				step={showReferrerBlock ? 5 : 4}
				title="Service & Paket"
				description="Jenis layanan dan paket dari pricelist."
			>
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
							placeholder="— pilih service —"
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
							placeholder="— pilih frame —"
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
					label="Paket"
					name="package_id"
					hint="Pilih dari pricelist; base price auto-fill"
				>
					<NativeSelect
						value={packageId}
						onValueChange={(v) => handlePackageChange(v)}
						placeholder="— custom / belum dipilih —"
						options={[
							{ value: "", label: "— custom / belum dipilih —" },
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

			{/* === 6. CUSTOMIZATION & BACKDROP === */}
			<Section
				step={showReferrerBlock ? 6 : 5}
				title="Customization"
				description="Backdrop + flashdisk. Bisa di-update nanti kalau klien belum mutusin."
			>
				<Field
					label="Backdrop"
					name="backdrop_id"
					hint={
						selectedBackdrop?.type === "rental_owned"
							? `Auto-add ${formatRupiah(selectedBackdrop.rental_price)} sewa ke grand total`
							: selectedBackdrop?.type === "vendor_decor"
								? "Klien pakai vendor decor — isi markup di field bawah"
								: selectedBackdrop?.type === "basic_included"
									? "Gratis (basic Tetra)"
									: "Kosongkan kalau belum ditentukan — sistem akan reminder mendekati H"
					}
				>
					<NativeSelect
						value={backdropId}
						onValueChange={setBackdropId}
						placeholder="— Belum ditentukan / nyusul —"
						options={[
							{ value: "", label: "— Belum ditentukan / nyusul —" },
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

				{backdropMissing && (
					<div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-900 dark:text-amber-200">
						<AlertTriangle className="mt-0.5 size-4 shrink-0" />
						<div>
							<p className="font-medium">Backdrop belum ditentukan</p>
							<p className="text-amber-900/80 dark:text-amber-200/80">
								Sistem akan reminder otomatis H-7 + H-3 kalau status masih
								kosong. Owner & klien wajib mutusin sebelum hari H.
							</p>
						</div>
					</div>
				)}

				{isVendorDecor && (
					<Field
						label="Markup Vendor Decor (Rp)"
						name="vendor_decor_markup"
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

				<label className="flex items-center gap-3 rounded-md border border-border-default bg-surface-2 p-4">
					<input
						type="checkbox"
						name="include_flashdisk_pouch"
						defaultChecked={
							state?.values
								? state.values.include_flashdisk_pouch === "on"
								: (defaults?.include_flashdisk_pouch ?? true)
						}
						className="h-4 w-4 rounded text-primary"
					/>
					<div className="space-y-0.5">
						<div className="text-fluid-body font-medium">
							Include flashdisk + pouch
						</div>
						<div className="text-fluid-caption text-muted-foreground">
							Standar Tetra: pouch + flashdisk berisi semua foto/video event.
							Uncheck kalau klien bawa FD sendiri / cuma minta softfile.
						</div>
					</div>
				</label>
			</Section>

			{/* === 7. LOCATION === */}
			<Section
				step={showReferrerBlock ? 7 : 6}
				title="Lokasi Event"
				description="Venue + alamat. Klik 'Cari di Google Maps' buat pin lokasi & paste URL kembali ke kolom."
			>
				<Field
					label="Nama Venue"
					name="venue_name"
					error={err("venue_name")}
					required
				>
					<input
						type="text"
						required
						value={venueName}
						onChange={(e) => setVenueName(e.target.value)}
						placeholder="cth. Grand Ballroom Hotel ABC"
						className={inputClass}
					/>
					<input type="hidden" name="venue_name" value={venueName} required />
				</Field>
				<div className="grid gap-6 md:grid-cols-2">
					<Field label="Alamat" name="venue_address" hint="Opsional">
						<input
							type="text"
							name="venue_address"
							defaultValue={get("venue_address")}
							placeholder="Jl. ..."
							className={inputClass}
						/>
					</Field>
					<Field label="Kota" name="venue_city" hint="Opsional">
						<input
							type="text"
							value={venueCity}
							onChange={(e) => setVenueCity(e.target.value)}
							placeholder="Bogor"
							className={inputClass}
						/>
						<input type="hidden" name="venue_city" value={venueCity} />
					</Field>
				</div>
				<Field
					label="Google Maps URL"
					name="google_maps_url"
					hint="Tombol di kanan akan buka Google Maps search — copy URL hasil pin & paste di sini."
				>
					<div className="flex gap-2">
						<input
							type="url"
							value={mapsUrl}
							onChange={(e) => setMapsUrl(e.target.value)}
							placeholder="https://maps.app.goo.gl/..."
							className={`${inputClass} flex-1`}
						/>
						<button
							type="button"
							onClick={openMapsSearch}
							disabled={!venueName}
							title={
								venueName
									? `Cari "${venueName}${venueCity ? `, ${venueCity}` : ""}" di Google Maps`
									: "Isi nama venue dulu"
							}
							className="press-down inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
						>
							<MapPin className="size-4" />
							Cari di Maps
						</button>
					</div>
					<input type="hidden" name="google_maps_url" value={mapsUrl} />
				</Field>
			</Section>

			{/* === 8. CONTACTS === */}
			<Section
				step={showReferrerBlock ? 8 : 7}
				title="Kontak"
				description="Klien (yang booking) + PIC di lapangan untuk koordinasi crew hari-H."
			>
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="WA Klien (yang booking)"
						name="client_wa"
						error={err("client_wa")}
						hint="Format: 08xxxxxxxxxx atau +628xxxxxxxxxx"
						required
					>
						<input
							type="tel"
							required
							value={clientWa}
							onChange={(e) => setClientWa(e.target.value)}
							placeholder="081234567890"
							className={`${inputClass} tabular`}
						/>
						<input type="hidden" name="client_wa" value={clientWa} required />
					</Field>
					<Field label="Email Klien" name="client_email" hint="Opsional">
						<input
							type="email"
							name="client_email"
							defaultValue={get("client_email")}
							placeholder="andi@email.com"
							className={inputClass}
						/>
					</Field>
				</div>

				<div className="rounded-lg border border-border-default bg-surface-2 p-4 space-y-3">
					<div className="flex items-center gap-2 text-fluid-body font-medium">
						<Users className="size-4 text-primary" />
						PIC di Lokasi (WO / EO / Panitia)
					</div>
					<p className="text-fluid-caption text-muted-foreground">
						Bisa beda dengan klien yang booking. Ini orang yang crew koordinasi
						saat di lapangan hari-H.
					</p>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Nama PIC" name="pic_name" hint="Opsional">
							<input
								type="text"
								value={picName}
								onChange={(e) => setPicName(e.target.value)}
								placeholder="cth. Bu Hanna (WO)"
								className={inputClass}
							/>
							<input type="hidden" name="pic_name" value={picName} />
						</Field>
						<Field
							label="WA PIC"
							name="pic_wa"
							hint="Akan dipakai di template reminder crew"
						>
							<input
								type="tel"
								value={picWa}
								onChange={(e) => setPicWa(e.target.value)}
								placeholder="081234567890"
								className={`${inputClass} tabular`}
							/>
							<input type="hidden" name="pic_wa" value={picWa} />
						</Field>
					</div>
				</div>
			</Section>

			{/* === 9. ADD-ONS === */}
			<Section
				step={showReferrerBlock ? 9 : 8}
				title="Add-ons"
				description="Voucher, print extras, costume, dll."
			>
				<input type="hidden" name="addons_json" value={addonsJson} />
				{addons.length === 0 ? (
					<p className="text-fluid-body italic text-muted-foreground">
						Belum ada add-on aktif. Tambah dari Settings → Add-ons.
					</p>
				) : (
					<div className="space-y-4">
						{addonsByCategory.map(([category, items]) => (
							<div key={category} className="space-y-2">
								<h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									{ADDON_CATEGORY_LABELS[category] ?? category}
								</h4>
								<div className="space-y-1">
									{items.map((addon) => {
										const qty = selectedAddons[addon.id];
										const enabled = qty !== undefined;
										return (
											<label
												key={addon.id}
												className="flex cursor-pointer items-center gap-3 rounded-md border border-border-default bg-surface-2 p-3 hover:bg-muted/30"
											>
												<input
													type="checkbox"
													checked={enabled}
													onChange={(e) =>
														toggleAddon(addon.id, e.target.checked)
													}
													className="h-4 w-4 shrink-0 rounded text-primary"
												/>
												<div className="min-w-0 flex-1">
													<div className="truncate text-fluid-body font-medium">
														{addon.name}
													</div>
													<div className="text-fluid-caption text-muted-foreground">
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
														<span className="tabular w-28 shrink-0 text-right text-fluid-body font-medium text-foreground">
															{formatRupiah(addon.price * qty)}
														</span>
													</>
												) : (
													<span className="w-44 shrink-0 text-right text-fluid-caption text-muted-foreground">
														Klik untuk pilih
													</span>
												)}
											</label>
										);
									})}
								</div>
							</div>
						))}
						<div className="flex items-center justify-between rounded-md bg-muted px-4 py-2 text-fluid-body">
							<span className="text-muted-foreground">Add-ons subtotal</span>
							<span className="tabular font-medium">
								{formatRupiah(addonsTotal)}
							</span>
						</div>
					</div>
				)}
			</Section>

			{/* === 10. FINANCIAL === */}
			<Section
				step={showReferrerBlock ? 10 : 9}
				title="Financial"
				description="Harga dan modifier."
			>
				<Field
					label="Base Price (IDR)"
					name="base_price"
					error={err("base_price")}
					hint="Auto-fill dari paket; bisa override manual"
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
						hint="Markup pajak untuk corporate. Default 2% × base. Manual override boleh."
					>
						<div className="flex gap-2">
							<input
								type="number"
								name="gross_up_pph_amount"
								min={0}
								step={1}
								value={grossUp || ""}
								onChange={(e) => setGrossUp(Number(e.target.value) || 0)}
								placeholder="0"
								className={`${inputClass} tabular flex-1`}
							/>
							<button
								type="button"
								onClick={() =>
									setGrossUp(Math.round((basePrice * 2) / 98))
								}
								disabled={basePrice <= 0}
								title="Hitung otomatis 2% gross-up dari base price"
								className="press-down inline-flex h-10 shrink-0 items-center rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Auto 2%
							</button>
						</div>
					</Field>
				</div>

				<Field
					label="Catatan untuk Crew"
					name="crew_notes"
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

			<div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border-default bg-surface-2 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-surface-2/85 sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:px-8">
				<dl className="flex items-baseline gap-6 text-fluid-body">
					<div>
						<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Grand Total
						</dt>
						<dd className="tabular text-xl font-semibold text-foreground">
							{formatRupiah(grandTotal)}
						</dd>
					</div>
					<div className="text-[11px] text-muted-foreground">
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
						className="h-10 rounded-md border border-border-default bg-surface-2 px-4 text-fluid-body font-medium leading-10 hover:bg-muted"
					>
						Cancel
					</Link>
					<button
						type="submit"
						disabled={pending}
						className="press-down h-10 rounded-md bg-primary px-4 text-fluid-body font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
					>
						{pending ? "Menyimpan…" : submitLabel}
					</button>
				</div>
			</div>
		</form>
	);
}

const inputClass =
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-fluid-body text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Section({
	step,
	title,
	description,
	children,
}: {
	step: number;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-4">
			<div className="flex items-baseline gap-3">
				<Badge
					variant="outline"
					className="h-6 shrink-0 border-primary/30 bg-primary/10 px-2 text-[11px] font-semibold text-primary"
				>
					{step}
				</Badge>
				<div className="space-y-0.5">
					<h3 className="text-fluid-body font-semibold tracking-tight">
						{title}
					</h3>
					<p className="text-fluid-caption text-muted-foreground">
						{description}
					</p>
				</div>
			</div>
			<div className="space-y-4 pl-9">{children}</div>
		</section>
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
			<label htmlFor={name} className="text-fluid-body font-medium">
				{label}
				{required && <span className="ml-0.5 text-primary">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-fluid-caption text-destructive">{error}</p>
			) : hint ? (
				<p className="text-fluid-caption text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
