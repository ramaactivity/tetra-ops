"use client";

import {
	CheckCircle2,
	Clock,
	ExternalLink,
	Handshake,
	Loader2,
	Wallet,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProofUploadButton } from "@/components/rekap/proof-upload-button";
import { RekapCard, SectionHeader } from "@/components/rekap/rekap-ui";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { payCommission, unpayCommission } from "@/lib/actions/commissions";
import {
	type QueuedEntry,
	queuePartnerCommissionPayment,
	removeQueuedEntry,
} from "@/lib/actions/settle-queue";
import { formatRupiah } from "@/lib/format";

/**
 * Komisi mitra (vendor / relasi) yang menempel di event ini.
 *
 * Pola sama dengan Fee crew & Komisi sales: nominalnya datang dari booking
 * (tidak diubah di sini), yang diatur di kartu ini cuma CARA BAYARnya —
 * rekening, biaya admin bank, bukti transfer — dan uangnya baru keluar saat
 * Konfirmasi settle.
 *
 * Vendor mode "Potongan Langsung" tidak muncul di sini: komisinya sudah
 * dipotong di muka dari aliran uang, bukan utang yang perlu dibayar.
 */

type CashAccount = { code: string; name: string; balance?: number };

export type PartnerCommissionState = {
	kind: "vendor" | "relasi";
	payeeName: string;
	amount: number;
	isPaid: boolean;
	paidAmount: number;
	paidDate: string | null;
	proofUrl: string | null;
	isAdvance: boolean;
};

function defaultAccount(accounts: CashAccount[]): string {
	return (
		accounts.find((a) => /bca/i.test(a.name))?.code ??
		accounts.find((a) => /bank/i.test(a.name))?.code ??
		accounts[0]?.code ??
		""
	);
}

