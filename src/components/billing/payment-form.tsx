"use client";

import { useActionState, useState } from "react";
import { ProofUploadButton } from "@/components/billing/proof-upload-button";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect } from "@/components/ui/native-select";
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
		(state?.errors?.[key as keyof typeof state.errors] as
			| string[]
			| undefined)?.[0];

	const [paymentDate, setPaymentDate] = useState(
		get("payment_date", defaultDate),
	);
	const [paymentType, setPaymentType] = useState(get("payment_type", "dp"));
	const [bankAccountId, setBankAccountId] = useState(get("bank_account_id"));
	const [proofUrl, setProofUrl] = useState(get("proof_url"));

	if (bankAccounts.length === 0) {
		return (
			<p className="text-fluid-body italic text-muted-foreground">
				Belum ada bank account aktif. Tambah dari Settings → Banks.
			</p>
		);
	}

	return (
		<form action={formAction} className="space-y-4">
			{state?.errors?._form && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-fluid-body font-medium text-destructive">
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
					<DatePicker
						value={paymentDate}
						onValueChange={setPaymentDate}
						placeholder="Pilih tanggal"
						aria-invalid={!!err("payment_date")}
					/>
					<input
						type="hidden"
						name="payment_date"
						value={paymentDate}
						required
					/>
				</Field>

				<Field
					label="Tipe"
					name="payment_type"
					error={err("payment_type")}
					required
				>
					<NativeSelect
						value={paymentType}
						onValueChange={setPaymentType}
						options={PAYMENT_TYPE_OPTIONS.map(([value, label]) => ({
							value,
							label,
						}))}
						triggerClassName="w-full"
						aria-invalid={!!err("payment_type")}
					/>
					<input
						type="hidden"
						name="payment_type"
						value={paymentType}
						required
					/>
				</Field>
			</div>

			<Field
				label="Bank Tujuan"
				name="bank_account_id"
				error={err("bank_account_id")}
				required
			>
				<NativeSelect
					value={bankAccountId}
					onValueChange={setBankAccountId}
					placeholder="Pilih bank…"
					options={bankAccounts.map((b) => ({
						value: b.id,
						label: `${b.bank_name}${b.account_number ? ` · ${b.account_number}` : ""}${b.account_holder ? ` · ${b.account_holder}` : ""}`,
					}))}
					triggerClassName="w-full"
					aria-invalid={!!err("bank_account_id")}
				/>
				<input
					type="hidden"
					name="bank_account_id"
					value={bankAccountId}
					required
				/>
			</Field>

			<Field
				label="Bukti URL"
				name="proof_url"
				error={err("proof_url")}
				hint="Link Drive/upload bukti transfer (opsional)"
			>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start">
					<input
						type="url"
						name="proof_url"
						value={proofUrl}
						onChange={(e) => setProofUrl(e.target.value)}
						placeholder="https://drive.google.com/..."
						className={`${inputClass} sm:flex-1`}
					/>
					<ProofUploadButton
						projectId={projectId}
						onUploaded={setProofUrl}
					/>
				</div>
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
					className="press-down h-10 rounded-md bg-primary px-4 text-fluid-body font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
				>
					{pending ? "Menyimpan…" : "Log payment"}
				</button>
			</div>
		</form>
	);
}

const inputClass =
	"h-10 w-full rounded-md border border-border-default bg-background px-3 text-fluid-body text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

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
			<label htmlFor={name} className="text-fluid-body font-medium">
				{label}
				{required && <span className="ml-0.5 text-primary">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-fluid-caption text-destructive">{error}</p>
			) : hint ? (
				<p className="text-fluid-caption text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
