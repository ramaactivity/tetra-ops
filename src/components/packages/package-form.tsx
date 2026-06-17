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
import type { PackageFormState, PackageInput } from "@/lib/actions/packages";
import { FRAME_SIZE_LABELS, SERVICE_TYPE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const SERVICE_TYPE_OPTIONS = Object.entries(SERVICE_TYPE_LABELS);
const FRAME_SIZE_OPTIONS = Object.entries(FRAME_SIZE_LABELS);

type Action = (
	prev: PackageFormState,
	formData: FormData,
) => Promise<PackageFormState>;

type Defaults = Partial<
	Pick<
		PackageInput,
		| "name"
		| "category"
		| "frame_size"
		| "duration_hours"
		| "base_price"
		| "description"
		| "is_active"
	>
>;

export function PackageForm({
	action,
	submitLabel,
	defaults,
}: {
	action: Action;
	submitLabel: string;
	defaults?: Defaults;
}) {
	const [state, formAction, pending] = useActionState(action, undefined);
	const [isActive, setIsActive] = useState<boolean>(
		state?.values
			? state.values.is_active === "on"
			: (defaults?.is_active ?? true),
	);

	const get = (key: keyof PackageInput, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";

	const err = (key: keyof PackageInput) => state?.errors?.[key]?.[0];

	return (
		<form action={formAction} className="space-y-6">
			<FormError message={state?.errors?._form?.[0]} />

			<FormSection
				eyebrow="01 — Identitas"
				title="Nama & kategori"
				description="Nama paket akan muncul di form booking dan invoice."
			>
				<Field label="Nama Package" name="name" error={err("name")} required>
					<input
						id="name"
						type="text"
						name="name"
						required
						defaultValue={get("name", defaults?.name ?? "")}
						placeholder='cth. "2R Unlimited 3 Jam"'
						className={fieldInputClass}
					/>
				</Field>

				<div className="grid gap-5 md:grid-cols-2">
					<Field
						label="Kategori"
						name="category"
						error={err("category")}
						required
					>
						<PkgCategorySelect
							defaultValue={get("category", defaults?.category ?? "")}
							error={!!err("category")}
						/>
					</Field>

					<Field
						label="Frame Size"
						name="frame_size"
						error={err("frame_size")}
						required
					>
						<PkgFrameSizeSelect
							defaultValue={get("frame_size", defaults?.frame_size ?? "")}
							error={!!err("frame_size")}
						/>
					</Field>
				</div>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="02 — Spesifikasi & harga"
				title="Durasi & base price"
				description="Harga dasar sebelum add-on. Booking lama memakai snapshot harganya sendiri."
			>
				<div className="grid gap-5 md:grid-cols-2">
					<Field
						label="Durasi"
						name="duration_hours"
						error={err("duration_hours")}
						hint="1–24 jam"
						required
					>
						<AffixInput
							id="duration_hours"
							type="number"
							name="duration_hours"
							required
							min={1}
							max={24}
							defaultValue={get(
								"duration_hours",
								defaults?.duration_hours?.toString(),
							)}
							placeholder="3"
							suffix="jam"
							className="tabular"
						/>
					</Field>

					<Field
						label="Base Price"
						name="base_price"
						error={err("base_price")}
						hint="Tanpa titik atau koma"
						required
					>
						<AffixInput
							id="base_price"
							type="number"
							name="base_price"
							required
							min={1}
							step={1}
							defaultValue={get("base_price", defaults?.base_price?.toString())}
							placeholder="3000000"
							prefix="Rp"
							className="tabular"
						/>
					</Field>
				</div>

				<Field
					label="Deskripsi"
					name="description"
					error={err("description")}
					hint="Opsional — catatan internal"
				>
					<textarea
						id="description"
						name="description"
						rows={3}
						maxLength={500}
						defaultValue={get("description", defaults?.description ?? "")}
						placeholder="Detail tambahan tentang paket ini…"
						className={cn(fieldInputClass, "h-auto resize-none py-2.5")}
					/>
				</Field>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="03 — Visibilitas"
				title="Status paket"
				description="Hanya paket aktif yang muncul di form booking baru."
			>
				<input type="hidden" name="is_active" value={isActive ? "on" : ""} />
				<StatusToggle
					active={isActive}
					onChange={setIsActive}
					activeHint="Tampil di booking"
					inactiveHint="Disembunyikan"
				/>
			</FormSection>

			<StickyFormFooter
				cancelHref="/operations/packages"
				submitLabel={submitLabel}
				pending={pending}
			/>
		</form>
	);
}

function PkgCategorySelect({
	defaultValue,
	error,
}: {
	defaultValue: string;
	error: boolean;
}) {
	const [category, setCategory] = useState(defaultValue);
	return (
		<>
			<NativeSelect
				value={category}
				onValueChange={setCategory}
				placeholder="Pilih kategori…"
				options={SERVICE_TYPE_OPTIONS.map(([value, label]) => ({
					value,
					label,
				}))}
				triggerClassName="w-full"
				aria-invalid={error}
			/>
			<input type="hidden" name="category" value={category} required />
		</>
	);
}

function PkgFrameSizeSelect({
	defaultValue,
	error,
}: {
	defaultValue: string;
	error: boolean;
}) {
	const [frameSize, setFrameSize] = useState(defaultValue);
	return (
		<>
			<NativeSelect
				value={frameSize}
				onValueChange={setFrameSize}
				placeholder="Pilih frame…"
				options={FRAME_SIZE_OPTIONS.map(([value, label]) => ({
					value,
					label: label === "—" ? "None" : label,
				}))}
				triggerClassName="w-full"
				aria-invalid={error}
			/>
			<input type="hidden" name="frame_size" value={frameSize} required />
		</>
	);
}
