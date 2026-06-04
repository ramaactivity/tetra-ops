"use client";

import { useActionState, useState } from "react";
import { ProofUploadButton } from "@/components/billing/proof-upload-button";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput, TextareaField } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { logPayment, type PaymentFormState } from "@/lib/actions/payments";
import { formatRupiah } from "@/lib/format";

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

	const [amount, setAmount] = useState(
		Number(get("amount", suggestedAmount?.toString())) || 0,
	);
	const [paymentDate, setPaymentDate] = useState(
		get("payment_date", defaultDate),
	);
	const [paymentType, setPaymentType] = useState(get("payment_type", "dp"));
	const [bankAccountId, setBankAccountId] = useState(get("bank_account_id"));
	const [proofUrl, setProofUrl] = useState(get("proof_url"));

	if (bankAccounts.length === 0) {
		return (
			<p className="text-sm italic text-muted-foreground">
				Belum ada bank account aktif. Tambah dari Settings → Banks.
			</p>
		);
	}

	return (
		<form action={formAction} className="space-y-4">
			{state?.errors?._form && (
				<div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<Field label="Jumlah" error={err("amount")} required>
				<MoneyInput
					name="amount"
					value={amount}
					onValueChange={setAmount}
					placeholder="0"
					aria-invalid={!!err("amount")}
				/>
				{suggestedAmount && suggestedAmount > 0 && amount !== suggestedAmount && (
					<button
						type="button"
						onClick={() => setAmount(suggestedAmount)}
						className="text-xs font-medium text-[#0070f3] hover:underline"
					>
						Isi sisa tagihan · {formatRupiah(suggestedAmount)}
					</button>
				)}
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Tanggal" error={err("payment_date")} required>
					<DatePicker
						value={paymentDate}
						onValueChange={setPaymentDate}
						placeholder="Pilih tanggal"
						aria-invalid={!!err("payment_date")}
					/>
					<input type="hidden" name="payment_date" value={paymentDate} required />
				</Field>

				<Field label="Tipe" error={err("payment_type")} required>
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
					<input type="hidden" name="payment_type" value={paymentType} required />
				</Field>
			</div>

			<Field label="Bank tujuan" error={err("bank_account_id")} required>
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
				<input type="hidden" name="bank_account_id" value={bankAccountId} required />
			</Field>

			<Field
				label="Bukti transfer"
				error={err("proof_url")}
				hint="Link Drive / upload bukti (opsional)"
			>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start">
					<Input
						type="url"
						name="proof_url"
						value={proofUrl}
						onChange={(e) => setProofUrl(e.target.value)}
						placeholder="https://drive.google.com/…"
						className="h-10 rounded-md sm:flex-1"
					/>
					<ProofUploadButton
						projectId={projectId}
						onUploaded={setProofUrl}
						meta={{
							paymentType,
							paymentDate,
							amount: amount || undefined,
						}}
					/>
				</div>
			</Field>

			<Field label="Catatan" error={err("notes")} hint="Opsional">
				<TextareaField
					name="notes"
					rows={2}
					maxLength={500}
					defaultValue={get("notes")}
					placeholder="Catatan tambahan…"
				/>
			</Field>

			<Button
				type="submit"
				size="lg"
				disabled={pending}
				className="w-full"
			>
				{pending ? "Menyimpan…" : "Log payment"}
			</Button>
		</form>
	);
}

function Field({
	label,
	hint,
	error,
	required,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label className="block text-[13px] font-medium text-foreground">
				{label}
				{required && <span className="ml-0.5 text-destructive">*</span>}
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
