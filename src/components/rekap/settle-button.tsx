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
import { Fragment, useState, useTransition } from "react";
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
	type HppBreakdown,
	type OpexBreakdown,
	type StockCheckShortage,
} from "@/lib/actions/profit-preview";
import { settleEvent } from "@/lib/actions/settle-event";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

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
	/** Berapa crew yang benar-benar akan ditransfer — pengali biaya admin bank. */
	crewPayCount?: number;
	/** Rekening kas/bank (+ saldo live) untuk opsi bayar-sambil-settle. */
	cashAccounts?: Array<{ code: string; name: string; balance?: number }>;
	/**
	 * Komisi yang menempel di event ini (vendor/relasi/sales) — untuk opsi
	 * "sekalian bayar komisi" tanpa pindah ke halaman Komisi. Null kalau event
	 * ini tak punya komisi atau vendornya mode Potongan Langsung.
	 */
	/** Komisi mitra (vendor/relasi) — read-only, diatur dari kartunya sendiri. */
	commission?: {
		payeeName: string;
		amount: number;
		/** Rencana bayarnya sudah diatur di kartu Komisi vendor/relasi. */
		planned: boolean;
	} | null;
	/**
	 * Komisi sales/admin Tetra yang closing event ini — TERPISAH dari komisi
	 * mitra di atas & berlaku di semua channel (event vendor pun sales-nya tetap
	 * dapat komisi). Nominalnya tentatif, jadi bisa diisi/diubah di sini sebelum
	 * settle; ikut jadi beban + Hutang Komisi (2-102) di jurnal settlement.
	 */
	salesCommission?: {
		payeeName: string | null;
		amount: number;
	} | null;
	/**
	 * Yang diisi di kartu-kartu rekap & baru dibukukan saat settle ini —
	 * ditampilkan sebagai bagian final check, bukan untuk diedit di sini.
	 */
	queued?: {
		expenseOut: number;
		expenseIn: number;
		count: number;
		salesCommissionPayment: number | null;
	} | null;
	/**
	 * Rincian lengkap angka penutupan — dipakai untuk final check sebelum
	 * settle. Semua komponennya sudah dihitung getProfitPreview; di sini cuma
	 * ditampilkan supaya owner bisa memeriksa dari mana angkanya datang, bukan
	 * cuma melihat empat baris ringkas lalu menekan tombol permanen.
	 */
	breakdown?: {
		revenueGross: number;
		addonRevenue: number;
		discountTotal: number;
		/** Gross-up PPh yang ditambahkan ke tagihan (ikut jadi revenue). */
		grossUpPph: number;
		/** Potongan langsung vendor (upfront_cut) — sudah di luar revenue net. */
		vendorCut: number;
		hpp: HppBreakdown;
		opex: OpexBreakdown;
		marginPct: number;
		isLoss: boolean;
		/** Sisa kas operasional setelah sinking + owner pool. */
		operatingCash: number;
	} | null;
	/** Status tagihan klien — settle dengan piutang tersisa perlu terlihat. */
	billing?: { grandTotal: number; totalPaid: number; remaining: number } | null;
	/** Konteks rekap: jumlah cetak + ukuran, biar HPP-nya masuk akal dibaca. */
	printSummary?: { cetakTotal: number; frameSize: string | null } | null;
	/** Laba akhir event setelah pengeluaran/pemasukan lain. */
	netProfitAfterExtra?: number;
	/** Sudah ada rencana bayar fee crew dari kartu Fee crew → jangan tawari lagi. */
	crewFeePlanned?: boolean;
	/** Biaya dibayar owner yang belum dibukukan — sudah ikut dipotong di laba akhir. */
	ownerPaidPending?: number;
};

/**
 * Nominal komisi sales yang paling sering dipakai di lapangan. Rp0 ikut jadi
 * pilihan: sales-nya tetap tercatat sebagai yang closing, tapi memang tidak
 * ambil komisi. Sama dengan chip di form booking.
 */
const _SALES_QUICK_AMOUNTS = [
	{ amount: 0, label: "Tanpa komisi" },
	{ amount: 50_000, label: "Rp 50.000" },
	{ amount: 100_000, label: "Rp 100.000" },
];
/** Saran nominal saat toggle komisi baru dinyalakan. */
const _SALES_COMMISSION_SUGGESTION = 100_000;

type CashAccount = { code: string; name: string; balance?: number };