export function PartnerCommissionCard({
	eventId,
	projectId,
	state,
	cashAccounts,
	queuedPayment,
	isSettled = false,
	readOnly = false,
}: {
	eventId: string;
	projectId: string;
	state: PartnerCommissionState;
	cashAccounts: CashAccount[];
	queuedPayment?: QueuedEntry | null;
	isSettled?: boolean;
	readOnly?: boolean;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, startTransition] = useTransition();

	const [paying, setPaying] = useState(false);
	const [account, setAccount] = useState(
		() => queuedPayment?.accountCode ?? defaultAccount(cashAccounts),
	);
	const [adminFee, setAdminFee] = useState(queuedPayment?.adminFee ?? 0);
	const [proofUrl, setProofUrl] = useState<string | null>(null);

	const acct = cashAccounts.find((a) => a.code === account);
	const cashOut = state.amount + adminFee;
	const insufficient = acct?.balance !== undefined && acct.balance < cashOut;
	const label = state.kind === "vendor" ? "vendor" : "relasi";

	function handlePay() {
		startTransition(async () => {
			// Sebelum settle: diantre, jurnalnya lahir bareng jurnal settlement.
			// Sesudah settle: utangnya sudah ada di 2-103/2-102 → pelunasan langsung.
			const res = isSettled
				? await payCommission({
						event_id: eventId,
						project_id: projectId,
						kind: state.kind,
						bank_account_code: account,
						admin_fee: adminFee,
						payment_date: new Date().toISOString().slice(0, 10),
						proof_url: proofUrl,
					})
				: await queuePartnerCommissionPayment({
						event_id: eventId,
						project_id: projectId,
						kind: state.kind,
						amount: state.amount,
						account_code: account,
						admin_fee: adminFee,
						proof_url: proofUrl,
					});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				isSettled
					? `Komisi ${state.payeeName} dibayar ${formatRupiah(state.amount)}.`
					: `Rencana bayar komisi ${formatRupiah(state.amount)} disimpan — dibukukan saat settle.`,
			);
			setPaying(false);
			setProofUrl(null);
			router.refresh();
		});
	}

	function handleCancelQueued() {
		if (!queuedPayment) return;
		startTransition(async () => {
			const res = await removeQueuedEntry({
				id: queuedPayment.id,
				project_id: projectId,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Rencana bayar dibatalkan.");
			router.refresh();
		});
	}

	function handleUnpay() {
		startTransition(async () => {
			const ok = await confirm({
				title: "Batalkan pembayaran komisi?",
				description:
					"Jurnal pembalik dibuat — uangnya kembali ke rekening & komisinya jadi belum dibayar lagi.",
				confirmLabel: "Batalkan pembayaran",
				variant: "destructive",
			});
			if (!ok) return;
			const res = await unpayCommission({
				event_id: eventId,
				project_id: projectId,
				kind: state.kind,
				reason: "Dibatalkan dari halaman rekap event",
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Pembayaran komisi dibatalkan.");
			router.refresh();
		});
	}

	return (
		<RekapCard className="space-y-4">
			<SectionHeader
				icon={Handshake}
				title={`Komisi ${state.kind === "vendor" ? "vendor" : "relasi"}`}
				description={`Komisi untuk ${state.payeeName} sesuai kesepakatan di booking. Nominalnya diubah dari halaman Edit booking; di sini tinggal atur cara bayarnya — uangnya keluar saat Konfirmasi settle.`}
			/>

			<div className="grid gap-3 md:grid-cols-2">
				<div className="space-y-1">
					<span className="block text-xs font-medium text-muted-foreground">
						Penerima komisi
					</span>
					<p className="text-sm text-foreground">{state.payeeName}</p>
				</div>
				<div className="space-y-1">
					<span className="block text-xs font-medium text-muted-foreground">
						Nominal komisi
					</span>
					<p className="tabular text-sm font-medium text-foreground">
						{formatRupiah(state.amount)}
					</p>
				</div>
			</div>

			{queuedPayment && !state.isPaid ? (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-border-default bg-surface-2 px-3 py-2 text-xs">
					<Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
					<span className="text-foreground">
						Akan dibayar saat settle dari{" "}
						<span className="font-medium">
							{acct?.name ?? queuedPayment.accountCode}
						</span>
						{queuedPayment.adminFee > 0
							? ` (+ admin ${formatRupiah(queuedPayment.adminFee)})`
							: ""}
					</span>
					<span className="tabular font-medium text-foreground">
						{formatRupiah(queuedPayment.amount)}
					</span>
					{queuedPayment.proofUrl && (
						<a
							href={queuedPayment.proofUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-link hover:underline"
						>
							Bukti <ExternalLink className="h-3 w-3" />
						</a>
					)}
					{queuedPayment.postError && (
						<p className="w-full text-[11px] font-medium text-rose-600">
							Gagal dibukukan saat settle: {queuedPayment.postError}
						</p>
					)}
					{!readOnly && (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="ml-auto text-muted-foreground hover:text-rose-600"
							disabled={pending}
							onClick={handleCancelQueued}
						>
							<X className="h-3.5 w-3.5" /> Batalkan
						</Button>
					)}
				</div>
			) : state.isPaid ? (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
					<CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
					<span className="text-emerald-900 dark:text-emerald-200">
						{state.isAdvance
							? "Sudah dibayar di muka — otomatis diperhitungkan saat settle, tidak jadi utang."
							: `Komisi ${label} sudah dibayar & utangnya lunas.`}
					</span>
					<span className="tabular font-medium text-emerald-900 dark:text-emerald-200">
						{formatRupiah(state.paidAmount)}
						{state.paidDate ? ` · ${state.paidDate}` : ""}
					</span>
					{state.proofUrl && (
						<a
							href={state.proofUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-emerald-800 hover:underline dark:text-emerald-300"
						>
							Bukti <ExternalLink className="h-3 w-3" />
						</a>
					)}
					{!readOnly && (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="ml-auto text-emerald-800 hover:text-rose-700 dark:text-emerald-300"
							disabled={pending}
							onClick={handleUnpay}
						>
							<X className="h-3.5 w-3.5" /> Batalkan
						</Button>
					)}
				</div>
			) : readOnly ? null : paying ? (
				<div className="space-y-3 rounded-xl border border-border-default bg-surface-2 p-3">
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1">
							<span className="block text-xs font-medium text-muted-foreground">
								Bayar dari rekening
							</span>
							<Combobox
								value={account}
								onValueChange={(v) => setAccount(v ?? "")}
								options={cashAccounts.map((a) => ({
									value: a.code,
									label:
										a.balance !== undefined
											? `${a.code} · ${a.name} — ${formatRupiah(a.balance)}`
											: `${a.code} · ${a.name}`,
								}))}
								placeholder="Pilih rekening"
								allowFreeText={false}
							/>
						</div>
						<div className="space-y-1">
							<span className="block text-xs font-medium text-muted-foreground">
								Biaya admin bank (opsional)
							</span>
							<div className="flex items-center gap-1.5">
								{[1000, 2500].map((v) => (
									<button
										key={v}
										type="button"
										onClick={() => setAdminFee(adminFee === v ? 0 : v)}
										className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium ${
											adminFee === v
												? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
												: "border-border-default bg-surface-1 text-muted-foreground hover:bg-surface-2"
										}`}
									>
										<span data-nominal>{formatRupiah(v)}</span>
									</button>
								))}
								<input
									type="number"
									inputMode="numeric"
									min={0}
									value={adminFee === 0 ? "" : adminFee}
									onChange={(e) =>
										setAdminFee(Math.max(0, Number(e.target.value) || 0))
									}
									placeholder="lain"
									aria-label="Biaya admin bank"
									className="tabular h-9 w-full rounded-[10px] border border-border-default bg-card px-3 text-right text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
								/>
							</div>
						</div>
						<div className="md:col-span-2">
							<ProofUploadButton
								projectId={projectId}
								kind="commission"
								meta={{
									name: state.payeeName,
									role: state.kind,
									amount: state.amount,
								}}
								url={proofUrl}
								onChange={setProofUrl}
								label="Bukti transfer (opsional)"
							/>
						</div>
					</div>
					<p className="tabular text-[11px] text-muted-foreground">
						{insufficient ? (
							<span className="font-medium text-rose-600">
								Saldo {acct?.name} tidak cukup (
								{formatRupiah(acct?.balance ?? 0)}) untuk keluar{" "}
								{formatRupiah(cashOut)} — pilih rekening lain.
							</span>
						) : (
							`Saldo berkurang ${formatRupiah(cashOut)}${adminFee > 0 ? ` (termasuk admin ${formatRupiah(adminFee)})` : ""}${isSettled ? "." : " saat settle nanti."}`
						)}
					</p>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setPaying(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							type="button"
							onClick={handlePay}
							disabled={pending || !account || insufficient}
							className="gap-2"
						>
							{pending ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" /> Memproses…
								</>
							) : (
								<>
									<Wallet className="h-4 w-4" />{" "}
									{isSettled ? "Bayar" : "Simpan rencana bayar"}{" "}
									{formatRupiah(state.amount)}
								</>
							)}
						</Button>
					</div>
				</div>
			) : (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-default bg-surface-2 px-3 py-2">
					<p className="text-[11px] text-muted-foreground">
						{isSettled
							? `Belum dibayar — utangnya ada di Hutang Komisi ${state.kind === "vendor" ? "(2-103)" : "(2-102)"}.`
							: "Belum diatur. Isi rekening & buktinya sekarang; uangnya baru keluar saat Konfirmasi settle."}
					</p>
					<Button
						type="button"
						variant="outline"
						onClick={() => setPaying(true)}
						disabled={pending || cashAccounts.length === 0}
						className="gap-2"
					>
						<Wallet className="h-4 w-4" />{" "}
						{isSettled ? "Bayar komisi" : "Atur pembayaran"}
					</Button>
				</div>
			)}
		</RekapCard>
	);
}
