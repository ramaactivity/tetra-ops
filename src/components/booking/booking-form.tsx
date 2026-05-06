"use client";

import Link from "next/link";
import { useActionState } from "react";
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

export function BookingForm({
	action,
	packages,
}: {
	action: Action;
	packages: PackageOption[];
}) {
	const [state, formAction, pending] = useActionState(action, undefined);

	const get = (key: keyof BookingInput, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";

	const err = (key: keyof BookingInput) => state?.errors?.[key]?.[0];

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
					hint="Pilih dari pricelist atau biarkan kosong untuk custom"
				>
					<select
						name="package_id"
						defaultValue={get("package_id")}
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

			<div className="border-border flex items-center justify-end gap-3 border-t pt-6">
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
					{pending ? "Menyimpan…" : "Save as draft"}
				</button>
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
