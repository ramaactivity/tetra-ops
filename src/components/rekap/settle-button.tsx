"use client";

import {
	AlertTriangle,
	CheckCircle2,
	Handshake,
	Loader2,
	Lock,
	Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import {
	checkRecapStock,
	type StockCheckShortage,
} from "@/lib/actions/profit-preview";
import { settleEvent } from "@/lib/actions/settle-event";
import { formatRupiah } from "@/lib/format";

type Props = {
	eventId: string;
	projectId: string;
	recapId: string | null;
	revenueNet: number;
	hppTotal: number;
	opexTotal: number;
	netProfit: number;
	sinkingEstimate: number;
	ownerPoolEstimate: number;
	disabled: boolean;
	disabledReason?: string;
	/** Total fee crew (fee+bonus+reimbursement) — untuk opsi "bayar sambil settle". */
	crewTotal?: number;
	/** Rekening kas/bank (+ saldo live) untuk opsi bayar-sambil-settle. */
	cashAccounts?: Array<{ code: string; name: string; balance?: number }>;
	/**
	 * Komisi yang menempel di event ini (vendor/relasi/sales) — untuk opsi
	 * "sekalian bayar komisi" tanpa pindah ke halaman Komisi. Null kalau event
	 * ini tak punya komisi atau vendornya mode Potongan Langsung.
	 */
	commission?: {
		payeeName: string;
		amount: number;
		/** Sudah dibayar di muka sebelum settle → tinggal otomatis lunas. */
		paidInAdvance: boolean;
	} | null;
};

export function SettleButton(props: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [stockChecking, setStockChecking] = useState(false);
	const [shortages, setShortages] = useState<StockCheckShortage[]>([]);
	const [pending, startTransition] = useTransition();
	const cashAccounts = props.cashAccounts ?? [];
	const crewTotal = props.crewTotal ?? 0;
	const canPayNow = crewTotal > 0 && cashAccounts.length > 0;
	const [payNow, setPayNow] = useState(false);
	// Default = rekening pertama yang saldonya cukup untuk semua fee crew —
	// bukan asal index 0, biar tidak kepotong dari rekening bersaldo kurang.
	const [payAccount, setPayAccount] = useState(
		() =>
			cashAccounts.find((a) => (a.balance ?? 0) >= crewTotal)?.code ??
			cashAccounts[0]?.code ??
			"",
	);
	const commission = props.commission ?? null;
	const komisiTotal = commission?.paidInAdvance ? 0 : (commission?.amount ?? 0);
	const canPayKomisi = komisiTotal > 0 && cashAccounts.length > 0;
	const [payKomisi, setPayKomisi] = useState(false);
	const [komisiAccount, setKomisiAccount] = useState(
		() =>
			cashAccounts.find((a) => (a.balance ?? 0) >= komisiTotal)?.code ??
			cashAccounts[0]?.code ??
			"",
	);

	// Kebutuhan uang per rekening — kalau fee crew & komisi dibayar dari rekening
	// yang sama, saldonya harus cukup untuk KEDUANYA, bukan masing-masing.
	function needFor(code: string): number {
		let need = 0;
		if (payNow && canPayNow && payAccount === code) need += crewTotal;
		if (payKomisi && canPayKomisi && komisiAccount === code)
			need += komisiTotal;
		return need;
	}
	const payAcct = cashAccounts.find((a) => a.code === payAccount);
	const payInsufficient =
		payAcct?.balance !== undefined && payAcct.balance < needFor(payAccount);
	const komisiAcct = cashAccounts.find((a) => a.code === komisiAccount);
	const komisiInsufficient =
		komisiAcct?.balance !== undefined &&
		komisiAcct.balance < needFor(komisiAccount);

	async function handleOpen() {
		if (!props.recapId) {
			toast.error("Recap belum ada untuk event ini");
			return;
		}
		setStockChecking(true);
		setShortages([]);
		const check = await checkRecapStock(props.recapId);
		setStockChecking(false);
		if (!check.ok) {
			toast.error(check.error);
			return;
		}
		if (!check.sufficient) {
			setShortages(check.shortages);
		}
		setOpen(true);
	}

	function handleConfirm() {
		startTransition(async () => {
			const doPay = payNow && canPayNow && payAccount;
			const doPayKomisi = payKomisi && canPayKomisi && komisiAccount;
			const result = await settleEvent(props.eventId, props.projectId, {
				payCrewFromAccount: doPay ? payAccount : null,
				payCommissionFromAccount: doPayKomisi ? komisiAccount : null,
			});
			if (!result.ok) {
				toast.error(result.error || "Gagal settle event");
				return;
			}
			const cp = result.crewPayment;
			const km = result.commissionPayment;
			const done: string[] = [];
			if (cp && cp.paid > 0) done.push(`${cp.paid} fee crew`);
			if (km?.paid) done.push(`komisi ${km.payeeName}`);
			if (done.length > 0) {
				toast.success(`Event di-settle + ${done.join(" & ")} dibayar.`);
			} else {
				toast.success(
					`Event berhasil di-settle. Net profit: ${formatRupiah(result.data.net_profit)}`,
				);
			}
			if (cp && cp.failed > 0) {
				toast.error(
					`${cp.failed} fee crew gagal dibayar — cek & bayar manual di Fee crew.`,
				);
			}
			if (km && !km.paid) {
				toast.error(
					`Komisi gagal dibayar: ${km.error ?? "unknown"} — event tetap ter-settle, bayar manual di Finance › Komisi.`,
				);
			}
			setOpen(false);
			router.refresh();
		});
	}

	const hasShortage = shortages.length > 0;

	return (
		<>
			<Button
				onClick={handleOpen}
				disabled={props.disabled || stockChecking}
				title={props.disabledReason}
				className="h-10 gap-2"
			>
				{stockChecking ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" />
						Cek stok…
					</>
				) : (
					<>
						<Lock className="h-4 w-4" />
						Settle event
					</>
				)}
			</Button>
			{props.disabled && props.disabledReason && (
				<p className="mt-2 text-xs text-muted-foreground">
					{props.disabledReason}
				</p>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							{hasShortage ? (
								<AlertTriangle className="h-5 w-5 text-amber-600" />
							) : (
								<CheckCircle2 className="h-5 w-5 text-foreground" />
							)}
							Konfirmasi settle event
						</DialogTitle>
						<DialogDescription>
							Settlement akan mengubah data secara permanen. Aksi ini hanya bisa
							di-reverse via Reopen Settlement (super-admin).
						</DialogDescription>
					</DialogHeader>

					{hasShortage ? (
						<>
							<div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
								<p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
									⚠ Stok minus setelah settle untuk {shortages.length} item:
								</p>
								<ul className="mt-2 space-y-1 text-xs text-amber-900 dark:text-amber-200">
									{shortages.map((s) => (
										<li key={s.item_id} className="tabular">
											<span className="font-medium">{s.sku}</span> · {s.name}:
											butuh {s.needed}, ada {s.available} (akan minus{" "}
											<span className="font-semibold">{s.shortage}</span>)
										</li>
									))}
								</ul>
								<p className="mt-3 text-xs text-amber-900 dark:text-amber-200">
									Settlement tetap bisa lanjut. Stok akan negatif sampai restock
									berikutnya.
								</p>
							</div>
							<div className="mt-3 space-y-3 rounded-md border border-border-default bg-surface-2 p-3 text-sm">
								<p className="text-xs uppercase tracking-wider text-muted-foreground">
									Aksi yang akan dijalankan
								</p>
								<ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
									<li>
										Potong stok warehouse sesuai konsumsi rekap (bisa minus)
									</li>
									<li>Generate journal entries (double-entry GL)</li>
									<li>
										Alokasi sinking funds (estimasi{" "}
										<span data-nominal>
											{formatRupiah(props.sinkingEstimate)}
										</span>
										)
									</li>
									<li>
										Alokasi owner pool (estimasi{" "}
										<span data-nominal>
											{formatRupiah(props.ownerPoolEstimate)}
										</span>
										)
									</li>
									<li>Lock event + recap</li>
									<li>Audit log + stock warning entry</li>
								</ul>

								<div className="rounded-md border border-border-default bg-surface-3 p-3 text-sm">
									<dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
										<dt className="text-muted-foreground">Revenue net</dt>
										<dd className="tabular text-right text-foreground">
											{formatRupiah(props.revenueNet)}
										</dd>
										<dt className="text-muted-foreground">HPP</dt>
										<dd className="tabular text-right text-foreground">
											{formatRupiah(props.hppTotal)}
										</dd>
										<dt className="text-muted-foreground">OpEx</dt>
										<dd className="tabular text-right text-foreground">
											{formatRupiah(props.opexTotal)}
										</dd>
										<dt className="border-t border-border-default pt-1.5 text-sm font-medium text-foreground">
											Net profit
										</dt>
										<dd className="tabular border-t border-border-default pt-1.5 text-right text-sm font-semibold text-foreground">
											{formatRupiah(props.netProfit)}
										</dd>
									</dl>
								</div>
							</div>
						</>
					) : (
						<div className="space-y-3 rounded-md border border-border-default bg-surface-2 p-3 text-sm">
							<p className="text-xs uppercase tracking-wider text-muted-foreground">
								Aksi yang akan dijalankan
							</p>
							<ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
								<li>Potong stok warehouse sesuai konsumsi rekap</li>
								<li>Generate journal entries (double-entry GL)</li>
								<li>
									Alokasi sinking funds (estimasi{" "}
									<span data-nominal>
										{formatRupiah(props.sinkingEstimate)}
									</span>
									)
								</li>
								<li>
									Alokasi owner pool (estimasi{" "}
									<span data-nominal>
										{formatRupiah(props.ownerPoolEstimate)}
									</span>
									)
								</li>
								<li>Lock event + recap (tidak bisa di-edit lagi)</li>
								<li>Audit log dengan timestamp + actor</li>
							</ul>

							<div className="rounded-md border border-border-default bg-surface-3 p-3 text-sm">
								<dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
									<dt className="text-muted-foreground">Revenue net</dt>
									<dd className="tabular text-right text-foreground">
										{formatRupiah(props.revenueNet)}
									</dd>
									<dt className="text-muted-foreground">HPP</dt>
									<dd className="tabular text-right text-foreground">
										{formatRupiah(props.hppTotal)}
									</dd>
									<dt className="text-muted-foreground">OpEx</dt>
									<dd className="tabular text-right text-foreground">
										{formatRupiah(props.opexTotal)}
									</dd>
									<dt className="border-t border-border-default pt-1.5 text-sm font-medium text-foreground">
										Net profit
									</dt>
									<dd className="tabular border-t border-border-default pt-1.5 text-right text-sm font-semibold text-foreground">
										{formatRupiah(props.netProfit)}
									</dd>
								</dl>
							</div>
						</div>
					)}

					{canPayNow && (
						<div className="rounded-md border border-border-default bg-surface-2 p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
										<Wallet className="h-4 w-4 text-muted-foreground" />
										Sekalian bayar fee crew sekarang
									</p>
									<p className="tabular mt-0.5 text-xs text-muted-foreground">
										Bayar {formatRupiah(crewTotal)} ke semua crew langsung saat
										settle. Kalau dimatikan, fee jadi Hutang Crew & bisa dibayar
										belakangan.
									</p>
								</div>
								<Switch
									checked={payNow}
									onCheckedChange={() => setPayNow((v) => !v)}
								/>
							</div>
							{payNow && (
								<div className="mt-3 space-y-1">
									<span className="block text-xs font-medium text-muted-foreground">
										Bayar dari rekening
									</span>
									<Combobox
										value={payAccount}
										onValueChange={(v) => setPayAccount(v ?? "")}
										options={cashAccounts.map((a) => ({
											value: a.code,
											label:
												a.balance !== undefined
													? `${a.code} · ${a.name} — ${formatRupiah(a.balance)}`
													: `${a.code} · ${a.name}`,
											disabled:
												a.balance !== undefined && a.balance < crewTotal,
										}))}
										placeholder="Pilih rekening"
										allowFreeText={false}
									/>
									{payInsufficient ? (
										<p className="tabular text-[11px] font-medium text-rose-600">
											Saldo {payAcct?.name} tidak cukup (
											{formatRupiah(payAcct?.balance ?? 0)}) untuk bayar{" "}
											{formatRupiah(crewTotal)} — pilih rekening lain.
										</p>
									) : (
										<p className="tabular text-[11px] text-muted-foreground">
											Saldo rekening berkurang {formatRupiah(crewTotal)} · tiap
											crew ditandai lunas. Bukti transfer yang sudah diupload
											tetap tersimpan.
										</p>
									)}
								</div>
							)}
						</div>
					)}

					{canPayKomisi && (
						<div className="rounded-md border border-border-default bg-surface-2 p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
										<Handshake className="h-4 w-4 text-muted-foreground" />
										Sekalian bayar komisi {commission?.payeeName}
									</p>
									<p className="tabular mt-0.5 text-xs text-muted-foreground">
										Bayar {formatRupiah(komisiTotal)} sekarang juga. Kalau
										dimatikan, komisi jadi utang & bisa dibayar belakangan di
										Finance › Komisi.
									</p>
								</div>
								<Switch
									checked={payKomisi}
									onCheckedChange={() => setPayKomisi((v) => !v)}
								/>
							</div>
							{payKomisi && (
								<div className="mt-3 space-y-1">
									<span className="block text-xs font-medium text-muted-foreground">
										Bayar komisi dari rekening
									</span>
									<Combobox
										value={komisiAccount}
										onValueChange={(v) => setKomisiAccount(v ?? "")}
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
									{komisiInsufficient && (
										<p className="tabular text-[11px] font-medium text-rose-600">
											Saldo {komisiAcct?.name} tidak cukup (
											{formatRupiah(komisiAcct?.balance ?? 0)}) untuk semua yang
											dibayar dari rekening ini — pilih rekening lain.
										</p>
									)}
								</div>
							)}
						</div>
					)}

					{commission?.paidInAdvance && (
						<div className="flex items-start gap-2 rounded-md border border-sky-500/25 bg-sky-500/8 p-3 text-xs leading-relaxed text-sky-800 dark:text-sky-300">
							<Handshake className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
							<span>
								Komisi {commission.payeeName} (
								<span data-nominal>{formatRupiah(commission.amount)}</span>)
								sudah dibayar di muka. Saat settle, uang mukanya otomatis
								diperhitungkan — tidak jadi utang & tidak tertagih dua kali.
							</span>
						</div>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							type="button"
							onClick={handleConfirm}
							disabled={
								pending ||
								(payNow && (!payAccount || payInsufficient)) ||
								(payKomisi && (!komisiAccount || komisiInsufficient))
							}
						>
							{pending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{payNow || payKomisi ? "Settle & bayar…" : "Settling…"}
								</>
							) : (payNow && canPayNow) || (payKomisi && canPayKomisi) ? (
								"Konfirmasi settle & bayar"
							) : (
								"Konfirmasi settle"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
