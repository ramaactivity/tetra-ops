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
	/** Berapa crew yang benar-benar akan ditransfer — pengali biaya admin bank. */
	crewPayCount?: number;
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
		payeeName: string | null;
		amount: number;
	} | null;
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
	const canPayNow = crewTotal > 0 && cashAccounts.length > 0;
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
	const komisiTotal = commission?.paidInAdvance ? 0 : (commission?.amount ?? 0);
	const canPayKomisi = komisiTotal > 0 && cashAccounts.length > 0;
	const [payKomisi, setPayKomisi] = useState(false);
	const [komisiAccount, setKomisiAccount] = useState(() =>
		defaultAccount(cashAccounts, komisiTotal),
	);
	const [komisiAdminFee, setKomisiAdminFee] = useState(0);

	// Komisi sales Tetra hanya DITAMPILKAN di sini (final check) — diisi &
	// dibayar dari kartunya sendiri di halaman rekap.
	const salesInfo = props.salesCommission ?? null;

	// Kebutuhan uang per rekening — kalau fee crew & komisi dibayar dari rekening
	// yang sama, saldonya harus cukup untuk SEMUANYA, bukan masing-masing.
	function needFor(code: string): number {
		let need = 0;
		if (payNow && canPayNow && payAccount === code)
			need += crewTotal + crewAdminTotal;
		if (payKomisi && canPayKomisi && komisiAccount === code)
			need += komisiTotal + komisiAdminFee;
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
				payCrewAdminFee: doPay ? payAdminFee : null,
				payCommissionFromAccount: doPayKomisi ? komisiAccount : null,
				payCommissionAdminFee: doPayKomisi ? komisiAdminFee : null,
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
										{formatRupiah(props.opexTotal)}
									</dd>
									{salesInfo && salesInfo.amount > 0 && (
										<>
											<dt className="pl-3 text-xs text-muted-foreground">
												↳ komisi sales {salesInfo.payeeName ?? "Tetra"}
											</dt>
											<dd className="tabular text-right text-xs text-muted-foreground">
												{formatRupiah(salesInfo.amount)}
											</dd>
										</>
									)}
									<dt className="border-t border-border-default pt-1.5 text-sm font-medium text-foreground">
										Net profit
									</dt>
									<dd className="tabular border-t border-border-default pt-1.5 text-right text-sm font-semibold text-foreground">
										{formatRupiah(props.netProfit)}
									</dd>
								</dl>
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
												<AdminFeeField
													value={komisiAdminFee}
													onChange={setKomisiAdminFee}
												/>
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
