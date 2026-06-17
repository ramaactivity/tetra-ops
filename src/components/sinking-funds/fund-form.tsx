"use client";

import { useActionState, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import {
	createSinkingFund,
	type FundFormState,
	updateSinkingFund,
} from "@/lib/actions/sinking-funds";

type Defaults = {
	code: string;
	name: string;
	description: string;
	allocation_type: "percentage" | "flat";
	allocation_value: string;
	target_balance: string;
	coa_account: string;
	display_order: string;
	is_active: boolean;
};

const EMPTY: Defaults = {
	code: "",
	name: "",
	description: "",
	allocation_type: "percentage",
	allocation_value: "5",
	target_balance: "",
	coa_account: "",
	display_order: "0",
	is_active: true,
};

export function SinkingFundForm({
	mode,
	id,
	defaults = EMPTY,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: Defaults;
}) {
	const action =
		mode === "create" ? createSinkingFund : updateSinkingFund.bind(null, id!);
	const [state, formAction, pending] = useActionState<FundFormState, FormData>(
		action,
		undefined,
	);

	const [allocType, setAllocType] = useState<"percentage" | "flat">(
		defaults.allocation_type,
	);

	const get = (key: keyof Defaults, fallback?: string) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		return fallback ?? String(defaults[key] ?? "");
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

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
					hint="Lowercase, angka, underscore. Contoh: equipment, crew_reserve"
					required
				>
					<input
						type="text"
						name="code"
						required
						defaultValue={get("code")}
						placeholder="equipment"
						className={`${inputClass} font-mono`}
						readOnly={mode === "edit"}
					/>
				</Field>

				<Field label="Nama" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						defaultValue={get("name")}
						placeholder="Equipment Fund"
						className={inputClass}
					/>
				</Field>
			</div>

			<Field
				label="Deskripsi"
				name="description"
				error={err("description")}
				hint="Singkat — buat apa fund ini"
			>
				<textarea
					name="description"
					rows={2}
					maxLength={300}
					defaultValue={get("description")}
					placeholder="Reserve untuk pembelian alat baru / upgrade"
					className={`${inputClass} resize-none`}
				/>
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Tipe Alokasi"
					name="allocation_type"
					error={err("allocation_type")}
					required
				>
					<NativeSelect
						value={allocType}
						onValueChange={(v) => setAllocType(v as "percentage" | "flat")}
						options={[
							{
								value: "percentage",
								label: "Percentage (% dari net profit)",
							},
							{ value: "flat", label: "Flat (Rupiah tetap per event)" },
						]}
						triggerClassName="w-full"
						aria-invalid={!!err("allocation_type")}
					/>
					<input
						type="hidden"
						name="allocation_type"
						value={allocType}
						required
					/>
				</Field>

				<Field
					label={
						allocType === "percentage"
							? "Persentase (%)"
							: "Jumlah per event (Rp)"
					}
					name="allocation_value"
					error={err("allocation_value")}
					hint={
						allocType === "percentage"
							? "Misal 5 = 5% dari net profit"
							: "Misal 100000 = Rp 100k flat"
					}
					required
				>
					<input
						type="number"
						name="allocation_value"
						min={0}
						step={allocType === "percentage" ? 0.01 : 1}
						required
						defaultValue={get("allocation_value")}
						placeholder={allocType === "percentage" ? "5" : "100000"}
						className={`${inputClass} tabular`}
					/>
				</Field>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Target Balance (Rp)"
					name="target_balance"
					error={err("target_balance")}
					hint="Optional — visualisasi progress di list"
				>
					<input
						type="number"
						name="target_balance"
						min={0}
						step={1}
						defaultValue={get("target_balance")}
						placeholder="20000000"
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

			<Field
				label="COA Account"
				name="coa_account"
				error={err("coa_account")}
				hint="Opsional — kode akun di Chart of Accounts"
			>
				<input
					type="text"
					name="coa_account"
					maxLength={20}
					defaultValue={get("coa_account")}
					placeholder="2-200"
					className={`${inputClass} font-mono`}
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
					— hanya fund aktif yang dapat alokasi dari settlement
				</span>
			</label>

			<div className="flex justify-end gap-2 pt-2">
				<button
					type="submit"
					disabled={pending}
					className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Buat fund"
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
