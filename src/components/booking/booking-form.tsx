"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type {
	BookingFormState,
	BookingInput,
} from "@/lib/actions/bookings";
import {
	CHANNEL_TYPE_LABELS,
	FRAME_SIZE_LABELS,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";

const CHANNEL_OPTIONS = Object.entries(CHANNEL_TYPE_LABELS);
const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS);
const FRAME_SIZE_OPTIONS = Object.entries(FRAME_SIZE_LABELS);
const BACKDROP_SOURCE_OPTIONS: Array<[string, string]> = [
	["basic_tetra", "Basic Tetra (in-house)"],
	["custom", "Custom design"],
];
const BACKDROP_COLOR_OPTIONS: Array<[string, string]> = [
	["merah", "Merah"],
	["gold", "Gold"],
	["putih", "Putih"],
	["silver", "Silver"],
	["custom", "Custom color"],
];

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
	backdrop_source: string;
	backdrop_color: string;
	include_flashdisk_pouch: boolean;
	base_price: number;
	discount_amount: number;
	gross_up_pph_amount: number;
	crew_notes: string;
}>;

export function BookingForm({
	action,
	packages,
	defaults,
	submitLabel = "Save as draft",
}: {
	action: Action;
	packages: PackageOption[];
	defaults?: BookingFormDefaults;
	submitLabel?: string;
}) {
	const [state, formAction, pending] = useActionState(action, undefined);

	const get = (key: keyof BookingInput, fallback?: string) =>
		state?.values?.[key] ??
		(defaults?.[key as keyof BookingFormDefaults] as
			| string
			| number
			| undefined
		)?.toString() ??
		fallback ??
		"";

	const err = (key: keyof BookingInput) => state?.errors?.[key]?.[0];

	const initialPkgId =
		state?.values?.package_id ?? defaults?.package_id ?? "";
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

	const grandTotal = useMemo(
		() => Math.max(0, basePrice - discount + grossUp),
		[basePrice, discount, grossUp],
	);

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

			<Section title="Channel & Client" description="Sumber booking dan kontak klien">
				<Field label="Sales Channel" name="channel" error={err("channel")} required>
					<select
						name="channel"
						required
						defaultValue={get("channel", "direct")}
						className={selectClass}
					>
						{CHANNEL_OPTIONS.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</Field>

				<div className="grid gap-6 md:grid-cols-2">
					<Field label="Nama Klien" name="client_name" error={err("client_name")} required>
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
						<select
							name="service_type"
							required
							defaultValue={get("service_type", "")}
							className={selectClass}
						>
							<option value="" disabled>
								Pilih service…
							</option>
							{SERVICE_TYPE_OPTIONS.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</Field>

					<Field
						label="Frame Size"
						name="frame_size"
						error={err("frame_size")}
						required
					>
						<select
							name="frame_size"
							required
							defaultValue={get("frame_size", "")}
							className={selectClass}
						>
							<option value="" disabled>
								Pilih frame…
							</option>
							{FRAME_SIZE_OPTIONS.map(([value, label]) => (
								<option key={value} value={value}>
									{label === "—" ? "None" : label}
								</option>
							))}
						</select>
					</Field>
				</div>

				<Field
					label="Package (Opsional)"
					name="package_id"
					error={err("package_id")}
					hint="Pilih dari pricelist; base price akan auto-fill"
				>
					<select
						name="package_id"
						value={packageId}
						onChange={(e) => handlePackageChange(e.target.value)}
						className={selectClass}
					>
						<option value="">— Custom / belum dipilih —</option>
						{packages.map((pkg) => (
							<option key={pkg.id} value={pkg.id}>
								{pkg.name} · {pkg.duration_hours}j ·{" "}
								{formatRupiah(pkg.base_price)}
							</option>
						))}
					</select>
				</Field>
			</Section>

			<Section title="Customization" description="Backdrop dan add-on standar">
				<div className="grid gap-6 md:grid-cols-2">
					<Field
						label="Sumber Backdrop"
						name="backdrop_source"
						error={err("backdrop_source")}
					>
						<select
							name="backdrop_source"
							defaultValue={get("backdrop_source", "basic_tetra")}
							className={selectClass}
						>
							{BACKDROP_SOURCE_OPTIONS.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</Field>

					<Field
						label="Warna Backdrop"
						name="backdrop_color"
						error={err("backdrop_color")}
						hint="Optional bila custom design"
					>
						<select
							name="backdrop_color"
							defaultValue={get("backdrop_color")}
							className={selectClass}
						>
							<option value="">—</option>
							{BACKDROP_COLOR_OPTIONS.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</Field>
				</div>

				<label className="border-border bg-card flex items-center gap-3 rounded-md border p-4">
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
						hint="cth. pernikahan, corporate, ulang tahun"
						required
					>
						<input
							type="text"
							name="event_category"
							required
							defaultValue={get("event_category")}
							placeholder="pernikahan"
							className={inputClass}
						/>
					</Field>

					<Field
						label="Tanggal Event"
						name="event_date"
						error={err("event_date")}
						required
					>
						<input
							type="date"
							name="event_date"
							required
							defaultValue={get("event_date")}
							className={inputClass}
						/>
					</Field>
				</div>

				<div className="grid gap-6 md:grid-cols-3">
					<Field label="Setup" name="setup_time" error={err("setup_time")} required>
						<input
							type="time"
							name="setup_time"
							required
							defaultValue={get("setup_time", "16:00")}
							className={inputClass}
						/>
					</Field>
					<Field label="Mulai" name="start_time" error={err("start_time")} required>
						<input
							type="time"
							name="start_time"
							required
							defaultValue={get("start_time", "18:00")}
							className={inputClass}
						/>
					</Field>
					<Field label="Selesai" name="end_time" error={err("end_time")} required>
						<input
							type="time"
							name="end_time"
							required
							defaultValue={get("end_time", "22:00")}
							className={inputClass}
						/>
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

			<div className="border-border bg-card sticky bottom-0 -mx-4 flex flex-col gap-3 border-t px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:flex-row sm:items-center sm:justify-between md:-mx-8 md:px-8">
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
						{discount > 0 && <> − {formatRupiah(discount)}</>}
						{grossUp > 0 && <> + {formatRupiah(grossUp)} PPh</>}
					</div>
				</dl>
				<div className="flex items-center gap-3">
					<Link
						href="/operations"
						className="border-border bg-card hover:bg-muted h-10 rounded-md border px-4 text-sm font-medium leading-10"
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
	"border-border bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";

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
