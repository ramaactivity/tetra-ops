"use client";

import {
	AlertTriangle,
	CheckCircle2,
	Handshake,
	Loader2,
	Lock,
	UserRound,
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
import { MoneyInput } from "@/components/ui/form-fields";
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
	/**
	 * Komisi sales/admin Tetra yang closing event ini — TERPISAH dari komisi
	 * mitra di atas & berlaku di semua channel (event vendor pun sales-nya tetap
	 * dapat komisi). Nominalnya tentatif, jadi bisa diisi/diubah di sini sebelum
	 * settle; ikut jadi beban + Hutang Komisi (2-102) di jurnal settlement.
	 */
	salesCommission?: {
		userId: string | null;
		payeeName: string | null;
		amount: number;
		paidInAdvance: boolean;
	} | null;
	/** User Tetra (owner/crew/admin) yang bisa dipilih sebagai penerima komisi. */
	salesCandidates?: Array<{ id: string; name: string; role: string }>;
};

/** Nominal komisi sales yang paling sering dipakai di lapangan. */
const SALES_QUICK_AMOUNTS = [50_000, 100_000];

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

	// ── Komisi sales Tetra (semua channel, nominal tentatif) ──────────────────
	const salesInfo = props.salesCommission ?? null;
	const salesCandidates = props.salesCandidates ?? [];
	const salesLocked = salesInfo?.paidInAdvance === true;
	const [salesOn, setSalesOn] = useState(() => (salesInfo?.amount ?? 0) > 0);
	const [salesAmount, setSalesAmount] = useState(() => salesInfo?.amount ?? 0);
	const [salesUserId, setSalesUserId] = useState(() => salesInfo?.userId ?? "");
	const [paySales, setPaySales] = useState(false);
	const [salesAccount, setSalesAccount] = useState(
		() =>
			cashAccounts.find(
				(a) => (a.balance ?? 0) >= (props.salesCommission?.amount ?? 0),
			)?.code ??
			cashAccounts[0]?.code ??
			"",
	);
	// Nominal yang benar-benar dikirim ke server (0 = komisi sales dihapus).
	const salesEffective = salesOn ? salesAmount : 0;
	const canPaySales =
		!salesLocked &&
		salesEffective > 0 &&
		!!salesUserId &&
		cashAccounts.length > 0;
	const salesChanged =
		!salesLocked &&
		(salesEffective !== (salesInfo?.amount ?? 0) ||
			(salesEffective > 0 && salesUserId !== (salesInfo?.userId ?? "")));

	// Kebutuhan uang per rekening — kalau fee crew & komisi dibayar dari rekening
	// yang sama, saldonya harus cukup untuk SEMUANYA, bukan masing-masing.
	function needFor(code: string): number {
		let need = 0;
		if (payNow && canPayNow && payAccount === code) need += crewTotal;
		if (payKomisi && canPayKomisi && komisiAccount === code)
			need += komisiTotal;
		if (paySales && canPaySales && salesAccount === code)
			need += salesEffective;
		return need;
	}
	const payAcct = cashAccounts.find((a) => a.code === payAccount);
	const payInsufficient =
		payAcct?.balance !== undefined && payAcct.balance < needFor(payAccount);
	const komisiAcct = cashAccounts.find((a) => a.code === komisiAccount);
	const komisiInsufficient =
		komisiAcct?.balance !== undefined &&
		komisiAcct.balance < needFor(komisiAccount);
	const salesAcct = cashAccounts.find((a) => a.code === salesAccount);
	const salesInsufficient =
		salesAcct?.balance !== undefined &&
		salesAcct.balance < needFor(salesAccount);

	// Komisi sales menambah OpEx & memotong laba di jurnal settlement, jadi
	// angka di ringkasan ikut bergerak begitu owner mengisinya di sini.
	const salesDelta = salesEffective - (salesInfo?.amount ?? 0);
	const opexShown = props.opexTotal + salesDelta;
	const netProfitShown = props.netProfit - salesDelta;

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
			const doPaySales = paySales && canPaySales && salesAccount;
			const result = await settleEvent(props.eventId, props.projectId, {
				payCrewFromAccount: doPay ? payAccount : null,
				payCommissionFromAccount: doPayKomisi ? komisiAccount : null,
				// Cuma dikirim kalau memang diubah — supaya settle biasa tidak
				// menyentuh kolom komisi event sama sekali.
				salesCommission: salesChanged
					? {
							user_id: salesEffective > 0 ? salesUserId : null,
							amount: salesEffective,
						}
					: null,
				paySalesCommissionFromAccount: doPaySales ? salesAccount : null,
			});
			if (!result.ok) {
				toast.error(result.error || "Gagal settle event");
				return;
			}
			const cp = result.crewPayment;
			const km = result.commissionPayment;
			const sk = result.salesCommissionPayment;
			const done: string[] = [];
			if (cp && cp.paid > 0) done.push(`${cp.paid} fee crew`);
			if (km?.paid) done.push(`komisi ${km.payeeName}`);
			if (sk?.paid) done.push(`komisi sales ${sk.payeeName}`);
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
			if (sk && !sk.paid) {
				toast.error(
					`Komisi sales gagal dibayar: ${sk.error ?? "unknown"} — event tetap ter-settle, bayar manual di Finance › Komisi.`,
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
				{/* Lebar & 3 kolom: isi dialog ini panjang (aksi + angka + sampai 3 opsi
				    pembayaran). Satu kolom bikin tombol konfirmasi jatuh di bawah lipatan
				    layar. Badan dialog yang men-scroll, header & footer tetap terlihat. */}
				<DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] gap-3 sm:max-w-5xl max-h-[88svh]">
					<DialogHeader className="pr-8">
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

					<div className="min-h-0 space-y-3 overflow-y-auto">
						{hasShortage && (
							<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
								<p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
									⚠ Stok minus setelah settle untuk {shortages.length} item:
								</p>
								<ul className="mt-2 grid gap-1 text-xs text-amber-900 sm:grid-cols-2 lg:grid-cols-3 dark:text-amber-200">
									{shortages.map((s) => (
										<li key={s.item_id} className="tabular">
											<span className="font-medium">{s.sku}</span> · {s.name}:
											butuh {s.needed}, ada {s.available} (akan minus{" "}
											<span className="font-semibold">{s.shortage}</span>)
										</li>
									))}
								</ul>
								<p className="mt-2 text-xs text-amber-900 dark:text-amber-200">
									Settlement tetap bisa lanjut. Stok akan negatif sampai restock
									berikutnya.
								</p>
							</div>
						)}

						<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
							{/* Kolom 1 — apa yang akan terjadi */}
							<section className="rounded-xl border border-border-default bg-surface-2 p-3">
								<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
									Aksi yang akan dijalankan
								</p>
								<ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-foreground/90">
									<li>
										Potong stok warehouse sesuai konsumsi rekap
										{hasShortage ? " (bisa minus)" : ""}
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
									<li>Lock event + recap (tidak bisa di-edit lagi)</li>
									<li>
										Audit log dengan timestamp + actor
										{hasShortage ? " + stock warning entry" : ""}
									</li>
								</ul>
							</section>

							{/* Kolom 2 — angka penutupan */}
							<section className="rounded-xl border border-border-default bg-surface-2 p-3">
								<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
									Angka penutupan
								</p>
								<dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
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
										{formatRupiah(opexShown)}
									</dd>
									{salesDelta !== 0 && (
										<>
											<dt className="pl-3 text-xs text-muted-foreground">
												↳ termasuk komisi sales
											</dt>
											<dd className="tabular text-right text-xs text-muted-foreground">
												{formatRupiah(salesEffective)}
											</dd>
										</>
									)}
									<dt className="border-t border-border-default pt-1.5 text-sm font-medium text-foreground">
										Net profit
									</dt>
									<dd className="tabular border-t border-border-default pt-1.5 text-right text-sm font-semibold text-foreground">
										{formatRupiah(netProfitShown)}
									</dd>
								</dl>
								{salesDelta !== 0 && (
									<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
										Sudah termasuk komisi sales yang kamu isi di sebelah.
										Sinking fund & owner pool dihitung ulang dari laba akhir
										saat settle.
									</p>
								)}
							</section>

							{/* Kolom 3 — pembayaran sekalian saat settle */}
							<div className="space-y-3 md:col-span-2 lg:col-span-1">
								{canPayNow && (
									<div className="rounded-xl border border-border-default bg-surface-2 p-3">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
													<Wallet className="h-4 w-4 text-muted-foreground" />
													Sekalian bayar fee crew
												</p>
												<p className="tabular mt-0.5 text-xs text-muted-foreground">
													Bayar {formatRupiah(crewTotal)} ke semua crew langsung
													saat settle. Kalau dimatikan, fee jadi Hutang Crew &
													bisa dibayar belakangan.
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
														Saldo rekening berkurang {formatRupiah(crewTotal)} ·
														tiap crew ditandai lunas. Bukti transfer yang sudah
														diupload tetap tersimpan.
													</p>
												)}
											</div>
										)}
									</div>
								)}

								{canPayKomisi && (
									<div className="rounded-xl border border-border-default bg-surface-2 p-3">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
													<Handshake className="h-4 w-4 text-muted-foreground" />
													Sekalian bayar komisi {commission?.payeeName}
												</p>
												<p className="tabular mt-0.5 text-xs text-muted-foreground">
													Bayar {formatRupiah(komisiTotal)} sekarang juga. Kalau
													dimatikan, komisi jadi utang & bisa dibayar belakangan
													di Finance › Komisi.
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
														{formatRupiah(komisiAcct?.balance ?? 0)}) untuk
														semua yang dibayar dari rekening ini — pilih
														rekening lain.
													</p>
												)}
											</div>
										)}
									</div>
								)}

								{/* Komisi sales Tetra — berdiri sendiri: walau komisi vendor
								    sudah dibayar, sales/admin yang closing tetap dapat komisi. */}
								{salesInfo && (
									<div className="rounded-xl border border-border-default bg-surface-2 p-3">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
													<UserRound className="h-4 w-4 text-muted-foreground" />
													Komisi sales Tetra
												</p>
												<p className="mt-0.5 text-xs text-muted-foreground">
													{salesLocked
														? "Sudah dibayar di muka — nominalnya dikunci & otomatis diperhitungkan saat settle."
														: "Sales/admin yang closing tetap dapat komisi, walau komisi vendor/relasi sudah dibayar. Biasanya Rp50.000–100.000."}
												</p>
											</div>
											<Switch
												checked={salesOn}
												disabled={salesLocked}
												onCheckedChange={() =>
													setSalesOn((v) => {
														const next = !v;
														if (next && salesAmount === 0) {
															setSalesAmount(SALES_QUICK_AMOUNTS[1]);
														}
														if (!next) setPaySales(false);
														return next;
													})
												}
											/>
										</div>

										{salesOn && (
											<div className="mt-3 space-y-2">
												<div className="space-y-1">
													<span className="block text-xs font-medium text-muted-foreground">
														Sales penerima komisi
													</span>
													{salesLocked ? (
														<p className="text-sm text-foreground">
															{salesInfo.payeeName ?? "Sales Tetra"}
														</p>
													) : (
														<Combobox
															value={salesUserId}
															onValueChange={(v) => setSalesUserId(v ?? "")}
															options={salesCandidates.map((u) => ({
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
													{salesLocked ? (
														<p className="tabular text-sm font-medium text-foreground">
															{formatRupiah(salesInfo.amount)}
														</p>
													) : (
														<>
															<div className="flex flex-wrap gap-1.5">
																{SALES_QUICK_AMOUNTS.map((amt) => (
																	<Button
																		key={amt}
																		type="button"
																		size="xs"
																		variant={
																			salesAmount === amt
																				? "default"
																				: "outline"
																		}
																		className="tabular rounded-full"
																		onClick={() => setSalesAmount(amt)}
																	>
																		{formatRupiah(amt)}
																	</Button>
																))}
															</div>
															<MoneyInput
																value={salesAmount}
																onValueChange={setSalesAmount}
																aria-label="Nominal komisi sales"
															/>
														</>
													)}
												</div>

												{!salesLocked && salesEffective > 0 && !salesUserId && (
													<p className="text-[11px] font-medium text-rose-600">
														Pilih dulu sales penerimanya.
													</p>
												)}

												{canPaySales && (
													<div className="space-y-1 border-t border-border-default pt-2">
														<div className="flex items-center justify-between gap-3">
															<span className="text-xs font-medium text-foreground">
																Bayar sekarang juga
															</span>
															<Switch
																checked={paySales}
																onCheckedChange={() => setPaySales((v) => !v)}
															/>
														</div>
														{paySales ? (
															<>
																<Combobox
																	value={salesAccount}
																	onValueChange={(v) =>
																		setSalesAccount(v ?? "")
																	}
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
																{salesInsufficient && (
																	<p className="tabular text-[11px] font-medium text-rose-600">
																		Saldo {salesAcct?.name} tidak cukup (
																		{formatRupiah(salesAcct?.balance ?? 0)})
																		untuk semua yang dibayar dari rekening ini —
																		pilih rekening lain.
																	</p>
																)}
															</>
														) : (
															<p className="text-[11px] text-muted-foreground">
																Kalau tidak, komisinya jadi Hutang Komisi & bisa
																dibayar kapan saja di Finance › Komisi.
															</p>
														)}
													</div>
												)}
											</div>
										)}
									</div>
								)}

								{commission?.paidInAdvance && (
									<div className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/8 p-3 text-xs leading-relaxed text-sky-800 dark:text-sky-300">
										<Handshake
											className="mt-0.5 h-4 w-4 shrink-0"
											aria-hidden
										/>
										<span>
											Komisi {commission.payeeName} (
											<span data-nominal>
												{formatRupiah(commission.amount)}
											</span>
											) sudah dibayar di muka. Saat settle, uang mukanya
											otomatis diperhitungkan — tidak jadi utang & tidak
											tertagih dua kali.
										</span>
									</div>
								)}
							</div>
						</div>
					</div>

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
								(payKomisi && (!komisiAccount || komisiInsufficient)) ||
								(!salesLocked &&
									salesOn &&
									(salesAmount <= 0 || !salesUserId)) ||
								(paySales && (!salesAccount || salesInsufficient))
							}
						>
							{pending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{payNow || payKomisi || paySales
										? "Settle & bayar…"
										: "Settling…"}
								</>
							) : (payNow && canPayNow) ||
								(payKomisi && canPayKomisi) ||
								(paySales && canPaySales) ? (
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
