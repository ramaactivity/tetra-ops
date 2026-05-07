"use client";

import { useActionState } from "react";
import { logPayment, type PaymentFormState } from "@/lib/actions/payments";

const PAYMENT_TYPE_OPTIONS: Array<[string, string]> = [
	["dp", "DP (Down Payment)"],
	["partial", "Partial"],
	["pelunasan", "Pelunasan"],
];

export type BankAccountOption = {
	id: string;
	bank_name: string;
	account_number: string | null;
	account_holder: string | null;
};

export function PaymentForm({
	eventId,
	projectId,
	bankAccounts,
	defaultDate,
	suggestedAmount,
}: {
	eventId: string;
	projectId: string;
	bankAccounts: BankAccountOption[];
	defaultDate: string;
	suggestedAmount?: number;
}) {
	const action = logPayment.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		PaymentFormState,
		FormData
	>(action, undefined);

	const get = (key: string, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";

	const err = (key: string) =>
		(state?.errors?.[key as keyof typeof state.errors] as string[] | undefined)?.[0];

	if (bankAccounts.length === 0) {
		return (
			<p className="text-muted-foreground text-sm italic">
				Belum ada bank account aktif. Tambah dari Settings → Banks.
			</p>
		);
	}

	return (
		<form action={formAction} className="space-y-4">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-3">
				<Field label="Jumlah (IDR)" name="amount" error={err("amount")} required>
					<input
						type="number"
						name="amount"
						min={1}
						step={1}
						required
						defaultValue={get("amount", suggestedAmount?.toString())}
						placeholder="500000"
						className={`${inputClass} tabular`}
					/>
				</Field>

				<Field
					label="Tanggal"
					name="payment_date"
					error={err("payment_date")}
					required
				>
					<input
						type="date"
						name="payment_date"
						required
						defaultValue={get("payment_date", defaultDate)}
						className={inputClass}
					/>
				</Field>

				<Field
					label="Tipe"
					name="payment_type"
					error={err("payment_type")}
					required
				>
					<select
						name="payment_type"
						required
						defaultValue={get("payment_type", "dp")}
						className={selectClass}
					>
						{PAYMENT_TYPE_OPTIONS.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</Field>
			</div>

			<Field
				label="Bank Tujuan"
				name="bank_account_id"
				error={err("bank_account_id")}
				required
			>
				<select
					name="bank_account_id"
					required
					defaultValue={get("bank_account_id")}
					className={selectClass}
				>
					<option value="" disabled>
						Pilih bank…
					</option>
					{bankAccounts.map((b) => (
						<option key={b.id} value={b.id}>
							{b.bank_name}
							{b.account_number ? ` · ${b.account_number}` : ""}
							{b.account_holder ? ` · ${b.account_holder}` : ""}
						</option>
					))}
				</select>
			</Field>

			<Field
				label="Bukti URL"
				name="proof_url"
				error={err("proof_url")}
				hint="Link Drive/upload bukti transfer (opsional)"
			>
				<input
					type="url"
					name="proof_url"
					defaultValue={get("proof_url")}
					placeholder="https://drive.google.com/..."
					className={inputClass}
				/>
			</Field>

			<Field
				label="Catatan"
				name="notes"
				error={err("notes")}
				hint="Optional"
			>
				<textarea
					name="notes"
					rows={2}
					maxLength={500}
					defaultValue={get("notes")}
					className={`${inputClass} resize-none`}
				/>
			</Field>

			<div className="flex justify-end">
				<button
					type="submit"
					disabled={pending}
					className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending ? "Menyimpan…" : "Log payment"}
				</button>
			</div>
		</form>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
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
