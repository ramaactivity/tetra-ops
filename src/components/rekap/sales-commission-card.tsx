"use client";

import {
	CheckCircle2,
	Clock,
	ExternalLink,
	Loader2,
	UserRound,
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
import { MoneyInput } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import {
	payCommission,
	setSalesCommission,
	unpayCommission,
} from "@/lib/actions/commissions";
import {
	type QueuedEntry,
	queueSalesCommissionPayment,
	removeQueuedEntry,
} from "@/lib/actions/settle-queue";
import { formatRupiah } from "@/lib/format";

/**
 * Komisi sales Tetra — admin/sales yang closing event ini.
 *
 * Berdiri sendiri dari komisi mitra (vendor/relasi): walau komisi vendor sudah
 * dibayar, sales yang closing tetap dapat komisinya. Nominalnya tentatif
 * (biasanya Rp50rb–100rb) jadi diisi di sini, bukan saat booking.
 *
 * Angkanya disimpan di events.direct_sales_commission → dibaca settle_event
 * (semua channel) jadi beban 5-301 + Hutang Komisi 2-102. Kalau dibayar SEBELUM
 * settle, pembayarannya jadi Uang Muka Komisi (1-310) yang otomatis di-offset
 * saat settle — tidak pernah tertagih dua kali.
 */

const QUICK_AMOUNTS = [50_000, 100_000];

type CashAccount = { code: string; name: string; balance?: number };

export type SalesCommissionState = {
	userId: string | null;
	payeeName: string | null;
	amount: number;
	/** Sudah ada pembayaran aktif (uang muka / pelunasan). */
	isPaid: boolean;
	paidAmount: number;
	paidDate: string | null;
	proofUrl: string | null;
	/** true = uang muka (event belum di-settle saat dibayar). */
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

export function SalesCommissionCard({
	eventId,
	projectId,
	state,
	candidates,
	cashAccounts,
	queuedPayment,
	isSettled = false,
	readOnly = false,
}: {
	eventId: string;
	projectId: string;
	state: SalesCommissionState;
	candidates: Array<{ id: string; name: string; role: string }>;
	cashAccounts: CashAccount[];
	/** Rencana bayar yang sudah diantre — dibukukan saat settle. */
	queuedPayment?: QueuedEntry | null;
	/** Sesudah settle, pembayaran langsung dibukukan (pelunasan utang). */
	isSettled?: boolean;
	readOnly?: boolean;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, startTransition] = useTransition();

	const [userId, setUserId] = useState(state.userId ?? "");
	const [amount, setAmount] = useState(state.amount);
	const dirty = userId !== (state.userId ?? "") || amount !== state.amount;

	const [paying, setPaying] = useState(false);
	const [account, setAccount] = useState(() => defaultAccount(cashAccounts));
	const [adminFee, setAdminFee] = useState(0);
	const [proofUrl, setProofUrl] = useState<string | null>(null);

	const acct = cashAccounts.find((a) => a.code === account);
	const cashOut = state.amount + adminFee;
	const insufficient =
		acct?.balance !== undefined && acct.balance < cashOut && state.amount > 0;

	// Nominal terkunci begitu sudah dibayar — uang mukanya di-offset sebesar
	// beban yang diakui, jadi mengubahnya menyisakan saldo nyangkut di 1-310.
	const locked = readOnly || state.isPaid || Boolean(queuedPayment);

	function handleSave() {
		startTransition(async () => {
			const res = await setSalesCommission({
				event_id: eventId,
				project_id: projectId,
				user_id: amount > 0 ? userId || null : null,
				amount,
			});
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(
				amount > 0
					? `Komisi sales ${formatRupiah(amount)} disimpan.`
					: "Komisi sales dihapus.",
			);
			router.refresh();
		});
	}

	function handlePay() {
		startTransition(async () => {
			// Sebelum settle: cuma diantre — jurnalnya lahir bareng jurnal
			// settlement biar satu event = satu momen pembukuan. Sesudah settle:
			// utangnya sudah ada di 2-102, jadi bayar = pelunasan, langsung posting.
			const res = isSettled
				? await payCommission({
						event_id: eventId,
						project_id: projectId,
						kind: "sales",
						bank_account_code: account,
						admin_fee: adminFee,
						payment_date: new Date().toISOString().slice(0, 10),
						proof_url: proofUrl,
					})
				: await queueSalesCommissionPayment({
						event_id: eventId,
						project_id: projectId,
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
					? `Komisi sales dibayar ${formatRupiah(state.amount)}.`
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
				kind: "sales",
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
				icon={UserRound}
				title="Komisi sales Tetra"
				description="Sales/admin yang closing event ini tetap dapat komisi — walau event-nya juga bayar komisi vendor/relasi. Biasanya Rp50.000–100.000. Masuk sebagai beban & Hutang Komisi saat event di-settle."
			/>

			<div className="grid gap-3 md:grid-cols-2">
				<div className="space-y-1">
					<span className="block text-xs font-medium text-muted-foreground">
						Sales penerima komisi
					</span>
					{locked ? (
						<p className="text-sm text-foreground">{state.payeeName ?? "—"}</p>
					) : (
						<Combobox
							value={userId}
							onValueChange={(v) => setUserId(v ?? "")}
							options={candidates.map((u) => ({
								value: u.id,
								label: u.name,
								sublabel: u.role,
							}))}
							placeholder="Cari nama sales…"
							allowFreeText={false}
							emptyMessage="Nggak ketemu — cek daftar di Settings › Tim"
						/>
					)}
				</div>

				<div className="space-y-1">
					<span className="block text-xs font-medium text-muted-foreground">
						Nominal komisi
					</span>
					{locked ? (
						<p className="tabular text-sm font-medium text-foreground">
							{formatRupiah(state.amount)}
						</p>
					) : (
						<div className="space-y-1.5">
							<div className="flex flex-wrap gap-1.5">
								{QUICK_AMOUNTS.map((amt) => (
									<Button
										key={amt}
										type="button"
										size="xs"
										variant={amount === amt ? "default" : "outline"}
										className="tabular rounded-full"
										onClick={() => setAmount(amount === amt ? 0 : amt)}
									>
										{formatRupiah(amt)}
									</Button>
								))}
							</div>
							<MoneyInput
								value={amount}
								onValueChange={setAmount}
								aria-label="Nominal komisi sales"
							/>
						</div>
					)}
				</div>
			</div>

			{!locked && (
				<div className="flex items-center justify-between gap-3">
					<p className="text-[11px] text-muted-foreground">
						{amount > 0 && !userId
							? "Pilih dulu sales penerimanya."
							: "Kosongkan nominalnya kalau event ini tanpa komisi sales."}
					</p>
					<Button
						type="button"
						onClick={handleSave}
						disabled={pending || !dirty || (amount > 0 && !userId)}
						className="gap-2"
					>
						{pending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
							</>
						) : (
							"Simpan komisi sales"
						)}
					</Button>
				</div>
			)}

			{/* Status pembayaran */}
			{queuedPayment && !state.isPaid ? (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-border-default bg-surface-2 px-3 py-2 text-xs">
					<Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
					<span className="text-foreground">
						Akan dibayar saat settle dari{" "}
						<span className="font-medium">{queuedPayment.accountCode}</span>
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
							: "Komisi sudah dibayar & utangnya lunas."}
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
			) : state.amount > 0 && !readOnly ? (
				paying ? (
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
										name: state.payeeName ?? "Sales Tetra",
										role: "sales",
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
								? "Belum dibayar — utangnya ada di Hutang Komisi (2-102)."
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
				)
			) : null}
		</RekapCard>
	);
}