/**
 * Rekening default untuk semua pembayaran di dialog ini: BCA dulu — itu
 * rekening operasional Tetra. Kas Tunai (yang kebetulan urutan pertama &
 * saldonya Rp0) bukan default yang masuk akal. Kalau BCA tak ada, pilih bank
 * lain, lalu rekening pertama yang saldonya cukup.
 */
function defaultAccount(accounts: CashAccount[], amount = 0): string {
	const enough = (a: CashAccount) =>
		a.balance === undefined || a.balance >= amount;
	const bca = accounts.find((a) => /bca/i.test(a.name));
	if (bca) return bca.code;
	const bank = accounts.find((a) => /bank/i.test(a.name) && enough(a));
	if (bank) return bank.code;
	return accounts.find(enough)?.code ?? accounts[0]?.code ?? "";
}

export function SettleButton(props: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [stockChecking, setStockChecking] = useState(false);
	const [shortages, setShortages] = useState<StockCheckShortage[]>([]);
	const [pending, startTransition] = useTransition();
	const cashAccounts = props.cashAccounts ?? [];
	const crewTotal = props.crewTotal ?? 0;
	// Kalau rekening & biaya adminnya sudah diatur di kartu Fee crew, dialog ini
	// tidak menawarkan lagi — supaya tidak ada dua tempat yang mengatur hal sama
	// (dan tidak ada risiko dobel transfer).
	const canPayNow =
		crewTotal > 0 && cashAccounts.length > 0 && !props.crewFeePlanned;
	const [payNow, setPayNow] = useState(false);
	const [payAccount, setPayAccount] = useState(() =>
		defaultAccount(cashAccounts, crewTotal),
	);
	// Biaya admin bank per transfer. Fee crew = 1 transfer per crew, jadi
	// totalnya dikali jumlah crew yang dibayar; komisi cuma 1 transfer.
	const [payAdminFee, setPayAdminFee] = useState(0);
	const crewPayCount = Math.max(1, props.crewPayCount ?? 1);
	const crewAdminTotal = payAdminFee * crewPayCount;
	const commission = props.commission ?? null;

	// Komisi sales Tetra hanya DITAMPILKAN di sini (final check) — diisi &
	// dibayar dari kartunya sendiri di halaman rekap.
	const salesInfo = props.salesCommission ?? null;
	const queued = props.queued ?? null;
	// Ditampilkan cuma kalau memang beda dari net profit settlement.
	const netAfterExtra =
		props.netProfitAfterExtra !== undefined &&
		props.netProfitAfterExtra !== props.netProfit
			? props.netProfitAfterExtra
			: null;

	const bd = props.breakdown ?? null;
	// Fee crew digabung jadi satu baris: pemisahan lead/asisten/crew C/extra
	// sudah ada di kartu Fee crew, dan di sini yang dicek "berapa totalnya".
	const feeCrewTotal = bd
		? bd.opex.fee_lead +
			bd.opex.fee_asisten +
			bd.opex.fee_crew_c +
			bd.opex.fee_extra
		: 0;
	// Ada kolom opsi pembayaran? Kalau tidak, rincian angka yang memakai
	// ruangnya — kolom kosong tidak membantu siapa pun saat review.
	const hasPaymentCol = canPayNow || Boolean(commission);
	// Uang yang benar-benar bergerak saat tombol settle ditekan.
	const cashOutOnSettle =
		(payNow && canPayNow ? crewTotal + crewAdminTotal : 0) +
		(queued?.expenseOut ?? 0) +
		(queued?.salesCommissionPayment ?? 0) +
		(commission?.planned ? commission.amount : 0);
	const cashInOnSettle = queued?.expenseIn ?? 0;

	// Kebutuhan uang per rekening — kalau fee crew & komisi dibayar dari rekening
	// yang sama, saldonya harus cukup untuk SEMUANYA, bukan masing-masing.
	function needFor(code: string): number {
		let need = 0;
		if (payNow && canPayNow && payAccount === code)
			need += crewTotal + crewAdminTotal;
		return need;
	}
	const payAcct = cashAccounts.find((a) => a.code === payAccount);
	const payInsufficient =
		payAcct?.balance !== undefined && payAcct.balance < needFor(payAccount);

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
			const result = await settleEvent(props.eventId, props.projectId, {
				payCrewFromAccount: doPay ? payAccount : null,
				payCrewAdminFee: doPay ? payAdminFee : null,
			});
			if (!result.ok) {
				toast.error(result.error || "Gagal settle event");
				return;
			}
			const cp = result.crewPayment;
			const q = result.queue;
			const done: string[] = [];
			if (cp && cp.paid > 0) done.push(`${cp.paid} fee crew`);
			if (q && q.posted > 0) done.push(`${q.posted} transaksi dibukukan`);
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
			if (q && q.failed > 0) {
				toast.error(
					`${q.failed} transaksi gagal dibukukan (${q.errors[0] ?? "unknown"}) — event tetap ter-settle, cek kartu Pemasukan/pengeluaran lain.`,
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
									{props.crewFeePlanned && (
										<li>Transfer fee crew sesuai rencana di kartu Fee crew</li>
									)}
									{commission?.planned && (
										<li>Transfer komisi {commission.payeeName}</li>
									)}
									{queued && queued.count > 0 && (
										<li>
											Bukukan {queued.count} transaksi dari kartu rekap
											{queued.salesCommissionPayment
												? " (termasuk bayar komisi sales)"
												: ""}
										</li>
									)}
									<li>Lock event + recap (tidak bisa di-edit lagi)</li>
									<li>
										Audit log dengan timestamp + actor
										{hasShortage ? " + stock warning entry" : ""}
									</li>
								</ul>
							</section>

							{/* Kolom 2 — final check: dari mana angkanya datang.
							    Melebar mengisi kolom 3 kalau tidak ada opsi pembayaran,
							    supaya ruangnya dipakai untuk rincian, bukan dibiarkan kosong. */}
							<section
								className={cn(
									"rounded-xl border border-border-default bg-surface-2 p-3",
									hasPaymentCol ? "" : "md:col-span-2 lg:col-span-2",
								)}
							>
								<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
									<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
										Final check — rincian angka
									</p>
									{props.printSummary && props.printSummary.cetakTotal > 0 && (
										<p className="tabular text-[11px] text-muted-foreground">
											{props.printSummary.cetakTotal} cetak
											{props.printSummary.frameSize
												? ` · ${props.printSummary.frameSize}`
												: " · ukuran belum diisi"}
										</p>
									)}
								</div>

								<div
									className={cn(
										"mt-2.5 gap-x-6 gap-y-3.5",
										hasPaymentCol ? "space-y-3.5" : "grid sm:grid-cols-2",
									)}
								>
									{/* Pendapatan */}
									<MoneyGroup
										title="Pendapatan"
										total={props.revenueNet}
										totalLabel="Revenue net"
										rows={
											bd
												? [
														{
															label: "Paket",
															value: bd.revenueGross - bd.addonRevenue,
														},
														{ label: "Add-on", value: bd.addonRevenue },
														{ label: "Diskon", value: -bd.discountTotal },
													]
												: []
										}
										footer={
											props.billing ? (
												props.billing.remaining > 0 ? (
													<span className="tabular text-rose-600 dark:text-rose-400">
														Klien masih kurang bayar{" "}
														{formatRupiah(props.billing.remaining)} — settle
														tetap boleh, sisanya jadi piutang.
													</span>
												) : (
													<span className="tabular text-muted-foreground">
														Tagihan lunas ·{" "}
														{formatRupiah(props.billing.totalPaid)} diterima
														{bd && bd.vendorCut > 0
															? ` (${formatRupiah(bd.vendorCut)} dipotong vendor di muka)`
															: ""}
														.
													</span>
												)
											) : null
										}
									/>

									{/* HPP */}
									<MoneyGroup
										title="HPP (barang terpakai)"
										total={props.hppTotal}
										rows={
											bd
												? [
														{ label: "Mediaset", value: bd.hpp.mediaset },
														{ label: "Sleeve", value: bd.hpp.sleeve },
														{ label: "Flashdisk", value: bd.hpp.flashdisk },
														{ label: "Pouch", value: bd.hpp.pouch },
														{ label: "Photomagnet", value: bd.hpp.photomagnet },
														{ label: "Keychain", value: bd.hpp.keychain },
														{ label: "Bonus klien", value: bd.hpp.bonus },
														{ label: "Lainnya", value: bd.hpp.other },
													]
												: []
										}
									/>

									{/* OpEx */}
									<MoneyGroup
										title="Biaya operasional"
										total={props.opexTotal}
										rows={
											bd
												? [
														{ label: "Fee crew", value: feeCrewTotal },
														{
															label: "Reimbursement crew",
															value: bd.opex.reimbursement,
														},
														{ label: "Transport", value: bd.opex.transport },
														{ label: "Bensin", value: bd.opex.bensin },
														{ label: "Tol", value: bd.opex.toll },
														{ label: "Parkir", value: bd.opex.parking },
														{ label: "Konsumsi", value: bd.opex.konsumsi },
														{ label: "Lain-lain", value: bd.opex.misc },
														{
															label: "Komisi vendor",
															value: bd.opex.komisi_vendor,
														},
														{
															label: "Komisi relasi",
															value: bd.opex.komisi_relasi,
														},
														{
															label: salesInfo?.payeeName
																? `Komisi sales ${salesInfo.payeeName}`
																: "Komisi sales",
															value: bd.opex.komisi_sales,
														},
													]
												: []
										}
									/>

									{/* Hasil + alokasi */}
									<div className="space-y-2">
										<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
											Hasil & alokasi
										</p>
										<dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
											<dt className="font-medium text-foreground">
												Net profit
											</dt>
											<dd
												className={cn(
													"tabular text-right font-semibold",
													bd?.isLoss
														? "text-rose-600 dark:text-rose-400"
														: "text-foreground",
												)}
											>
												{formatRupiah(props.netProfit)}
											</dd>
											{bd && (
												<>
													<dt className="text-muted-foreground">Margin</dt>
													<dd className="tabular text-right text-muted-foreground">
														{Math.round(bd.marginPct)}%
														{bd.isLoss ? " · RUGI" : ""}
													</dd>
												</>
											)}
											{queued && queued.expenseOut > 0 && (
												<>
													<dt className="text-muted-foreground">
														Pengeluaran lain
													</dt>
													<dd className="tabular text-right text-foreground">
														−{formatRupiah(queued.expenseOut)}
													</dd>
												</>
											)}
											{queued && queued.expenseIn > 0 && (
												<>
													<dt className="text-muted-foreground">
														Pemasukan lain
													</dt>
													<dd className="tabular text-right text-foreground">
														+{formatRupiah(queued.expenseIn)}
													</dd>
												</>
											)}
											{(props.ownerPaidPending ?? 0) > 0 && (
												<>
													<dt className="text-muted-foreground">
														Biaya dibayar owner
													</dt>
													<dd className="tabular text-right text-foreground">
														−{formatRupiah(props.ownerPaidPending ?? 0)}
													</dd>
												</>
											)}
											{netAfterExtra !== null && (
												<>
													<dt className="border-t border-border-default pt-1.5 font-medium text-foreground">
														Laba akhir event
													</dt>
													<dd className="tabular border-t border-border-default pt-1.5 text-right font-semibold text-foreground">
														{formatRupiah(netAfterExtra)}
													</dd>
												</>
											)}
											<dt className="pt-1.5 text-muted-foreground">
												Sinking funds
											</dt>
											<dd className="tabular pt-1.5 text-right text-foreground">
												{formatRupiah(props.sinkingEstimate)}
											</dd>
											<dt className="text-muted-foreground">
												Bagi hasil owner
											</dt>
											<dd className="tabular text-right text-foreground">
												{formatRupiah(props.ownerPoolEstimate)}
											</dd>
											{bd && (
												<>
													<dt className="text-muted-foreground">
														Sisa kas operasional
													</dt>
													<dd className="tabular text-right text-foreground">
														{formatRupiah(bd.operatingCash)}
													</dd>
												</>
											)}
										</dl>

										{/* Uang yang benar-benar bergerak saat tombol ditekan —
										    ikut berubah kalau opsi bayar fee crew dinyalakan. */}
										{(cashOutOnSettle > 0 || cashInOnSettle > 0) && (
											<div className="rounded-lg border border-dashed border-border-default bg-surface-1 px-2.5 py-2">
												<p className="text-[11px] font-medium text-muted-foreground">
													Kas bergerak saat settle
												</p>
												<dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[12px]">
													{cashOutOnSettle > 0 && (
														<>
															<dt className="text-muted-foreground">
																Uang keluar
															</dt>
															<dd className="tabular text-right font-medium text-foreground">
																{formatRupiah(cashOutOnSettle)}
															</dd>
														</>
													)}
													{cashInOnSettle > 0 && (
														<>
															<dt className="text-muted-foreground">
																Uang masuk
															</dt>
															<dd className="tabular text-right font-medium text-foreground">
																{formatRupiah(cashInOnSettle)}
															</dd>
														</>
													)}
												</dl>
												{!payNow && crewTotal > 0 && !props.crewFeePlanned && (
													<p className="mt-1 text-[11px] text-muted-foreground">
														Fee crew {formatRupiah(crewTotal)} belum termasuk —
														jadi Hutang Crew, dibayar belakangan.
													</p>
												)}
											</div>
										)}
									</div>
								</div>
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
														{formatRupiah(crewTotal + crewAdminTotal)} — pilih
														rekening lain.
													</p>
												) : (
													<p className="tabular text-[11px] text-muted-foreground">
														Saldo rekening berkurang{" "}
														{formatRupiah(crewTotal + crewAdminTotal)} · tiap
														crew ditandai lunas. Bukti transfer yang sudah
														diupload tetap tersimpan.
													</p>
												)}
												<AdminFeeField
													value={payAdminFee}
													onChange={setPayAdminFee}
													hint={
														crewPayCount > 1
															? `${formatRupiah(payAdminFee)} × ${crewPayCount} transfer = ${formatRupiah(crewAdminTotal)}`
															: undefined
													}
												/>
											</div>
										)}
									</div>
								)}

								{commission && (
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
											){" "}
											{commission.planned
												? "akan ditransfer saat settle sesuai rencana di kartunya."
												: "jadi Hutang Komisi saat settle — bisa dibayar dari kartu Komisi mitra."}
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
							disabled={pending || (payNow && (!payAccount || payInsufficient))}
						>
							{pending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{payNow ? "Settle & bayar…" : "Settling…"}
								</>
							) : payNow && canPayNow ? (
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

/**
 * Satu kelompok angka di final check: baris-baris penyusun + totalnya.
 *
 * Baris bernilai nol disembunyikan — daftar panjang berisi "Rp 0" bikin mata
 * lelah dan justru menyamarkan angka yang benar-benar perlu diperiksa. Kalau
 * rinciannya tidak tersedia (preview lama), totalnya tetap tampil sendiri.
 */
function MoneyGroup({
	title,
	rows,
	total,
	totalLabel = "Total",
	footer,
}: {
	title: string;
	rows: Array<{ label: string; value: number }>;
	total: number;
	totalLabel?: string;
	footer?: React.ReactNode;
}) {
	const listed = rows.filter((r) => r.value !== 0);
	// Rincian WAJIB berjumlah sama dengan totalnya. Kalau ada selisih (mis.
	// komponen baru di mesin settlement yang belum punya barisnya sendiri di
	// sini), tampilkan sebagai "Lainnya" — jangan biarkan ada uang yang
	// tersembunyi di kolom yang justru dipakai untuk memeriksa.
	const diff =
		listed.length > 0 ? total - listed.reduce((s, r) => s + r.value, 0) : 0;
	const shown =
		diff !== 0 ? [...listed, { label: "Lainnya", value: diff }] : listed;
	return (
		<div className="space-y-1">
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					{title}
				</p>
				<span className="tabular text-[13px] font-semibold text-foreground">
					{formatRupiah(total)}
				</span>
			</div>
			{shown.length > 0 && (
				<dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[12.5px]">
					{shown.map((r) => (
						<Fragment key={r.label}>
							<dt className="truncate text-muted-foreground">{r.label}</dt>
							<dd className="tabular text-right text-foreground/90">
								{r.value < 0
									? `−${formatRupiah(Math.abs(r.value))}`
									: formatRupiah(r.value)}
							</dd>
						</Fragment>
					))}
				</dl>
			)}
			{shown.length > 1 && totalLabel !== "Total" && (
				<p className="text-[11px] text-muted-foreground">= {totalLabel}</p>
			)}
			{footer && <p className="text-[11px]">{footer}</p>}
		</div>
	);
}

/**
 * Biaya admin bank per transfer (Dr 5-600) — chip nominal yang paling sering
 * (Rp1.000 / Rp2.500) + isian bebas. Pola sama dgn tombol Bayar fee crew.
 */
function AdminFeeField({
	value,
	onChange,
	hint,
}: {
	value: number;
	onChange: (v: number) => void;
	hint?: string;
}) {
	return (
		<div className="space-y-1">
			<span className="block text-xs font-medium text-muted-foreground">
				Biaya admin bank (opsional)
			</span>
			<div className="flex items-center gap-1.5">
				{[1000, 2500].map((v) => (
					<button
						key={v}
						type="button"
						onClick={() => onChange(value === v ? 0 : v)}
						className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium ${
							value === v
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
					value={value === 0 ? "" : value}
					onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
					placeholder="lain"
					aria-label="Biaya admin bank"
					className="tabular h-9 w-full rounded-[10px] border border-border-default bg-card px-3 text-right text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
				/>
			</div>
			{hint && value > 0 && (
				<p className="tabular text-[11px] text-muted-foreground">{hint}</p>
			)}
		</div>
	);
}
