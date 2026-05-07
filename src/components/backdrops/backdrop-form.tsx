"use client";

import { useActionState, useState } from "react";
import {
	type BackdropFormState,
	createBackdrop,
	updateBackdrop,
} from "@/lib/actions/backdrops";

type BackdropType = "basic_included" | "rental_owned" | "vendor_decor";

type Defaults = {
	code: string;
	name: string;
	type: BackdropType;
	rental_price: string;
	display_order: string;
	description: string;
	is_active: boolean;
};

const EMPTY: Defaults = {
	code: "",
	name: "",
	type: "basic_included",
	rental_price: "0",
	display_order: "0",
	description: "",
	is_active: true,
};

const TYPE_OPTIONS: Array<{
	value: BackdropType;
	label: string;
	hint: string;
}> = [
	{
		value: "basic_included",
		label: "Basic Included",
		hint: "Warna dasar — gratis, ikut kalau klien gak pakai vendor decor",
	},
	{
		value: "rental_owned",
		label: "Rental Owned",
		hint: "Backdrop premium milik Tetra — harga sewa per event",
	},
	{
		value: "vendor_decor",
		label: "Vendor Decor",
		hint: "Klien pakai vendor decor — Tetra ambil markup di booking form",
	},
];

export function BackdropForm({
	mode,
	id,
	defaults = EMPTY,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: Defaults;
}) {
	const action =
		mode === "create" ? createBackdrop : updateBackdrop.bind(null, id ?? "");
	const [state, formAction, pending] = useActionState<
		BackdropFormState,
		FormData
	>(action, undefined);

	const [type, setType] = useState<BackdropType>(defaults.type);

	const get = (key: keyof Defaults) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const showRentalPrice = type === "rental_owned";

	return (
		<form action={formAction} className="space-y-5">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Code"
					name="code"
					error={err("code")}
					hint="Huruf kapital, angka, hyphen. Contoh: BG-RENTAL-LUX-03"
					required
				>
					<input
						type="text"
						name="code"
						required
						defaultValue={get("code")}
						placeholder="BG-RENTAL-LUX-03"
						className={`${inputClass} font-mono uppercase`}
						readOnly={mode === "edit"}
					/>
				</Field>

				<Field label="Nama" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						defaultValue={get("name")}
						placeholder="Backdrop Rental Luxury #03"
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="Tipe" name="type" error={err("type")} required>
				<select
					name="type"
					required
					value={type}
					onChange={(e) => setType(e.target.value as BackdropType)}
					className={selectClass}
				>
					{TYPE_OPTIONS.map((t) => (
						<option key={t.value} value={t.value}>
							{t.label}
						</option>
					))}
				</select>
				<p className="text-muted-foreground text-xs mt-1.5">
					{TYPE_OPTIONS.find((t) => t.value === type)?.hint}
				</p>
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Harga Sewa (Rp)"
					name="rental_price"
					error={err("rental_price")}
					hint={
						showRentalPrice
							? "Auto-add ke booking ketika dipilih"
							: "Hanya untuk Rental Owned — auto-set 0 untuk tipe lain"
					}
				>
					<input
						type="number"
						name="rental_price"
						min={0}
						step={1}
						defaultValue={showRentalPrice ? get("rental_price") : "0"}
						readOnly={!showRentalPrice}
						className={`${inputClass} tabular`}
					/>
				</Field>

				<Field
					label="Display Order"
					name="display_order"
					error={err("display_order")}
					hint="Urutan tampil — kecil = atas"
				>
					<input
						type="number"
						name="display_order"
						min={0}
						step={1}
						defaultValue={get("display_order")}
						className={`${inputClass} tabular`}
					/>
				</Field>
			</div>

			<Field label="Deskripsi" name="description" error={err("description")}>
				<textarea
					name="description"
					rows={2}
					maxLength={300}
					defaultValue={get("description")}
					placeholder="Premium rental backdrop (owned by Tetra)"
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
					— hanya yang aktif muncul di booking form
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
							? "Buat backdrop"
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
