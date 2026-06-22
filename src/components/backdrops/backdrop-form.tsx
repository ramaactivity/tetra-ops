"use client";

import { useActionState, useState } from "react";
import {
	AffixInput,
	Field,
	FormDivider,
	FormError,
	FormSection,
	fieldInputClass,
	StatusToggle,
	StickyFormFooter,
} from "@/components/catalog/form-kit";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import {
	type BackdropFormState,
	createBackdrop,
	updateBackdrop,
} from "@/lib/actions/backdrops";
import { cn } from "@/lib/utils";

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
	const [isActive, setIsActive] = useState<boolean>(
		state?.values?.is_active !== undefined
			? state.values.is_active === "on"
			: defaults.is_active,
	);

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
		<form action={formAction} className="space-y-6">
			<FormError message={state?.errors?._form?.[0]} />

			<FormSection
				eyebrow="01 — Identitas"
				title="Code & nama"
				description="Code unik untuk referensi internal; nama tampil di booking form."
			>
				<div className="grid gap-5 md:grid-cols-2">
					<Field
						label="Code"
						name="code"
						error={err("code")}
						hint="Huruf kapital, angka, hyphen. Contoh: BG-RENTAL-LUX-03"
						required
					>
						<input
							id="code"
							type="text"
							name="code"
							required
							defaultValue={get("code")}
							placeholder="BG-RENTAL-LUX-03"
							className={cn(fieldInputClass, "font-mono uppercase")}
							readOnly={mode === "edit"}
						/>
					</Field>

					<Field label="Nama" name="name" error={err("name")} required>
						<input
							id="name"
							type="text"
							name="name"
							required
							defaultValue={get("name")}
							placeholder="Backdrop Rental Luxury #03"
							className={fieldInputClass}
						/>
					</Field>
				</div>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="02 — Tipe & harga"
				title="Klasifikasi"
				description="Tipe menentukan cara backdrop dihitung di booking dan apakah ada harga sewa."
			>
				<Field label="Tipe" name="type" error={err("type")} required>
					<NativeSelect
						value={type}
						onValueChange={(v) => setType(v as BackdropType)}
						options={TYPE_OPTIONS.map((t) => ({
							value: t.value,
							label: t.label,
						}))}
						triggerClassName="w-full"
						aria-invalid={!!err("type")}
					/>
					<input type="hidden" name="type" value={type} required />
					<p className="text-muted-foreground mt-1.5 text-xs">
						{TYPE_OPTIONS.find((t) => t.value === type)?.hint}
					</p>
				</Field>

				<div className="grid gap-5 md:grid-cols-2">
					<Field
						label="Harga Sewa"
						name="rental_price"
						error={err("rental_price")}
						hint={
							showRentalPrice
								? "Auto-add ke booking ketika dipilih"
								: "Hanya untuk Rental Owned — auto-set 0 untuk tipe lain"
						}
					>
						<AffixInput
							id="rental_price"
							type="number"
							name="rental_price"
							min={0}
							step={1}
							defaultValue={showRentalPrice ? get("rental_price") : "0"}
							readOnly={!showRentalPrice}
							prefix="Rp"
							className="tabular"
						/>
					</Field>

					<Field
						label="Display Order"
						name="display_order"
						error={err("display_order")}
						hint="Urutan tampil — kecil = atas"
					>
						<input
							id="display_order"
							type="number"
							name="display_order"
							min={0}
							step={1}
							defaultValue={get("display_order")}
							className={cn(fieldInputClass, "tabular")}
						/>
					</Field>
				</div>

				<Field label="Deskripsi" name="description" error={err("description")}>
					<RichTextarea
						id="description"
						name="description"
						rows={2}
						maxLength={300}
						defaultValue={get("description")}
						placeholder="Premium rental backdrop (owned by Tetra)"
						toolbar={false}
					/>
				</Field>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="03 — Visibilitas"
				title="Status backdrop"
				description="Hanya backdrop aktif yang muncul di booking form."
			>
				<input type="hidden" name="is_active" value={isActive ? "on" : ""} />
				<StatusToggle
					active={isActive}
					onChange={setIsActive}
					activeLabel="Aktif"
					inactiveLabel="Nonaktif"
					activeHint="Tampil di booking"
					inactiveHint="Disembunyikan"
				/>
			</FormSection>

			<StickyFormFooter
				cancelHref="/operations/backdrops"
				submitLabel={mode === "create" ? "Buat backdrop" : "Simpan perubahan"}
				pending={pending}
			/>
		</form>
	);
}
