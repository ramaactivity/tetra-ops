import { Activity, Calculator, Info, Scale, Wallet } from "lucide-react";
import type * as React from "react";
import {
	type MoneyGroup,
	ResultRow,
	Step,
	SubGroup,
} from "@/components/finance/money-ui";
import {
	costStatus,
	type Status,
	StatusChip,
} from "@/components/rekap/event-health";
import { RekapCard, SectionHeader } from "@/components/rekap/rekap-ui";
import type { MonthlyPnl } from "@/lib/finance/monthly-pnl";
import { formatDateID, formatRupiah, formatSignedRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Laporan satu bulan untuk orang awam — bahasa desainnya sama dengan kartu
 * "Hitungan untung event" di rekap. Dua cerita yang sengaja dipisah:
 *   1. UNTUNG-RUGI — pendapatan & biaya dipasangkan per event (event bulan ini),
 *      ditambah biaya bulanan yang tidak terkait event.
 *   2. UANG MASUK & KELUAR — gerak saldo rekening apa adanya (DP event bulan
 *      depan ikut masuk di sini, tapi belum jadi untung).
 */

export type MonthlyCash = {
	opening: number;
	inflow: number;
	outflow: number;
	closing: number;
	outflowForExpense: number;
	outflowNonExpense: number;
};

const pct = (part: number, whole: number) =>
	whole > 0 ? (part / whole) * 100 : 0;
const pctText = (n: number) => `${Math.round(n)}%`;
const rp = (n: number) => formatRupiah(Math.round(n));

export function MonthlyReport({
	pnl,
	cash,
	monthLabel,
	periodMonths = 1,
	switcher,
	freeCash,
}: {
	pnl: MonthlyPnl;
	cash: MonthlyCash;
	monthLabel: string;
	/** Panjang rentang (bulan). >1 → teks "periode ini" & rata-rata per bulan. */
	periodMonths?: number;
	/** MonthSwitcher (client) — diteruskan dari page. */
	switcher: React.ReactNode;
	/** Uang "bebas dipakai" SAAT INI — untuk daya tahan kas. */
	freeCash: number;
}) {
	const pendapatan = pnl.revenue + pnl.otherIncome;
	// Komisi (vendor/relasi/sales) bukan biaya crew & jalan — dipisah.
	const crewJalan = pnl.opex - pnl.komisi + pnl.eventExtra;
	const biayaEvent = pnl.hpp + crewJalan + pnl.komisi;
	const totalBiaya = biayaEvent + pnl.overhead;
	const rugi = pnl.net < 0;
	const n = pnl.events.length;
	const multi = periodMonths > 1;
	const scope = multi ? "periode ini" : "bulan ini";
	const avgEventProfit = n > 0 ? pnl.eventProfit / n : 0;
	// Titik impas & daya tahan kas selalu per BULAN — rentang panjang dirata-rata.
	const overheadPerMonth = pnl.overhead / periodMonths;
	const eventsPerMonth = n / periodMonths;
	const impas =
		avgEventProfit > 0 ? Math.ceil(overheadPerMonth / avgEventProfit) : null;
	const bulanTahan = overheadPerMonth > 0 ? freeCash / overheadPerMonth : null;
	const dec = (x: number) => x.toFixed(1).replace(".", ",").replace(/,0$/, "");

	const pBahan = pct(pnl.hpp, pendapatan);
	const pCrew = pct(crewJalan, pendapatan);
	const pKomisi = pct(pnl.komisi, pendapatan);
	const pOver = pct(pnl.overhead, pendapatan);
	const pNet = pct(pnl.net, pendapatan);

	const ratios: Array<{
		title: string;
		pct: number;
		target: string;
		status: Status;
		note: string;
	}> =
		pendapatan > 0
			? [
					{
						title: "Biaya bahan",
						pct: pBahan,
						target: "Idealnya di bawah 25%",
						status: costStatus(pBahan, 25, 35),
						note: "Kertas, tinta, sleeve, flashdisk & souvenir.",
					},
					{
						title: "Crew & jalan",
						pct: pCrew,
						target: "Idealnya di bawah 35%",
						status: costStatus(pCrew, 35, 45),
						note: "Fee crew, transport, bensin, tol, makan.",
					},
					...(pnl.komisi > 0
						? [
								{
									title: "Komisi",
									pct: pKomisi,
									target: "sesuai kesepakatan",
									status: "baik" as Status,
									note: "Komisi vendor, relasi & sales.",
								},
							]
						: []),
					{
						title: "Biaya bulanan",
						pct: pOver,
						target: "Idealnya di bawah 20%",
						status: costStatus(pOver, 20, 30),
						note: "Kost, internet, platform, promosi, stok hilang.",
					},
					{
						title: "Untung bersih",
						pct: pNet,
						target: "Idealnya 20% atau lebih",
						status: pNet >= 20 ? "baik" : pNet >= 10 ? "cek" : "buruk",
						note: `Sisa setelah SEMUA biaya ${scope}.`,
					},
				]
			: [];
	const worst: Status | null =
		ratios.length === 0
			? null
			: ratios.some((r) => r.status === "buruk")
				? "buruk"
				: ratios.some((r) => r.status === "cek")
					? "cek"
					: "baik";
	const worstRow = ratios.find((r) => r.status === worst);

	const biayaGroups: MoneyGroup[] = [
		{
			title: `Biaya ${n} event`,
			hint: "yang keluar karena ada event",
			lines: [
				{ label: "Bahan cetak & souvenir", value: pnl.hpp },
				{ label: "Crew & jalan", value: pnl.opex - pnl.komisi },
				...(pnl.komisi
					? [{ label: "Komisi vendor, relasi & sales", value: pnl.komisi }]
					: []),
				...(pnl.eventExtra
					? [
							{
								label: "Pengeluaran lain event",
								value: pnl.eventExtra,
								note: "dicatat terpisah, mis. sewa mobil",
							},
						]
					: []),
			],
			empty: "Belum ada event yang selesai",
		},
		{
			title: "Biaya bulanan",
			hint: "tetap keluar walau tidak ada event",
			lines: pnl.overheadGroups.map((g) => ({
				label: g.label,
				value: g.amount,
			})),
			empty: "Belum ada biaya bulanan tercatat",
		},
	];

	return (
		<RekapCard className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<SectionHeader
					icon={Calculator}
					title={`Laporan ${monthLabel}`}
					description={`Untung-rugi dihitung dari event yang berlangsung ${scope} — bukan dari uang yang kebetulan masuk.`}
				/>
				{switcher}
			</div>

			{pnl.pending.length > 0 && (
				<Note>
					{pnl.pending.length} event {scope} belum di-settle (
					<span className="tabular">
						{rp(pnl.pending.reduce((s, p) => s + p.grandTotal, 0))}
					</span>
					) — untungnya baru dihitung setelah settle, jadi angka di bawah masih
					berubah.
				</Note>
			)}

			{/* Sehat nggak bulan/periode ini? */}
			{ratios.length > 0 && (
				<section className="space-y-3 rounded-2xl border border-border-subtle bg-secondary/40 p-4">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div className="flex min-w-0 items-start gap-2.5">
							<span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground">
								<Activity className="size-4" aria-hidden />
							</span>
							<div className="min-w-0">
								<h4 className="text-[14px] font-semibold text-foreground">
									Sehat nggak {scope}?
								</h4>
								<p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
									{worst === "baik"
										? "Semua rasio masih wajar. Pertahankan."
										: `Yang paling perlu diperhatikan: ${worstRow?.title.toLowerCase()} (${pctText(worstRow?.pct ?? 0)}).`}
								</p>
							</div>
						</div>
						{worst && <StatusChip status={worst} />}
					</div>

					<ul className="grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
						{ratios.map((r) => (
							<li
								key={r.title}
								title={r.note}
								className="flex flex-wrap items-center gap-x-1.5"
							>
								<span className="text-foreground">{r.title}</span>
								<b className="tabular font-semibold text-foreground">
									{pctText(r.pct)}
								</b>
								<span className="text-muted-foreground">
									· {r.target.replace("Idealnya", "ideal")}
								</span>
								{r.status !== "baik" ? <StatusChip status={r.status} /> : null}
							</li>
						))}
					</ul>

					<div className="grid gap-x-6 gap-y-2 border-t border-border-subtle pt-3 md:grid-cols-2">
						{impas !== null && (
							<Insight icon={<Scale className="size-4" aria-hidden />}>
								Satu event rata-rata untung{" "}
								<b className="tabular">{rp(avgEventProfit)}</b>, biaya bulanan{" "}
								<b className="tabular">{rp(overheadPerMonth)}</b>
								{multi ? " per bulan" : ""}. Butuh <b>{impas} event</b> sebulan
								supaya biaya bulanan tertutup —{" "}
								{multi
									? eventsPerMonth >= impas
										? `periode ini rata-rata ${dec(eventsPerMonth)} event per bulan, sudah lewat titik impas.`
										: `periode ini rata-rata ${dec(eventsPerMonth)} event per bulan, kurang ${dec(impas - eventsPerMonth)} per bulan.`
									: n >= impas
										? `bulan ini ada ${n}, sudah lewat titik impas.`
										: `bulan ini baru ${n}, kurang ${impas - n} event.`}
							</Insight>
						)}
						{bulanTahan !== null && (
							<Insight icon={<Wallet className="size-4" aria-hidden />}>
								Uang bebas dipakai sekarang{" "}
								<b className="tabular">{rp(freeCash)}</b> cukup menutup biaya
								bulanan seperti ini selama{" "}
								<b>{bulanTahan.toFixed(1).replace(".", ",")} bulan</b>
								{bulanTahan >= 3
									? " — aman (idealnya minimal 3 bulan)."
									: " — idealnya minimal 3 bulan, jadi masih tipis."}
							</Insight>
						)}
					</div>
					<p className="text-[11px] leading-snug text-muted-foreground">
						Patokan dari rata-rata usaha photobooth & jasa event.
					</p>
				</section>
			)}

			<Step
				n={1}
				title="Uang dari event"
				description={`Harga paket + add-on − diskon, dari event ${scope} yang sudah selesai.`}
				total={pendapatan}
				groups={[
					{
						title: null,
						lines: [
							...pnl.events.map((e) => ({
								label: e.name,
								note: formatDateID(e.date),
								value: e.revenue,
								href: `/operations/${e.projectId}/rekap`,
							})),
							...(pnl.otherIncome
								? [{ label: "Pemasukan lain", value: pnl.otherIncome }]
								: []),
						],
					},
				]}
			/>

			<Step
				n={2}
				title="Biaya"
				description="Biaya karena ada event, lalu biaya bulanan yang tetap jalan."
				total={-totalBiaya}
				groups={biayaGroups}
			/>

			<ResultRow
				label={rugi ? `Rugi bersih ${scope}` : `Untung bersih ${scope}`}
				sub={
					pendapatan > 0
						? `Uang dari event − semua biaya · ${pNet.toFixed(1).replace(".", ",")}% dari pendapatan`
						: "Uang dari event − semua biaya"
				}
				value={pnl.net}
				tone={rugi ? "loss" : "profit"}
			/>

			{n > 0 && (
				<Step
					n={3}
					title="Untung per event"
					description="Sebelum biaya bulanan. Klik untuk buka rekapnya."
					groups={[
						{
							title: null,
							lines: pnl.events.map((e) => ({
								label: e.name,
								note: `${pctText(pct(e.profit, e.revenue))} dari ${rp(e.revenue)}`,
								value: e.profit,
								href: `/operations/${e.projectId}/rekap`,
							})),
						},
					]}
				/>
			)}

			<Step
				n={n > 0 ? 4 : 3}
				title="Uang masuk & keluar rekening"
				description="Gerak saldo apa adanya — bedanya dengan untung dijelaskan di bawah."
			>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					<Mini label="Saldo awal" value={cash.opening} />
					<Mini label="Uang masuk" value={cash.inflow} tone="in" />
					<Mini label="Uang keluar" value={cash.outflow} tone="out" />
					<Mini label="Saldo akhir" value={cash.closing} />
				</div>
				<SubGroup
					group={{
						title: "Uang masuk dari klien",
						hint: "dipilah menurut bulan eventnya",
						lines: [
							{ label: `Event ${scope}`, value: pnl.clientCash.sameMonth },
							{
								label: multi
									? "DP/pelunasan event sesudah periode ini"
									: "DP/pelunasan event bulan depan dst.",
								value: pnl.clientCash.futureEvents,
								note: "titipan, belum untung",
							},
							{
								label: multi
									? "Pelunasan event sebelum periode ini"
									: "Pelunasan event bulan lalu",
								value: pnl.clientCash.pastEvents,
							},
						],
					}}
				/>
				<SubGroup
					group={{
						title: "Uang keluar untuk",
						lines: [
							{
								label: "Biaya (bahan, crew, operasional)",
								value: cash.outflowForExpense,
							},
							{
								label: "Beli stok, bayar utang, bagi hasil owner",
								value: cash.outflowNonExpense,
								note: "bukan biaya",
							},
						],
					}}
				/>
				<div className="space-y-1.5 rounded-xl bg-sky-50 px-3 py-2.5 text-[12.5px] leading-snug text-sky-950">
					<p className="font-semibold">Kenapa untung ≠ uang bertambah?</p>
					{pnl.clientCash.futureEvents > 0 && (
						<p>
							<span className="tabular">{rp(pnl.clientCash.futureEvents)}</span>{" "}
							yang masuk adalah DP/pelunasan event yang belum berlangsung.
							Uangnya sudah di rekening, tapi baru jadi untung di bulan eventnya
							— karena biaya event itu juga baru keluar nanti. Anggap uang
							titipan klien.
						</p>
					)}
					{cash.outflowNonExpense > 0 && (
						<p>
							<span className="tabular">{rp(cash.outflowNonExpense)}</span>{" "}
							keluar untuk beli stok, bayar utang, atau bagi hasil. Saldo turun,
							tapi itu bukan biaya — stok baru jadi biaya saat dipakai di event.
						</p>
					)}
					<p>
						Sebaliknya, bahan dari stok lama tetap jadi biaya walau {scope}{" "}
						tidak ada uang keluar untuk membelinya.
					</p>
				</div>
			</Step>
		</RekapCard>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-snug text-amber-900">
			<Info className="mt-0.5 size-4 shrink-0" aria-hidden />
			<span>{children}</span>
		</p>
	);
}

function Mini({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone?: "in" | "out";
}) {
	return (
		<div className="rounded-xl bg-secondary/50 px-3 py-2.5">
			<p className="text-[12px] text-muted-foreground">{label}</p>
			<p
				data-nominal
				className={cn(
					"tabular mt-0.5 text-[15px] font-semibold",
					tone === "in" && "text-emerald-700",
					tone === "out" && "text-rose-600",
					!tone && "text-foreground",
				)}
			>
				{tone === "in"
					? `+${rp(value)}`
					: tone === "out"
						? `−${rp(value)}`
						: formatSignedRupiah(value)}
			</p>
		</div>
	);
}

function Insight({
	icon,
	children,
}: {
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<p className="flex gap-2 text-[12.5px] leading-snug text-foreground/85">
			<span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
			<span>{children}</span>
		</p>
	);
}
