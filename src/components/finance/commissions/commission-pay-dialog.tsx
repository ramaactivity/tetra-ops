"use client";

import { useState } from "react";
import {
	ProofUploadButton,
	uploadProofToDrive,
} from "@/components/billing/proof-upload-button";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/form-fields";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { payCommission } from "@/lib/actions/commissions";
import type { CommissionRow } from "@/lib/finance/commissions-data";
import { formatRupiah } from "@/lib/format";

export type CommissionBankOption = {
	coa_code: string;
	label: string;
};

/**
 * Dialog bayar komisi (vendor/relasi) — pola sama dgn bayar fee crew:
 * pilih rekening, biaya admin opsional, bukti opsional (upload ditunda sampai
 * klik Bayar). Nominal komisi read-only (server yang otoritatif).
 */
export function CommissionPayDialog({
	row,
	banks,
	defaultDate,
	open,
	onOpenChange,
	onDone,
}: {
	row: CommissionRow | null;
	banks: CommissionBankOption[];
	defaultDate: string;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onDone: () => void;
}) {
	const [bank, setBank] = useState("");
	const [adminFee, setAdminFee] = useState(0);
	const [date, setDate] = useState(defaultDate);
	const [proofFile, setProofFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);

	// Reset saat baris berubah / dialog dibuka.
	const key = row ? `${row.eventId}:${row.kind}` : "none";
	const [seededKey, setSeededKey] = useState("");
	if (open && key !== seededKey) {
		setSeededKey(key);
		setBank(banks[0]?.coa_code ?? "");
		setAdminFee(0);
		setDate(defaultDate);
		setProofFile(null);
	}

	if (!row) return null;
	const label = row.kind === "vendor" ? "vendor" : "relasi";

	async function submit() {
		if (!row) return;
		if (!bank) {
			toast.error("Pilih rekening pembayaran dulu");
			return;
		}
		setBusy(true);
		try {
			let proofUrl: string | null = null;
			if (proofFile) {
				try {
					const up = await uploadProofToDrive(row.projectId, proofFile, {
						paymentType: "komisi",
						paymentDate: date,
						amount: row.amount,
					});
					proofUrl = up.url;
				} catch (e) {
					toast.error(e instanceof Error ? e.message : "Upload bukti gagal");
					setBusy(false);
					return;
				}
			}
			const res = await payCommission({
				event_id: row.eventId,
				project_id: row.projectId,
				kind: row.kind,
				bank_account_code: bank,
				admin_fee: adminFee,
				payment_date: date,
				proof_url: proofUrl,
			});
			if (!res.ok) {
				toast.error(res.error);
				setBusy(false);
				return;
			}
			toast.success(`Komisi ${label} dibayar · ${res.journalRef}`);
			onDone();
			onOpenChange(false);
		} finally {
			setBusy(false);
		}
	}

	const cashOut = row.amount + adminFee;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[92vh] overflow-y-auto p-5 sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Bayar komisi {label}</DialogTitle>
					<DialogDescription className="sr-only">
						Catat pembayaran komisi. Utang komisi turun & kas berkurang.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div className="rounded-xl border border-border-default bg-secondary/40 px-4 py-3">
						<div className="flex items-baseline justify-between">
							<span className="text-[12px] text-muted-foreground">
								{row.payeeName}
							</span>
							<span className="tabular text-[17px] font-semibold text-foreground">
								{formatRupiah(row.amount)}
							</span>
						</div>
						<p className="mt-0.5 text-[11.5px] text-muted-foreground">
							{row.clientName} · komisi {label}
						</p>
					</div>

					<Field label="Rekening sumber" required>
						<NativeSelect
							value={bank}
							onValueChange={setBank}
							placeholder="Pilih bank…"
							options={banks.map((b) => ({
								value: b.coa_code,
								label: b.label,
							}))}
							triggerClassName="h-10! w-full rounded-xl px-3.5 text-[0.9375rem]"
						/>
					</Field>

					<div className="grid grid-cols-2 gap-3">
						<Field label="Tanggal" required>
							<DatePicker
								value={date}
								onValueChange={setDate}
								className="h-10! w-full rounded-xl px-3.5 text-[0.9375rem]"
							/>
						</Field>
						<Field label="Biaya admin bank">
							<MoneyInput
								name="admin_fee"
								value={adminFee}
								onValueChange={setAdminFee}
								placeholder="0"
								className="h-10! rounded-xl text-[0.9375rem]"
							/>
						</Field>
					</div>

					<Field label="Bukti transfer (opsional)">
						<ProofUploadButton
							projectId={row.projectId}
							deferred
							onUploaded={() => {}}
							onFileSelected={setProofFile}
							meta={{ paymentDate: date, amount: row.amount }}
						/>
					</Field>

					<div className="flex items-baseline justify-between border-t border-border-subtle pt-3 text-[12.5px]">
						<span className="text-muted-foreground">Total kas keluar</span>
						<span className="tabular font-semibold text-foreground">
							{formatRupiah(cashOut)}
						</span>
					</div>

					<Button
						type="button"
						size="lg"
						disabled={busy}
						onClick={submit}
						className="h-10 w-full"
					>
						{busy ? "Memproses…" : `Bayar ${formatRupiah(cashOut)}`}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	label,
	required,
	children,
}: {
	label: string;
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
		</div>
	);
}
