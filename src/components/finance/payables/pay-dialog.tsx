"use client";

import { Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Combobox } from "@/components/ui/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { NumberField, TextareaField } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import { recordPayablePayment } from "@/lib/actions/payables";
import { formatRupiah } from "@/lib/format";
import type { CashAccountOption, PayableRow } from "./payables-table";

export function PayDialog({
	payable,
	cashAccounts,
	open,
	onOpenChange,
}: {
	payable: PayableRow;
	cashAccounts: CashAccountOption[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [amount, setAmount] = useState<string>(String(payable.remaining));
	const [accountCode, setAccountCode] = useState<string>(
		cashAccounts[0]?.code ?? "1-100",
	);
	const [notes, setNotes] = useState<string>("");

	const amountNum = Number(amount);
	const isFull = amountNum === payable.remaining;
	const isValid =
		Number.isFinite(amountNum) &&
		amountNum > 0 &&
		amountNum <= payable.remaining;
	const remainingAfter = Math.max(0, payable.remaining - amountNum);

	function handleSubmit(formData: FormData) {
		startTransition(async () => {
			formData.set("payable_id", payable.id);
			formData.set("amount", amount);
			formData.set("payment_account_code", accountCode);
			const res = await recordPayablePayment(formData);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				res.status === "paid"
					? `Lunas — ${res.journalRef ? `jurnal ${res.journalRef}` : ""}`
					: `Bayar Rp ${amountNum.toLocaleString("id-ID")} — sisa ${formatRupiah(res.remaining)}`,
			);
			onOpenChange(false);
			router.refresh();
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Wallet className="size-5 text-primary" />
						Bayar Hutang
					</DialogTitle>
					<DialogDescription>
						{payable.description ?? "Payable"} ·{" "}
						{payable.supplier_name && (
							<span className="font-medium">{payable.supplier_name}</span>
						)}
					</DialogDescription>
				</DialogHeader>

				<form action={handleSubmit} className="space-y-4">
					<div className="grid gap-4 md:grid-cols-[1fr_240px]">
						{/* Form */}
						<div className="space-y-3">
							<Field label="Tanggal Bayar" name="payment_date" required>
								<input
									type="date"
									id="payment_date"
									name="payment_date"
									defaultValue={new Date().toISOString().slice(0, 10)}
									required
									className="h-10 w-full rounded-md border border-border-default bg-surface-1 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
								/>
							</Field>

							<Field label="Nominal Bayar (Rp)" name="amount" required>
								<div className="relative">
									<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
										Rp
									</span>
									<NumberField
										id="amount"
										name="amount"
										min={1}
										max={payable.remaining}
										step={1}
										value={amount}
										onChange={(e) => setAmount(e.target.value)}
										required
										className="pl-9"
									/>
								</div>
								<div className="flex items-center gap-2 text-[11px]">
									<button
										type="button"
										onClick={() => setAmount(String(payable.remaining))}
										className="press-down rounded-md border border-border-default bg-surface-2 px-2 py-0.5 font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
									>
										Bayar penuh ({formatRupiah(payable.remaining)})
									</button>
									{payable.remaining > 1 && (
										<button
											type="button"
											onClick={() =>
												setAmount(
													String(Math.floor(payable.remaining / 2)),
												)
											}
											className="press-down rounded-md border border-border-default bg-surface-2 px-2 py-0.5 font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
										>
											50%
										</button>
									)}
								</div>
							</Field>

							<Field
								label="Bayar dari"
								name="payment_account_code"
								required
								hint="auto-jurnal: DEBIT 2-101 Hutang Vendor, CREDIT akun ini"
							>
								<Combobox
									id="payment_account_code"
									value={accountCode}
									onValueChange={(v) => setAccountCode(v ?? "1-100")}
									options={cashAccounts.map((a) => ({
										value: a.code,
										label: `${a.code} · ${a.name}`,
									}))}
									allowFreeText={false}
								/>
								<input
									type="hidden"
									name="payment_account_code"
									value={accountCode}
								/>
							</Field>

							<Field
								label="Catatan"
								name="notes"
								hint="opsional — referensi transfer, dll"
							>
								<TextareaField
									id="notes"
									name="notes"
									rows={2}
									maxLength={300}
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
								/>
							</Field>
						</div>

						{/* Summary */}
						<aside className="space-y-2">
							<div className="rounded-lg border border-border-default bg-surface-2/60 p-2.5">
								<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
									Total Hutang
								</div>
								<div className="tabular text-fluid-body font-semibold text-foreground">
									{formatRupiah(payable.amount)}
								</div>
							</div>
							<div className="rounded-lg border border-border-default bg-surface-2/60 p-2.5">
								<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
									Sudah Dibayar
								</div>
								<div className="tabular text-fluid-body font-semibold text-foreground">
									{formatRupiah(payable.amount_paid)}
								</div>
							</div>
							<div
								className={`rounded-lg border p-2.5 ${
									!isValid
										? "border-rose-500/30 bg-rose-500/5"
										: isFull
											? "border-emerald-500/30 bg-emerald-500/5"
											: "border-amber-500/30 bg-amber-500/5"
								}`}
							>
								<div
									className={`text-[10px] uppercase tracking-wider ${
										!isValid
											? "text-rose-700 dark:text-rose-300"
											: isFull
												? "text-emerald-700 dark:text-emerald-300"
												: "text-amber-700 dark:text-amber-300"
									}`}
								>
									Sisa Setelah Bayar
								</div>
								<div className="tabular text-fluid-h3 font-semibold text-foreground">
									{formatRupiah(remainingAfter)}
								</div>
								<div className="mt-0.5 text-[10px] text-muted-foreground">
									{!isValid
										? "Nominal tidak valid"
										: isFull
											? "✓ Akan jadi Lunas"
											: "Sisa hutang masih open"}
								</div>
							</div>

							{isValid && (
								<div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5 text-[11px]">
									<div className="mb-1 font-semibold text-sky-700 dark:text-sky-300">
										Jurnal otomatis
									</div>
									<div className="space-y-0.5 text-muted-foreground">
										<div className="flex items-baseline justify-between gap-2">
											<span>DEBIT 2-101 Hutang Vendor</span>
											<span className="tabular font-medium text-foreground">
												{formatRupiah(amountNum)}
											</span>
										</div>
										<div className="flex items-baseline justify-between gap-2">
											<span>CREDIT {accountCode}</span>
											<span className="tabular font-medium text-foreground">
												{formatRupiah(amountNum)}
											</span>
										</div>
									</div>
								</div>
							)}
						</aside>
					</div>

					<DialogFooter>
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="inline-flex h-10 items-center rounded-md border border-border-default bg-surface-2 px-4 text-sm font-medium hover:bg-muted"
						>
							Batal
						</button>
						<button
							type="submit"
							disabled={pending || !isValid}
							className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
						>
							{pending
								? "Memproses…"
								: isFull
									? `Bayar Penuh · ${formatRupiah(amountNum)}`
									: `Bayar · ${formatRupiah(amountNum)}`}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	name,
	hint,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
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
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}
