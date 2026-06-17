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
import { cn } from "@/lib/utils";

const PAYMENT_TYPE_OPTIONS: Array<[string, string]> = [
	["dp", "DP"],
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
	grandTotal,
	totalPaid,
	onSuccess,
}: {
	eventId: string;
	projectId: string;
	bankAccounts: BankAccountOption[];
	defaultDate: string;
	suggestedAmount?: number;
	grandTotal?: number;
	totalPaid?: number;
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
	const remaining = suggestedAmount ?? 0;
	const hasRemaining = remaining > 0;

	// Billing context for the progress bar. grand/paid let us draw a real
	// completion track; the in-flight amount fills the gap in green so the
	// owner *sees* the payment landing before committing.
	const grand = grandTotal ?? 0;
	const paid = totalPaid ?? Math.max(0, grand - remaining);
	const entered = Math.min(Math.max(0, amount), remaining);
	const paidPct = grand > 0 ? (paid / grand) * 100 : 0;
	const enteredPct = grand > 0 ? (entered / grand) * 100 : 0;
	const afterPaidPct = Math.min(100, paidPct + enteredPct);
	const remainingAfter = Math.max(0, remaining - entered);

	// Quick-fill chips: half + full. Rounded to the nearest 1.000 so the
	// number stays human (50% of an odd remainder is rarely a clean figure).
	const halfFill = Math.round(remaining / 2 / 1000) * 1000;

	const hasProof = !!(previewUrl || proofFile || proofUrl);

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

	// `h-11!` (important): SelectTrigger sets its height via a variant-prefixed
	// `data-[size=default]:h-8` which out-specifies a plain `h-11`. Forcing it
	// keeps Tanggal (DatePicker/Button) and Tipe (Select) the exact same height.
	const fieldBox = "h-10! w-full rounded-xl px-3.5 text-[0.9375rem]";

	return (
		<form action={formAction} className="space-y-3">
			{state?.errors?._form && (
				<div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			{hasRemaining && (
				<div className="rounded-2xl border border-border-default bg-card px-4 py-3">
					<div className="flex items-baseline justify-between gap-3">
						<span className="eyebrow">Tagihan</span>
						<span className="type-caption tabular">
							{Math.round(afterPaidPct)}% terbayar
						</span>
					</div>
					{/* Split track: settled (ink) + this payment (emerald) over a
					    muted remainder. The emerald grows live as the owner types. */}
					<div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full bg-primary transition-[width] duration-300 ease-out-expo"
							style={{ width: `${paidPct}%` }}
						/>
						<div
							className="h-full bg-emerald-500 transition-[width] duration-300 ease-out-expo dark:bg-emerald-400"
							style={{ width: `${enteredPct}%` }}
						/>
					</div>
					<div className="mt-2.5 flex items-end justify-between gap-3">
						<div>
							<span className="type-caption block text-muted-foreground">
								{entered > 0 ? "Sisa setelah ini" : "Sisa tagihan"}
							</span>
							<span
								className={cn(
									"type-num-lg tabular tracking-tight",
									entered > 0
										? "text-emerald-700 dark:text-emerald-400"
										: "text-foreground",
								)}
							>
								{formatRupiah(remainingAfter)}
							</span>
						</div>
						<div className="text-right">
							<span className="type-caption block text-muted-foreground">
								Total tagihan
							</span>
							<span className="type-num tabular text-muted-foreground">
								{formatRupiah(grand || remaining)}
							</span>
						</div>
					</div>
				</div>
			)}

			<div className="grid gap-3 md:grid-cols-2">
				{/* ── Left: form ── */}
				<div className="space-y-2.5">
					<Field label="Jumlah" error={err("amount")} required>
						<MoneyInput
							name="amount"
							value={amount}
							onValueChange={setAmount}
							placeholder="0"
							aria-invalid={!!err("amount")}
							className="h-10! rounded-xl text-base font-semibold"
						/>
						{isPelunasan ? (
							<p className="type-caption text-emerald-700 dark:text-emerald-400">
								Otomatis terisi penuh sesuai sisa tagihan.
							</p>
						) : hasRemaining ? (
							<div className="flex flex-wrap gap-1.5 pt-0.5">
								{halfFill > 0 && halfFill < remaining && (
									<FillChip
										active={amount === halfFill}
										onClick={() => setAmount(halfFill)}
									>
										50% · {formatRupiah(halfFill)}
									</FillChip>
								)}
								<FillChip
									active={amount === remaining}
									onClick={() => setAmount(remaining)}
								>
									Lunasi penuh
								</FillChip>
							</div>
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
								className="h-10 flex-1 rounded-xl text-[0.9375rem]"
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

				{/* ── Right: preview (stretches to match the form column height) ── */}
				<div className="flex flex-col gap-1">
					<span className="type-label block text-foreground">
						Preview bukti
					</span>
					<div
						className={cn(
							"flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-2xl transition-colors",
							hasProof
								? "border border-border-default bg-secondary/20"
								: "border border-dashed border-border-strong/50 bg-secondary/30",
						)}
					>
						{previewUrl ? (
							<figure className="flex flex-1 flex-col">
								{/* biome-ignore lint/performance/noImgElement: local blob preview */}
								<img
									src={previewUrl}
									alt="Preview bukti"
									className="h-full w-full flex-1 object-contain p-2"
								/>
								<figcaption className="flex items-center gap-2 border-t border-border-subtle px-3 py-2">
									<ImageIcon
										className="size-3.5 shrink-0 text-muted-foreground"
										aria-hidden
									/>
									<span className="type-caption truncate">
										{proofFile?.name ?? "Bukti transfer"}
									</span>
								</figcaption>
							</figure>
						) : proofFile ? (
							<PreviewState
								icon={<FileText className="size-6" aria-hidden />}
								title={proofFile.name}
								caption="PDF tersimpan utuh — tidak bisa dipratinjau."
							/>
						) : proofUrl ? (
							<PreviewState
								icon={<Link2 className="size-6" aria-hidden />}
								title="Link bukti tertaut"
								caption={proofUrl}
								captionClassName="truncate"
							/>
						) : (
							<PreviewState
								tone="muted"
								icon={<ImageIcon className="size-6" aria-hidden />}
								title="Belum ada bukti"
								caption="Tarik atau Upload bukti transfer — pratinjau muncul di sini."
							/>
						)}
					</div>
				</div>
			</div>

			<Button
				type="submit"
				size="lg"
				disabled={pending}
				className="h-10 w-full"
			>
				{pending ? "Menyimpan…" : "Log payment"}
			</Button>
		</form>
	);
}

/** Quick-fill nominal chip (compact Vercel chrome, ink active state). */
function FillChip({
	active,
	onClick,
	children,
}: {
	active?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"press tap inline-flex h-7 items-center rounded-lg border px-2.5 text-[12.5px] font-medium tabular transition-colors",
				active
					? "border-primary bg-[#059669] text-white"
					: "border-border-default text-muted-foreground hover:bg-secondary hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

/** Centered placeholder/state inside the bukti preview pane. */
function PreviewState({
	icon,
	title,
	caption,
	captionClassName,
	tone = "default",
}: {
	icon: React.ReactNode;
	title: string;
	caption: string;
	captionClassName?: string;
	tone?: "default" | "muted";
}) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
			<span
				className={cn(
					"flex size-12 items-center justify-center rounded-full",
					tone === "muted"
						? "bg-muted text-muted-foreground/70"
						: "bg-secondary text-foreground",
				)}
			>
				{icon}
			</span>
			<p className="type-body-strong max-w-[18rem] truncate">{title}</p>
			<p className={cn("type-caption max-w-[18rem]", captionClassName)}>
				{caption}
			</p>
		</div>
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
