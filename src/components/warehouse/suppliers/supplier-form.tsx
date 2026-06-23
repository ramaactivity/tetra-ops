"use client";

import { Truck } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { NumberField, TextareaField } from "@/components/ui/form-fields";
import {
	createSupplier,
	type SupplierFormState,
	updateSupplier,
} from "@/lib/actions/suppliers";

const PAYMENT_TERM_OPTIONS = [
	{ value: "cash", label: "Cash (bayar saat ambil)" },
	{ value: "top_7", label: "TOP 7 hari" },
	{ value: "top_14", label: "TOP 14 hari" },
	{ value: "top_30", label: "TOP 30 hari" },
	{ value: "top_60", label: "TOP 60 hari" },
	{ value: "top_custom", label: "TOP custom (atur hari)" },
] as const;

export interface SupplierDefaults {
	name?: string;
	category?: string | null;
	contact?: string | null;
	default_payment_term?: string;
	default_top_days?: number;
	notes?: string | null;
	is_active?: boolean;
}

export function SupplierForm({
	mode,
	id,
	defaults,
	onSuccess,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: SupplierDefaults;
	onSuccess: () => void;
}) {
	const action =
		mode === "edit" && id
			? updateSupplier.bind(null, id)
			: createSupplier;
	const [state, formAction, pending] = useActionState<
		SupplierFormState,
		FormData
	>(action, undefined);

	const [paymentTerm, setPaymentTerm] = useState<string>(
		defaults?.default_payment_term ?? "cash",
	);

	useEffect(() => {
		if (state?.success) onSuccess();
	}, [state, onSuccess]);

	const get = (key: string, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	const formError = state?.errors?._form?.[0];
	const showTopDays = paymentTerm === "top_custom";

	return (
		<form action={formAction} className="space-y-5">
			{formError && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">{formError}</p>
				</div>
			)}

			{/* Section: Identity */}
			<section className="space-y-3">
				<SectionHeader
					icon={<Truck className="size-3.5" />}
					label="Identitas"
				/>
				<Field label="Nama Supplier" name="name" error={err("name")} required>
					<input
						id="name"
						name="name"
						type="text"
						required
						maxLength={120}
						defaultValue={get("name", defaults?.name)}
						placeholder="mis. Toko Frame Bandung"
						autoFocus
						className={inputCls}
					/>
				</Field>
				<div className="grid gap-3 sm:grid-cols-2">
					<Field
						label="Kategori"
						name="category"
						error={err("category")}
						hint="opsional — mis. Toko Frame, Percetakan"
					>
						<input
							id="category"
							name="category"
							type="text"
							maxLength={60}
							defaultValue={get("category", defaults?.category ?? "")}
							placeholder="Toko Box, Percetakan, dll"
							className={inputCls}
						/>
					</Field>
					<Field
						label="Kontak"
						name="contact"
						error={err("contact")}
						hint="opsional — WA / nomor / IG"
					>
						<input
							id="contact"
							name="contact"
							type="text"
							maxLength={120}
							defaultValue={get("contact", defaults?.contact ?? "")}
							placeholder="0812-..."
							className={inputCls}
						/>
					</Field>
				</div>
			</section>

			{/* Section: Payment terms */}
			<section className="space-y-3">
				<SectionHeader label="Pembayaran" />
				<div className="grid gap-3 sm:grid-cols-2">
					<Field
						label="Default Term"
						name="default_payment_term"
						error={err("default_payment_term")}
						hint="auto-fill saat catat Pembelian"
					>
						<Combobox
							id="default_payment_term"
							value={paymentTerm}
							onValueChange={(v) => setPaymentTerm(v ?? "cash")}
							options={PAYMENT_TERM_OPTIONS.map((o) => ({
								value: o.value,
								label: o.label,
							}))}
							allowFreeText={false}
						/>
						<input type="hidden" name="default_payment_term" value={paymentTerm} />
					</Field>
					{showTopDays ? (
						<Field
							label="Custom TOP (hari)"
							name="default_top_days"
							error={err("default_top_days")}
							hint="berapa hari batas pembayaran"
						>
							<NumberField
								id="default_top_days"
								name="default_top_days"
								min={1}
								max={365}
								step={1}
								defaultValue={get(
									"default_top_days",
									String(defaults?.default_top_days ?? 30),
								)}
								placeholder="30"
							/>
						</Field>
					) : (
						<div className="hidden sm:block" aria-hidden />
					)}
				</div>
			</section>

			{/* Section: Misc */}
			<section className="space-y-3">
				<SectionHeader label="Lainnya" />
				<Field
					label="Catatan"
					name="notes"
					error={err("notes")}
					hint="opsional — alamat, jam buka, kontak alternatif"
				>
					<TextareaField
						id="notes"
						name="notes"
						rows={3}
						maxLength={500}
						defaultValue={get("notes", defaults?.notes ?? "")}
					/>
				</Field>

				<label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border-default bg-surface-2/60 p-3">
					<input
						type="checkbox"
						name="is_active"
						value="true"
						defaultChecked={defaults?.is_active ?? true}
						className="mt-0.5 size-3.5"
					/>
					<div className="space-y-0.5">
						<div className="text-sm font-medium text-foreground">
							Supplier aktif
						</div>
						<div className="text-[11px] text-muted-foreground">
							Uncheck untuk sembunyikan dari list & lookup tanpa hapus permanen.
						</div>
					</div>
				</label>
			</section>

			<div className="flex items-center justify-end gap-2 border-t border-border-default pt-3">
				<button
					type="submit"
					disabled={pending}
					className="inline-flex h-10 items-center rounded-md bg-[#059669] dark:bg-[#0b9e6a] px-4 text-sm font-medium text-white hover:bg-[#047857] dark:hover:bg-[#059669] disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "edit"
							? "Simpan Perubahan"
							: "Tambah Supplier"}
				</button>
			</div>
		</form>
	);
}

const inputCls =
	"h-10 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm focus:border-[#059669] focus:outline-none focus:ring-1 focus:ring-primary/40";

function SectionHeader({
	icon,
	label,
}: {
	icon?: React.ReactNode;
	label: string;
}) {
	return (
		<div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
			{icon}
			{label}
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
				{required && <span className="ml-0.5 text-primary">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : hint ? (
				<p className="text-xs text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
