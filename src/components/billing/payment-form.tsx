"use client";

import { FileText, Image as ImageIcon, Link2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
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
	onSuccess,
}: {
	eventId: string;
	projectId: string;
	bankAccounts: BankAccountOption[];
	defaultDate: string;
	suggestedAmount?: number;
	onSuccess?: () => void;
}) {
	const action = logPayment.bind(null, eventId, projectId);
	const [state, formAction, pending] = useActionState<
		PaymentFormState,
		FormData
	>(action, undefined);

	// Close the dialog (and let the page revalidate) once the payment is logged.
	useEffect(() => {
		if (state?.success) onSuccess?.();
	}, [state?.success, onSuccess]);

	const get = (key: string, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";

	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	const [amount, setAmount] = useState(
		Number(get("amount", suggestedAmount?.toString())) || 0,
	);
	const [paymentDate, setPaymentDate] = useState(
		get("payment_date", defaultDate),
	);
	const [paymentType, setPaymentType] = useState(get("payment_type", "dp"));
	const [bankAccountId, setBankAccountId] = useState(get("bank_account_id"));
	const [proofUrl, setProofUrl] = useState(get("proof_url"));
	const [proofFile, setProofFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	// Local preview of the picked bukti image (revoked on change/unmount).
	useEffect(() => {
		if (proofFile?.type.startsWith("image/")) {
			const url = URL.createObjectURL(proofFile);
			setPreviewUrl(url);
			return () => URL.revokeObjectURL(url);
		}
		setPreviewUrl(null);
	}, [proofFile]);

	const isPelunasan = paymentType === "pelunasan";
	const hasRemaining = !!suggestedAmount && suggestedAmount > 0;

	// Pelunasan = bayar lunas → nominal HARUS = sisa tagihan. Auto-fill saat
	// owner pilih "Pelunasan" supaya gak salah input (kurang/lebih dari sisa).
	useEffect(() => {
		if (isPelunasan && suggestedAmount && suggestedAmount > 0) {
			setAmount(suggestedAmount);
		}
	}, [isPelunasan, suggestedAmount]);

	if (bankAccounts.length === 0) {
		return (
			<p className="text-sm italic text-muted-foreground">
				Belum ada bank account aktif. Tambah dari Settings → Banks.
			</p>
		);
	}

	const fieldBox = "h-11 w-full rounded-xl px-3.5 text-[0.9375rem]";

	return (
		<form action={formAction} className="space-y-4">
			{state?.errors?._form && (
				<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="grid gap-4 md:grid-cols-2">
				{/* ── Left: form ── */}
				<div className="space-y-3">
					<Field label="Jumlah" error={err("amount")} required>
						<MoneyInput
							name="amount"
							value={amount}
							onValueChange={setAmount}
							placeholder="0"
							aria-invalid={!!err("amount")}
							className="h-12 rounded-xl text-[1.0625rem] font-semibold"
						/>
						{isPelunasan ? (
							<p className="type-caption text-emerald-700 dark:text-emerald-400">
								Otomatis = sisa tagihan · {formatRupiah(suggestedAmount ?? 0)}
							</p>
						) : hasRemaining && amount !== suggestedAmount ? (
							<button
								type="button"
								onClick={() => setAmount(suggestedAmount ?? 0)}
								className="text-xs font-medium text-link hover:underline"
							>
								Isi sisa tagihan · {formatRupiah(suggestedAmount ?? 0)}
							</button>
						) : null}
					</Field>

					<div className="grid grid-cols-2 gap-3">
						<Field label="Tanggal" error={err("payment_date")} required>
							<DatePicker
								value={paymentDate}
								onValueChange={setPaymentDate}
								placeholder="Pilih tanggal"
								aria-invalid={!!err("payment_date")}
								className={fieldBox}
							/>
							<input
								type="hidden"
								name="payment_date"
								value={paymentDate}
								required
							/>
						</Field>

						<Field label="Tipe" error={err("payment_type")} required>
							<NativeSelect
								value={paymentType}
								onValueChange={setPaymentType}
								options={PAYMENT_TYPE_OPTIONS.map(([value, label]) => ({
									value,
									label,
								}))}
								triggerClassName={fieldBox}
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

					<Field label="Bank tujuan" error={err("bank_account_id")} required>
						<NativeSelect
							value={bankAccountId}
							onValueChange={setBankAccountId}
							placeholder="Pilih bank…"
							options={bankAccounts.map((b) => ({
								value: b.id,
								label: `${b.bank_name}${b.account_number ? ` · ${b.account_number}` : ""}${b.account_holder ? ` · ${b.account_holder}` : ""}`,
							}))}
							triggerClassName={fieldBox}
							aria-invalid={!!err("bank_account_id")}
						/>
						<input
							type="hidden"
							name="bank_account_id"
							value={bankAccountId}
							required
						/>
					</Field>

					<Field label="Bukti transfer" error={err("proof_url")}>
						<div className="flex items-center gap-2">
							<Input
								type="url"
								name="proof_url"
								value={proofUrl}
								onChange={(e) => setProofUrl(e.target.value)}
								placeholder="Link Drive (opsional)…"
								className="h-11 flex-1 rounded-xl text-[0.9375rem]"
							/>
							<ProofUploadButton
								projectId={projectId}
								onUploaded={setProofUrl}
								onFileSelected={setProofFile}
								meta={{
									paymentType,
									paymentDate,
									amount: amount || undefined,
								}}
							/>
						</div>
					</Field>

					<Field label="Catatan" error={err("notes")}>
						<TextareaField
							name="notes"
							rows={2}
							maxLength={500}
							defaultValue={get("notes")}
							placeholder="Catatan tambahan… (opsional)"
							className="rounded-xl text-[0.9375rem]"
						/>
					</Field>
				</div>

				{/* ── Right: preview ── */}
				<div className="space-y-1">
					<span className="type-label block text-foreground">
						Preview bukti
					</span>
					<div className="flex min-h-[240px] flex-col overflow-hidden rounded-xl border border-border-default bg-secondary/30">
						{previewUrl ? (
							// biome-ignore lint/performance/noImgElement: local blob preview
							<img
								src={previewUrl}
								alt="Preview bukti"
								className="max-h-[320px] w-full flex-1 object-contain"
							/>
						) : proofFile ? (
							<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
								<FileText
									className="size-9 text-muted-foreground"
									aria-hidden
								/>
								<p className="type-body-strong">{proofFile.name}</p>
								<p className="type-caption">
									PDF tidak bisa di-preview — tersimpan utuh.
								</p>
							</div>
						) : proofUrl ? (
							<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
								<Link2 className="size-9 text-muted-foreground" aria-hidden />
								<p className="type-body-strong">Link bukti tertaut</p>
								<p className="type-caption max-w-full truncate">{proofUrl}</p>
							</div>
						) : (
							<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
								<ImageIcon
									className="size-9 text-muted-foreground/60"
									aria-hidden
								/>
								<p className="type-secondary max-w-[18rem]">
									Upload bukti transfer — preview muncul di sini biar nggak
									salah.
								</p>
							</div>
						)}
					</div>
				</div>
			</div>

			<Button
				type="submit"
				size="lg"
				disabled={pending}
				className="h-11 w-full"
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
		<div className="space-y-1">
			<label className="type-label block text-foreground">
				{label}
				{required && <span className="ml-0.5 text-destructive">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : hint ? (
				<p className="type-caption">{hint}</p>
			) : null}
		</div>
	);
}
