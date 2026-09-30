import { Activity, Calculator, Info, Scale, Wallet } from "lucide-react";
import type * as React from "react";
import {
	type MoneyGroup,
	ResultRow,
	Step,
	SubGroup,
	SummaryTile,
} from "@/components/finance/money-ui";
import {
	costStatus,
	STATUS,
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
	switcher,
	freeCash,
}: {
	pnl: MonthlyPnl;
	cash: MonthlyCash;
	monthLabel: string;
	/** MonthSwitcher (client) — diteruskan dari page. */
	switcher: React.ReactNode;
	/** Uang "bebas dipakai" SAAT INI — untuk daya tahan kas. */
	freeCash: number;
}) {
	const pendapatan = pnl.revenue + pnl.otherIncome;
	const crewJalan = pnl.opex + pnl.eventExtra;
	const biayaEvent = pnl.hpp + crewJalan;
	const totalBiaya = biayaEvent + pnl.overhead;
	const rugi = pnl.net < 0;
	const n = pnl.events.length;
	const avgEventProfit = n > 0 ? pnl.eventProfit / n : 0;
	const impas =
		avgEventProfit > 0 ? Math.ceil(pnl.overhead / avgEventProfit) : null;
	const bulanTahan = pnl.overhead > 0 ? freeCash / pnl.overhead : null;

	const pBahan = pct(pnl.hpp, pendapatan);
	const pCrew = pct(crewJalan, pendapatan);
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
						title: "Crew, jalan & komisi",
						pct: pCrew,
						target: "Idealnya di bawah 35%",
						status: costStatus(pCrew, 35, 45),
						note: "Fee crew, transport, bensin, tol, makan, komisi.",
					},
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
						note: "Sisa setelah SEMUA biaya bulan ini.",
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
				{ label: "Crew & komisi", value: pnl.opex },
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
					description="Untung-rugi dihitung dari event yang berlangsung bulan ini — bukan dari uang yang kebetulan masuk."
				/>
				{switcher}
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<SummaryTile
					label="Pendapatan"
					hint={`dari ${n} event${pnl.otherIncome ? " + pemasukan lain" : ""}`}
					value={pendapatan}
					icon="in"
					tone="in"
				/>
				<SummaryTile
					label="Total biaya"
					hint="biaya event + biaya bulanan"
					value={totalBiaya}
					icon="out"
					tone="out"
				/>
				<SummaryTile
					label={rugi ? "Rugi bersih" : "Untung bersih"}
					hint={
						pendapatan > 0
							? `${pNet.toFixed(1).replace(".", ",")}% dari pendapatan`
							: "belum ada event selesai"
					}
					value={pnl.net}
					tone={rugi ? "loss" : "profit"}
				/>
			</div>

			{pnl.pending.length > 0 && (
				<Note>
					{pnl.pending.length} event bulan ini belum di-settle (
					<span className="tabular">
						{rp(pnl.pending.reduce((s, p) => s + p.grandTotal, 0))}
					</span>
					) — untungnya baru masuk hitungan setelah settle, jadi angka di atas
					masih akan berubah.
				</Note>
			)}

			{/* Sehat nggak bulan ini? */}
			{ratios.length > 0 && (
				<section className="space-y-3 rounded-2xl border border-border-subtle bg-secondary/40 p-4">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div className="flex min-w-0 items-start gap-2.5">
							<span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground">
								<Activity className="size-4" aria-hidden />
							</span>
							<div className="min-w-0">
								<h4 className="text-[14px] font-semibold text-foreground">
									Sehat nggak bulan ini?
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

					<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{ratios.map((r) => (
							<li
								key={r.title}
								className="space-y-1.5 rounded-xl border border-border-default bg-card p-3"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="text-[13px] font-medium text-foreground">
										{r.title}
									</span>
									<StatusChip status={r.status} />
								</div>
								<p className="tabular text-[22px] font-bold leading-none tracking-[-0.01em] text-foreground">
									{pctText(r.pct)}
								</p>
								<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
									<div
										className={cn("h-full rounded-full", STATUS[r.status].bar)}
										style={{
											width: `${Math.min(100, Math.max(0, r.pct))}%`,
										}}
									/>
								</div>
								<p className="text-[11.5px] font-medium text-muted-foreground">
									{r.target}
								</p>
								<p className="text-[12px] leading-snug text-muted-foreground">
									{r.note}
								</p>
							</li>
						))}
					</ul>

					<div className="grid gap-3 md:grid-cols-2">
						{impas !== null && (
							<Insight icon={<Scale className="size-4" aria-hidden />}>
								Satu event rata-rata untung{" "}
								<b className="tabular">{rp(avgEventProfit)}</b>, biaya bulanan{" "}
								<b className="tabular">{rp(pnl.overhead)}</b>. Butuh{" "}
								<b>{impas} event</b> sebulan supaya biaya bulanan tertutup —{" "}
								{n >= impas
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
				description="Harga paket + add-on − diskon, dari event bulan ini yang sudah selesai."
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
				label={rugi ? "Rugi bersih bulan ini" : "Untung bersih bulan ini"}
				sub="Uang dari event − semua biaya"
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
							{ label: "Event bulan ini", value: pnl.clientCash.sameMonth },
							{
								label: "DP/pelunasan event bulan depan dst.",
								value: pnl.clientCash.futureEvents,
								note: "titipan, belum untung",
							},
							{
								label: "Pelunasan event bulan lalu",
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
						Sebaliknya, bahan dari stok lama tetap jadi biaya walau bulan ini
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
		<p className="flex gap-2 rounded-xl bg-card px-3 py-2.5 text-[12.5px] leading-snug text-foreground/85">
			<span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
			<span>{children}</span>
		</p>
	);
}
