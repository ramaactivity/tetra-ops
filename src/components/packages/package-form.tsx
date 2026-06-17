"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
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
			{state?.errors?._form && (
				<div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm font-medium">
					<AlertCircle className="mt-0.5 size-4 shrink-0" />
					<span>{state.errors._form[0]}</span>
				</div>
			)}

			{/* Section: Identitas */}
			<Section
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
						className={inputClass}
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
			</Section>

			<div className="border-border-subtle border-t" />

			{/* Section: Spesifikasi & Harga */}
			<Section
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
						<div className="relative">
							<input
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
								className={cn(inputClass, "tabular pr-12")}
							/>
							<span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
								jam
							</span>
						</div>
					</Field>

					<Field
						label="Base Price"
						name="base_price"
						error={err("base_price")}
						hint="Tanpa titik atau koma"
						required
					>
						<div className="relative">
							<span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium">
								Rp
							</span>
							<input
								id="base_price"
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
								className={cn(inputClass, "tabular pl-9")}
							/>
						</div>
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
						className={cn(inputClass, "h-auto resize-none py-2.5")}
					/>
				</Field>
			</Section>

			<div className="border-border-subtle border-t" />

			{/* Section: Status */}
			<Section
				eyebrow="03 — Visibilitas"
				title="Status paket"
				description="Hanya paket aktif yang muncul di form booking baru."
			>
				<input type="hidden" name="is_active" value={isActive ? "on" : ""} />
				<div className="border-border-default bg-card inline-flex w-full max-w-sm items-center gap-1 rounded-xl border p-1">
					<ToggleOption
						active={isActive}
						onClick={() => setIsActive(true)}
						label="Aktif"
						hint="Tampil di booking"
					/>
					<ToggleOption
						active={!isActive}
						onClick={() => setIsActive(false)}
						label="Arsip"
						hint="Disembunyikan"
					/>
				</div>
			</Section>

			{/* Sticky action footer */}
			<div className="border-border-subtle bg-card/80 sticky bottom-0 -mx-4 -mb-4 flex items-center justify-end gap-3 border-t px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:-mb-6 sm:px-6">
				<Link
					href="/operations/packages"
					className="border-border-default bg-card hover:bg-secondary inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
				>
					Cancel
				</Link>
				<button
					type="submit"
					disabled={pending}
					className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
				>
					{pending ? "Menyimpan…" : submitLabel}
				</button>
			</div>
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring focus-visible:border-border-strong h-10 w-full rounded-lg border px-3 text-sm placeholder:text-muted-foreground/60 transition-colors focus-visible:ring-2 focus-visible:outline-none";

function Section({
	eyebrow,
	title,
	description,
	children,
}: {
	eyebrow: string;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="grid gap-5 md:grid-cols-[200px_1fr] md:gap-8">
			<div className="space-y-1">
				<span className="eyebrow text-muted-foreground">{eyebrow}</span>
				<h3 className="text-foreground text-[15px] font-semibold">{title}</h3>
				<p className="type-caption text-muted-foreground leading-snug">
					{description}
				</p>
			</div>
			<div className="space-y-5">{children}</div>
		</section>
	);
}

function ToggleOption({
	active,
	onClick,
	label,
	hint,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	hint: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex flex-1 flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
				active
					? "bg-secondary shadow-[var(--shadow-level-1)]"
					: "hover:bg-secondary/50",
			)}
		>
			<span className="flex items-center gap-1.5 text-sm font-medium">
				<span
					className={cn(
						"size-1.5 rounded-full",
						active && label === "Aktif"
							? "bg-emerald-500"
							: active
								? "bg-muted-foreground"
								: "bg-transparent",
					)}
				/>
				<span className={active ? "text-foreground" : "text-muted-foreground"}>
					{label}
				</span>
			</span>
			<span className="text-muted-foreground pl-3 text-[11px]">{hint}</span>
		</button>
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
			<label htmlFor={name} className="text-foreground text-sm font-medium">
				{label}
				{required && <span className="text-destructive ml-0.5">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-destructive flex items-center gap-1 text-xs">
					<AlertCircle className="size-3" />
					{error}
				</p>
			) : hint ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}
