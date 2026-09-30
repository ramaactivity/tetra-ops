import { ArrowDownLeft, ArrowUpRight, Info, Scale, Wallet } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import {
	costStatus,
	STATUS,
	type Status,
	StatusChip,
} from "@/components/rekap/event-health";
import type { MonthlyPnl } from "@/lib/finance/monthly-pnl";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Laporan satu bulan untuk orang awam. Dua cerita yang sengaja dipisah:
 *   1. UNTUNG-RUGI — pendapatan & biaya dipasangkan per event (event bulan ini),
 *      ditambah biaya bulanan yang tidak terkait event.
 *   2. UANG MASUK & KELUAR — gerak saldo rekening apa adanya (DP event bulan
 *      depan ikut masuk di sini, tapi belum jadi untung).
 * Patokan rasio: lihat event-health.tsx (photobooth & jasa event).
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
const signed = (n: number) =>
	`${n < 0 ? "−" : ""}${formatRupiah(Math.abs(Math.round(n)))}`;

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
	const totalBiaya = pnl.hpp + crewJalan + pnl.overhead;
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
		value: string;
		bar: number;
		target: string;
		status: Status;
		note: string;
	}> =
		pendapatan > 0
			? [
					{
						title: "Biaya bahan",
						value: pctText(pBahan),
						bar: pBahan,
						target: "Idealnya di bawah 25% dari pendapatan",
						status: costStatus(pBahan, 25, 35),
						note: "Kertas, tinta, sleeve, flashdisk & souvenir yang habis dipakai.",
					},
					{
						title: "Biaya crew, jalan & komisi",
						value: pctText(pCrew),
						bar: pCrew,
						target: "Idealnya di bawah 35%",
						status: costStatus(pCrew, 35, 45),
						note: "Fee crew, transport, bensin, tol, makan & komisi per event.",
					},
					{
						title: "Biaya bulanan",
						value: pctText(pOver),
						bar: pOver,
						target: "Idealnya di bawah 20%",
						status: costStatus(pOver, 20, 30),
						note: "Biaya yang tetap keluar walau tidak ada event: kost, internet, platform, promosi, barang hilang.",
					},
					{
						title: "Untung bersih",
						value: pctText(pNet),
						bar: Math.max(0, pNet),
						target: "Idealnya 20% atau lebih",
						status: pNet >= 20 ? "baik" : pNet >= 10 ? "cek" : "buruk",
						note: "Sisa uang setelah SEMUA biaya bulan ini dibayar.",
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

	return (
		<section className="border-border-subtle bg-card space-y-4 overflow-hidden rounded-[16px] border p-4 shadow-[var(--shadow-level-2)] sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-[15px] font-semibold text-foreground">
						Laporan bulan {monthLabel}
					</h2>
					<p className="mt-0.5 text-[12.5px] text-muted-foreground">
						Untung-rugi dihitung per event yang berlangsung bulan ini — bukan
						dari uang yang kebetulan masuk.
					</p>
				</div>
				{switcher}
			</div>

			{/* Tiga angka inti */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<Tile
					label="Pendapatan"
					hint={`${n} event selesai${pnl.otherIncome ? " + pemasukan lain" : ""}`}
					value={pendapatan}
					icon={ArrowDownLeft}
				/>
				<Tile
					label="Total biaya"
					hint="event + biaya bulanan"
					value={totalBiaya}
					icon={ArrowUpRight}
				/>
				<div
					className={cn(
						"col-span-2 rounded-2xl px-4 py-3.5 sm:col-span-1",
						rugi ? "bg-rose-600 text-white" : "bg-[#059669] text-white",
					)}
				>
					<p className="text-[12.5px] font-medium text-white/80">
						{rugi ? "Rugi bersih" : "Untung bersih"}
					</p>
					<p className="tabular mt-1 text-[22px] font-bold leading-none">
						{signed(pnl.net)}
					</p>
					<p className="mt-1.5 text-[12px] text-white/80">
						{pendapatan > 0
							? `${pctText(pNet)} dari pendapatan`
							: "belum ada event selesai"}
					</p>
				</div>
			</div>

			{pnl.pending.length > 0 && (
				<p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
					<Info className="mt-0.5 size-4 shrink-0" aria-hidden />
					<span>
						{pnl.pending.length} event bulan ini belum di-settle (
						<span className="tabular">
							{formatRupiah(pnl.pending.reduce((s, p) => s + p.grandTotal, 0))}
						</span>
						) — untungnya baru dihitung setelah settle, jadi angka di atas masih
						bisa naik.
					</span>
				</p>
			)}

			<div className="grid gap-3 lg:grid-cols-2">
				{/* Hitungan untung */}
				<div className="space-y-2 rounded-2xl border border-border-subtle bg-secondary/40 p-4">
					<h3 className="text-[14px] font-semibold text-foreground">
						Hitungannya
					</h3>
					<Row
						label={`Uang dari ${n} event bulan ini`}
						sub="Harga paket + add-on − diskon, dari event yang sudah selesai"
						value={pnl.revenue}
					/>
					<Row
						label="Bahan cetak & souvenir"
						sub="Kertas, tinta, sleeve, flashdisk yang terpakai"
						value={-pnl.hpp}
					/>
					<Row
						label="Crew, jalan & komisi"
						sub="Fee crew, transport, bensin, tol, makan, komisi vendor/sales"
						value={-crewJalan}
					/>
					<Total
						label="Untung dari event"
						sub={
							n > 0
								? `Rata-rata ${formatRupiah(Math.round(avgEventProfit))} per event`
								: undefined
						}
						value={pnl.eventProfit}
					/>
					<Row
						label="Biaya bulanan (tidak terkait event)"
						sub="Tetap keluar walau tidak ada event"
						value={-pnl.overhead}
					/>
					{pnl.overheadGroups.length > 0 && (
						<ul className="space-y-1 border-l-2 border-border-default pl-3">
							{pnl.overheadGroups.map((g) => (
								<li
									key={g.key}
									className="flex justify-between gap-3 text-[12.5px] text-muted-foreground"
								>
									<span>{g.label}</span>
									<span className="tabular">{signed(-g.amount)}</span>
								</li>
							))}
						</ul>
					)}
					{pnl.otherIncome !== 0 && (
						<Row
							label="Pemasukan lain"
							sub="Tidak terkait event tertentu"
							value={pnl.otherIncome}
						/>
					)}
					<Total
						label={rugi ? "Rugi bersih bulan ini" : "Untung bersih bulan ini"}
						value={pnl.net}
						strong
					/>
				</div>

				{/* Sehat nggak */}
				<div className="space-y-3 rounded-2xl border border-border-subtle bg-secondary/40 p-4">
					<div className="flex items-start justify-between gap-2">
						<h3 className="text-[14px] font-semibold text-foreground">
							Sehat nggak bulan ini?
						</h3>
						{worst && <StatusChip status={worst} />}
					</div>
					{ratios.length === 0 ? (
						<p className="text-[12.5px] text-muted-foreground">
							Belum ada event yang selesai di-settle bulan ini.
						</p>
					) : (
						<ul className="space-y-3">
							{ratios.map((r) => (
								<li key={r.title} className="space-y-1">
									<div className="flex items-center justify-between gap-2">
										<span className="text-[13px] font-medium text-foreground">
											{r.title}
										</span>
										<span className="flex items-center gap-2">
											<span className="tabular text-[14px] font-bold text-foreground">
												{r.value}
											</span>
											<StatusChip status={r.status} />
										</span>
									</div>
									<div className="h-1.5 overflow-hidden rounded-full bg-card">
										<div
											className={cn(
												"h-full rounded-full",
												STATUS[r.status].bar,
											)}
											style={{ width: `${Math.min(100, r.bar)}%` }}
										/>
									</div>
									<p className="text-[11.5px] leading-snug text-muted-foreground">
										{r.target} · {r.note}
									</p>
								</li>
							))}
						</ul>
					)}

					{impas !== null && (
						<Insight icon={Scale}>
							Satu event rata-rata untung{" "}
							<b className="tabular">
								{formatRupiah(Math.round(avgEventProfit))}
							</b>
							, biaya bulanan{" "}
							<b className="tabular">
								{formatRupiah(Math.round(pnl.overhead))}
							</b>
							. Jadi butuh <b>{impas} event</b> sebulan cuma untuk balik modal
							biaya bulanan —{" "}
							{n >= impas
								? `bulan ini ada ${n}, sudah lewat titik impas.`
								: `bulan ini baru ${n}, kurang ${impas - n} event.`}
						</Insight>
					)}
					{bulanTahan !== null && (
						<Insight icon={Wallet}>
							Uang bebas dipakai sekarang{" "}
							<b className="tabular">{formatRupiah(Math.round(freeCash))}</b>{" "}
							cukup menutup biaya bulanan seperti ini selama{" "}
							<b>{bulanTahan.toFixed(1).replace(".", ",")} bulan</b>
							{bulanTahan >= 3
								? " — aman (idealnya minimal 3 bulan)."
								: " — idealnya minimal 3 bulan, jadi masih tipis."}
						</Insight>
					)}
				</div>
			</div>

			{/* Uang masuk & keluar */}
			<div className="space-y-3 rounded-2xl border border-border-subtle p-4">
				<div>
					<h3 className="text-[14px] font-semibold text-foreground">
						Uang masuk & keluar rekening
					</h3>
					<p className="mt-0.5 text-[12.5px] text-muted-foreground">
						Gerak saldo apa adanya. Bedanya dengan untung dijelaskan di bawah.
					</p>
				</div>
				<div className="grid gap-3 sm:grid-cols-4">
					<Mini label="Saldo awal bulan" value={cash.opening} />
					<Mini label="Uang masuk" value={cash.inflow} tone="in" />
					<Mini label="Uang keluar" value={-cash.outflow} tone="out" />
					<Mini label="Saldo akhir bulan" value={cash.closing} />
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					<Breakdown
						title="Uang masuk dari klien"
						rows={[
							["Event bulan ini", pnl.clientCash.sameMonth],
							[
								"DP/pelunasan event bulan depan dst.",
								pnl.clientCash.futureEvents,
							],
							["Pelunasan event bulan lalu", pnl.clientCash.pastEvents],
						]}
					/>
					<Breakdown
						title="Uang keluar untuk"
						rows={[
							["Biaya (bahan, crew, operasional)", cash.outflowForExpense],
							[
								"Beli stok, bayar utang, bagi hasil owner",
								cash.outflowNonExpense,
							],
						]}
					/>
				</div>
				<ul className="space-y-1.5 rounded-xl bg-sky-50 px-3 py-2.5 text-[12.5px] leading-snug text-sky-950">
					<li className="font-medium">Kenapa untung ≠ uang bertambah?</li>
					{pnl.clientCash.futureEvents > 0 && (
						<li>
							•{" "}
							<span className="tabular">
								{formatRupiah(pnl.clientCash.futureEvents)}
							</span>{" "}
							yang masuk adalah DP/pelunasan event yang BELUM berlangsung.
							Uangnya sudah di rekening, tapi baru jadi untung di bulan eventnya
							— karena biaya event itu (bahan, crew) juga baru keluar nanti.
							Anggap uang titipan klien.
						</li>
					)}
					{pnl.clientCash.pastEvents > 0 && (
						<li>
							•{" "}
							<span className="tabular">
								{formatRupiah(pnl.clientCash.pastEvents)}
							</span>{" "}
							pelunasan event bulan lalu — untungnya sudah dihitung di bulan
							event itu.
						</li>
					)}
					{cash.outflowNonExpense > 0 && (
						<li>
							•{" "}
							<span className="tabular">
								{formatRupiah(cash.outflowNonExpense)}
							</span>{" "}
							keluar untuk beli stok, bayar utang, atau bagi hasil — uangnya
							berkurang, tapi itu bukan biaya (stok baru jadi biaya saat dipakai
							di event).
						</li>
					)}
					<li>
						• Sebaliknya, bahan yang dipakai dari stok lama adalah biaya walau
						bulan ini tidak ada uang keluar untuk itu.
					</li>
				</ul>
			</div>

			{/* Per event */}
			{n > 0 && (
				<details className="group rounded-2xl border border-border-subtle">
					<summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-foreground">
						Untung per event ({n}){" "}
						<span className="text-muted-foreground">▾</span>
					</summary>
					<ul className="divide-y divide-border-subtle border-t border-border-subtle">
						{pnl.events.map((e) => (
							<li key={e.projectId}>
								<Link
									href={`/operations/${e.projectId}/rekap`}
									className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-secondary/60"
								>
									<span className="min-w-0">
										<span className="block truncate font-medium text-foreground">
											{e.name}
										</span>
										<span className="text-[11.5px] text-muted-foreground">
											{formatDateID(e.date)} · masuk{" "}
											<span className="tabular">{formatRupiah(e.revenue)}</span>
										</span>
									</span>
									<span className="shrink-0 text-right">
										<span
											className={cn(
												"tabular block font-semibold",
												e.profit < 0 ? "text-rose-600" : "text-emerald-700",
											)}
										>
											{signed(e.profit)}
										</span>
										<span className="tabular text-[11.5px] text-muted-foreground">
											{pctText(pct(e.profit, e.revenue))}
										</span>
									</span>
								</Link>
							</li>
						))}
					</ul>
				</details>
			)}
		</section>
	);
}

function Tile({
	label,
	hint,
	value,
	icon: Icon,
}: {
	label: string;
	hint: string;
	value: number;
	icon: typeof ArrowDownLeft;
}) {
	return (
		<div className="min-w-0 rounded-2xl border border-border-subtle px-4 py-3.5">
			<p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
				<Icon className="size-3.5" aria-hidden />
				{label}
			</p>
			<p className="tabular mt-1 text-[22px] font-bold leading-none text-foreground">
				{formatRupiah(Math.round(value))}
			</p>
			<p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>
		</div>
	);
}

function Row({
	label,
	sub,
	value,
}: {
	label: string;
	sub?: string;
	value: number;
}) {
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0">
				<p className="text-[13px] text-foreground">{label}</p>
				{sub && (
					<p className="text-[11.5px] leading-snug text-muted-foreground">
						{sub}
					</p>
				)}
			</div>
			<span
				className={cn(
					"tabular shrink-0 text-[13px] font-medium",
					value < 0 ? "text-rose-600" : "text-foreground",
				)}
			>
				{value < 0 ? signed(value) : `+${formatRupiah(Math.round(value))}`}
			</span>
		</div>
	);
}

function Total({
	label,
	sub,
	value,
	strong,
}: {
	label: string;
	sub?: string;
	value: number;
	strong?: boolean;
}) {
	return (
		<div className="flex items-start justify-between gap-3 border-t border-border-default pt-2">
			<div>
				<p
					className={cn(
						"font-semibold text-foreground",
						strong ? "text-[14px]" : "text-[13px]",
					)}
				>
					= {label}
				</p>
				{sub && <p className="text-[11.5px] text-muted-foreground">{sub}</p>}
			</div>
			<span
				className={cn(
					"tabular shrink-0 font-bold",
					strong ? "text-[16px]" : "text-[13.5px]",
					value < 0 ? "text-rose-600" : "text-emerald-700",
				)}
			>
				{signed(value)}
			</span>
		</div>
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
				className={cn(
					"tabular mt-0.5 text-[15px] font-semibold",
					tone === "in" && "text-emerald-700",
					tone === "out" && "text-rose-600",
					!tone && "text-foreground",
				)}
			>
				{tone === "in" ? "+" : ""}
				{signed(value)}
			</p>
		</div>
	);
}

function Breakdown({
	title,
	rows,
}: {
	title: string;
	rows: Array<[string, number]>;
}) {
	return (
		<div className="space-y-1">
			<p className="text-[12px] font-medium text-muted-foreground">{title}</p>
			{rows.map(([label, v]) => (
				<div
					key={label}
					className="flex justify-between gap-3 text-[12.5px] text-foreground"
				>
					<span>{label}</span>
					<span className="tabular">{formatRupiah(Math.round(v))}</span>
				</div>
			))}
		</div>
	);
}

function Insight({
	icon: Icon,
	children,
}: {
	icon: typeof Scale;
	children: React.ReactNode;
}) {
	return (
		<p className="flex gap-2 rounded-xl bg-card px-3 py-2.5 text-[12.5px] leading-snug text-foreground/85">
			<Icon
				className="mt-0.5 size-4 shrink-0 text-muted-foreground"
				aria-hidden
			/>
			<span>{children}</span>
		</p>
	);
}
