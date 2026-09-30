"use client";

import { AlertTriangle, Calculator, HandCoins, PiggyBank } from "lucide-react";
import {
	AmountRow,
	ResultRow,
	Step,
	StepBadge,
	SummaryTile,
} from "@/components/finance/money-ui";
import { EventHealth } from "@/components/rekap/event-health";
import { RekapCard, SectionHeader } from "@/components/rekap/rekap-ui";
import type {
	HppBreakdown,
	OpexBreakdown,
	ProfitPreview,
} from "@/lib/actions/profit-preview";
import { formatRupiah, formatSignedRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Hitungan untung event" — dibaca orang awam dari atas ke bawah:
 *   uang masuk → uang keluar → untung bersih → dibagi ke mana → sisa kas.
 *
 * Angka tetap dari mesin settlement (profit-preview.ts); kartu ini hanya
 * menyusun ulang supaya jelas. Satu hal yang sengaja dibuat jujur: dana
 * cadangan & bagi hasil owner dihitung settle dari untung SEBELUM pengeluaran
 * lain, padahal pengeluaran lain juga dibayar dari kas — jadi "sisa untuk kas
 * usaha" = untung bersih − pembagian, bukan operating cash versi settle.
 */

type Props = {
	preview: ProfitPreview;
	/**
	 * Biaya lapangan dibayar owner yang BELUM dibukukan. Dipotong dari untung
	 * walau belum jadi jurnal — uangnya sudah keluar.
	 */
	ownerPaidPending?: number;
	className?: string;
};

const HPP_LABELS: Record<keyof Omit<HppBreakdown, "total">, string> = {
	mediaset: "Media set (kertas & tinta)",
	sleeve: "Sleeve",
	flashdisk: "Flashdisk",
	pouch: "Pouch",
	photomagnet: "Photomagnet",
	keychain: "Keychain",
	bonus: "Bonus klien",
	other: "Lainnya",
};

const OPEX_LABELS: Record<
	keyof Omit<OpexBreakdown, "total" | "owner_paid_total">,
	string
> = {
	fee_lead: "Fee crew lead",
	fee_asisten: "Fee asisten",
	fee_crew_c: "Fee crew C",
	fee_extra: "Bonus crew",
	reimbursement: "Reimbursement",
	transport: "Transport",
	bensin: "Bensin",
	toll: "Tol",
	parking: "Parkir",
	konsumsi: "Konsumsi",
	misc: "Lain-lain",
	komisi_vendor: "Komisi vendor",
	komisi_relasi: "Komisi relasi",
	komisi_sales: "Komisi sales Tetra",
};

type Line = { label: string; value: number; note?: string };

export function ProfitPreviewCard({
	preview,
	ownerPaidPending = 0,
	className,
}: Props) {
	const ex = preview.extra;

	// ── Uang masuk ──
	const masukLines: Line[] = [
		{ label: "Harga paket", value: preview.revenue_gross },
		...(preview.addon_revenue > 0
			? [{ label: "Add-on", value: preview.addon_revenue }]
			: []),
		...(preview.discount_total > 0
			? [{ label: "Diskon", value: -preview.discount_total }]
			: []),
		...ex.items
			.filter((i) => i.direction === "masuk")
			.map((i) => ({
				label: i.label,
				value: i.amount,
				note: "pemasukan lain",
			})),
	];
	const uangMasuk = preview.revenue_net + ex.incomeTotal;

	// ── Uang keluar ──
	const hppLines: Line[] = (
		Object.keys(HPP_LABELS) as Array<keyof typeof HPP_LABELS>
	)
		.filter((k) => preview.hpp[k] !== 0)
		.map((k) => ({ label: HPP_LABELS[k], value: preview.hpp[k] }));
	const opexLines: Line[] = (
		Object.keys(OPEX_LABELS) as Array<keyof typeof OPEX_LABELS>
	)
		.filter((k) => preview.opex[k] !== 0)
		.map((k) => ({ label: OPEX_LABELS[k], value: preview.opex[k] }));
	const lainLines: Line[] = [
		...ex.items
			.filter((i) => i.direction === "keluar")
			.map((i) => ({ label: i.label, value: i.amount })),
		...(ownerPaidPending > 0
			? [
					{
						label: "Dibayar owner, belum dicatat",
						value: ownerPaidPending,
						note: "catat di kartu Pemasukan / pengeluaran lain",
					},
				]
			: []),
	];
	const lainTotal = ex.expenseTotal + ownerPaidPending;
	const uangKeluar = preview.total_biaya + lainTotal;

	// ── Hasil ──
	const untung = uangMasuk - uangKeluar;
	const rugi = untung < 0;
	const persen = uangMasuk > 0 ? (untung / uangMasuk) * 100 : 0;

	// ── Pembagian — aturan settle (profit-allocation.ts): dana cadangan
	// dikorbankan dulu, bagi hasil owner dihapus kalau untung tidak cukup.
	const al = preview.allocation;
	const cadangan = al.sinkingTotal;
	const bagiHasil = al.ownerPool;
	const sisaKas = untung - cadangan - bagiHasil - al.arrearsPaid;

	return (
		<RekapCard className={cn("space-y-4", className)}>
			<SectionHeader
				icon={Calculator}
				title="Hitungan untung event"
				description="Dari uang yang masuk, dikurangi semua biaya, sampai sisa yang masuk kas usaha. Berubah otomatis saat rekap diisi."
			/>

			{/* Ringkasan 3 angka */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<SummaryTile
					label="Uang masuk"
					hint="dari klien"
					value={uangMasuk}
					icon="in"
					tone="in"
				/>
				<SummaryTile
					label="Uang keluar"
					hint="bahan, crew & operasional"
					value={uangKeluar}
					icon="out"
					tone="out"
				/>
				<SummaryTile
					label={rugi ? "Rugi event" : "Untung bersih"}
					hint={
						uangMasuk > 0
							? `${persen.toFixed(1).replace(".", ",")}% dari uang masuk`
							: "belum ada uang masuk"
					}
					value={untung}
					tone={rugi ? "loss" : "profit"}
				/>
			</div>

			<EventHealth
				uangMasuk={uangMasuk}
				bahan={preview.hpp.total}
				operasional={preview.opex.total}
				lain={lainTotal}
				untung={untung}
			/>

			{/* 1. Uang masuk */}
			<Step
				n={1}
				title="Uang masuk"
				total={uangMasuk}
				groups={[{ title: null, lines: masukLines }]}
			/>

			{/* 2. Uang keluar */}
			<Step
				n={2}
				title="Uang keluar"
				total={-uangKeluar}
				groups={[
					{
						title: "Bahan habis pakai",
						hint: "kertas, tinta & souvenir yang habis dipakai",
						lines: hppLines,
						empty: "Belum ada pemakaian bahan tercatat",
					},
					{
						title: "Crew & operasional",
						hint: "bayar crew, ongkos jalan & komisi",
						lines: opexLines,
						empty: "Belum ada biaya operasional tercatat",
						footnote:
							preview.opex.owner_paid_total > 0
								? `${formatRupiah(preview.opex.owner_paid_total)} dibayar langsung owner — dihitung di "Pengeluaran lain", bukan di sini, supaya tidak dobel.`
								: undefined,
					},
					...(lainLines.length > 0
						? [
								{
									title: "Pengeluaran lain",
									hint: "dari kartu Pemasukan / pengeluaran lain",
									lines: lainLines,
								},
							]
						: []),
				]}
			/>

			{/* Hasil */}
			<ResultRow
				label={rugi ? "Rugi event" : "Untung bersih event"}
				sub="Uang masuk − uang keluar"
				value={untung}
				tone={rugi ? "loss" : "profit"}
			/>

			{/* 3. Dibagi ke mana */}
			<section className="rounded-2xl border border-border-subtle bg-secondary/40 p-4">
				<div className="flex items-start gap-3">
					<StepBadge n={3} />
					<div className="min-w-0 flex-1 space-y-3">
						<div>
							<h4 className="text-[14px] font-semibold text-foreground">
								Untungnya dibagi ke mana
							</h4>
							<p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
								Saat settle, untung bersih dibagi: bagi hasil owner dulu, lalu
								dana cadangan. Kalau untung tidak cukup, dana cadangan yang
								dikurangi lebih dulu.
							</p>
						</div>

						{al.status !== "penuh" ? (
							<AllocationWarning
								status={al.status}
								available={al.available}
								sinkingTarget={al.sinkingTarget}
								sinkingTotal={al.sinkingTotal}
								ownerPoolTarget={al.ownerPoolTarget}
							/>
						) : null}

						<div className="space-y-1.5">
							<AmountRow label="Untung bersih event" value={untung} />
							<AmountRow
								label={
									cadangan < al.sinkingTarget
										? `Dana cadangan (target ${formatRupiah(al.sinkingTarget)})`
										: "Disisihkan ke dana cadangan"
								}
								value={-cadangan}
								muted
							/>
							<AmountRow
								label={
									al.arrearsCreated > 0
										? "Bagi hasil owner (ditunda)"
										: "Bagi hasil owner"
								}
								value={-bagiHasil}
								muted
							/>
							{al.arrearsPaid > 0 ? (
								<AmountRow
									label="Lunasi bagi hasil tertunda event sebelumnya"
									value={-al.arrearsPaid}
									muted
								/>
							) : null}
						</div>
						{al.arrearsPaid > 0 ? (
							<p className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] leading-snug text-emerald-900">
								<HandCoins className="mt-0.5 size-4 shrink-0" />
								<span>
									Subsidi silang: sisa untung event ini melunasi{" "}
									<b>{formatRupiah(al.arrearsPaid)}</b> bagi hasil owner yang
									tertunda dari event sebelumnya.
								</span>
							</p>
						) : null}
						<div className="border-t border-border-default pt-3">
							<div className="flex items-baseline justify-between gap-3">
								<span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
									<PiggyBank className="size-4 text-muted-foreground" />
									Sisa untuk kas usaha
								</span>
								<span
									data-nominal
									className={cn(
										"tabular text-[20px] font-bold tracking-[-0.01em]",
										sisaKas < 0 ? "text-amber-700" : "text-foreground",
									)}
								>
									{formatSignedRupiah(sisaKas)}
								</span>
							</div>
							{sisaKas < 0 ? (
								<p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
									Event ini <b>rugi {formatRupiah(-sisaKas)}</b> — kas usaha
									menutup kekurangannya.
								</p>
							) : null}
							{ownerPaidPending > 0 ? (
								<p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
									Ada biaya dibayar owner yang belum dicatat (
									<span className="tabular">
										{formatRupiah(ownerPaidPending)}
									</span>
									). Catat dulu sebelum settle supaya pembagian di atas tepat.
								</p>
							) : null}
						</div>
					</div>
				</div>
			</section>

			{ex.expenseQueued + ex.incomeQueued > 0 ? (
				<p className="text-[11.5px] text-muted-foreground">
					<span className="tabular">
						{formatRupiah(ex.expenseQueued + ex.incomeQueued)}
					</span>{" "}
					dari pengeluaran/pemasukan lain baru masuk buku saat event di-settle.
				</p>
			) : null}
		</RekapCard>
	);
}

// ─────────────────────────────────────────────────────────────────────────

/** Peringatan saat untung tidak cukup untuk pembagian penuh. */
function AllocationWarning({
	status,
	available,
	sinkingTarget,
	sinkingTotal,
	ownerPoolTarget,
}: {
	status: "cadangan_dikurangi" | "tanpa_pembagian";
	available: number;
	sinkingTarget: number;
	sinkingTotal: number;
	ownerPoolTarget: number;
}) {
	let text: React.ReactNode;
	if (status === "cadangan_dikurangi") {
		text = (
			<>
				Untung bersih belum cukup untuk dana cadangan penuh. Bagi hasil owner
				tetap <b>{formatRupiah(ownerPoolTarget)}</b>, dana cadangan dikurangi
				dari {formatRupiah(sinkingTarget)} jadi{" "}
				<b>{formatRupiah(sinkingTotal)}</b>.
			</>
		);
	} else if (available > 0) {
		text = (
			<>
				Untung bersih <b>{formatRupiah(available)}</b> lebih kecil dari bagi
				hasil owner ({formatRupiah(ownerPoolTarget)}). Dana cadangan tidak
				disisihkan dan bagi hasil owner <b>ditunda</b> — dicatat sebagai
				tunggakan, dibayar dari sisa untung event berikutnya.
			</>
		);
	} else {
		text = (
			<>
				Event ini <b>tidak untung</b> setelah semua biaya. Dana cadangan tidak
				disisihkan; bagi hasil owner ({formatRupiah(ownerPoolTarget)})
				<b> ditunda</b> sebagai tunggakan untuk event berikutnya.
			</>
		);
	}
	return (
		<div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-snug text-amber-900">
			<AlertTriangle className="mt-0.5 size-4 shrink-0" />
			<p>{text}</p>
		</div>
	);
}
