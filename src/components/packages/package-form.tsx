"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import type {
	PackageFormState,
	PackageInput,
} from "@/lib/actions/packages";
import {
	FRAME_SIZE_LABELS,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";

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

	const get = (key: keyof PackageInput, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";

	const err = (key: keyof PackageInput) => state?.errors?.[key]?.[0];

	return (
		<form action={formAction} className="space-y-6">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<Field
				label="Nama Package"
				name="name"
				error={err("name")}
				required
			>
				<input
					type="text"
					name="name"
					required
					defaultValue={get("name", defaults?.name ?? "")}
					placeholder='cth. "2R Unlimited 3 Jam"'
					className={inputClass}
				/>
			</Field>

			<div className="grid gap-6 md:grid-cols-2">
				<Field label="Kategori" name="category" error={err("category")} required>
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

			<div className="grid gap-6 md:grid-cols-2">
				<Field
					label="Durasi (jam)"
					name="duration_hours"
					error={err("duration_hours")}
					required
				>
					<input
						type="number"
						name="duration_hours"
						required
						min={1}
						max={24}
						defaultValue={get(
							"duration_hours",
							defaults?.duration_hours?.toString(),
						)}
						className={inputClass}
					/>
				</Field>

				<Field
					label="Base Price (IDR)"
					name="base_price"
					error={err("base_price")}
					hint="Tanpa titik atau koma"
					required
				>
					<input
						type="number"
						name="base_price"
						required
						min={1}
						step={1}
						defaultValue={get(
							"base_price",
							defaults?.base_price?.toString(),
						)}
						placeholder="3000000"
						className={`${inputClass} tabular`}
					/>
				</Field>
			</div>

			<Field
				label="Deskripsi"
				name="description"
				error={err("description")}
				hint="Opsional"
			>
				<textarea
					name="description"
					rows={3}
					maxLength={500}
					defaultValue={get("description", defaults?.description ?? "")}
					className={`${inputClass} resize-none`}
				/>
			</Field>

			<label className="border-border-default bg-surface-2 flex items-center gap-3 rounded-md border p-4">
				<input
					type="checkbox"
					name="is_active"
					defaultChecked={
						state?.values
							? state.values.is_active === "on"
							: (defaults?.is_active ?? true)
					}
					className="text-primary h-4 w-4 rounded"
				/>
				<div className="space-y-0.5">
					<div className="text-sm font-medium">Aktif</div>
					<div className="text-muted-foreground text-xs">
						Hanya package aktif yang muncul di form booking baru.
					</div>
				</div>
			</label>

			<div className="flex items-center justify-end gap-3 border-t border-border-default pt-6">
				<Link
					href="/operations/packages"
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
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";

const selectClass = `${inputClass} appearance-none`;

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
