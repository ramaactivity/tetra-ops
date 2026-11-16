import { Activity } from "lucide-react";
import Link from "next/link";
import { formatRupiah, formatSignedRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Sehat nggak event ini?" — rasio biaya vs uang masuk, dibahasakan untuk
 * orang yang tidak paham keuangan.
 *
 * Patokan (per event, BELUM termasuk biaya tetap bulanan seperti kost, cicilan
 * alat, penyusutan — itu justru dibayar dari untung event):
 *   - Bahan (HPP)          : bisnis photobooth umumnya 15–30% dari harga.
 *   - Crew & operasional   : jasa umumnya 35–55%; photobooth yang sehat ≤35%.
 *   - Untung bersih event  : photobooth rata-rata 30–45% (jasa umum 15–25%).
 * Sumber: snappic.com, photoboothint.com, bennettfinancials.com (Sep 2026).
 */

export type Status = "baik" | "cek" | "buruk";

export const STATUS: Record<
	Status,
	{ label: string; chip: string; bar: string }
> = {
	baik: {
		label: "Sehat",
		chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
		bar: "bg-emerald-500",
	},
	cek: {
		label: "Perlu dicek",
		chip: "bg-amber-50 text-amber-900 border-amber-200",
		bar: "bg-amber-500",
	},
	buruk: {
		label: "Kurang sehat",
		chip: "bg-rose-50 text-rose-800 border-rose-200",
		bar: "bg-rose-500",
	},
};

/** Makin kecil makin bagus (biaya). */
export function costStatus(pct: number, good: number, warn: number): Status {
	return pct <= good ? "baik" : pct <= warn ? "cek" : "buruk";
}

const pctText = (n: number) => `${Math.round(n)}%`;

export function EventHealth({
	uangMasuk,
	bahan,
	operasional,
	lain,
	untung,
	href,
	className,
}: {
	uangMasuk: number;
	/** HPP — bahan habis pakai. */
	bahan: number;
	/** OpEx — crew, perjalanan, komisi. */
	operasional: number;
	/** Pengeluaran lain (kartu rekap + dibayar owner belum dicatat). */
	lain: number;
	untung: number;
	/** Di luar halaman rekap: tautan ke rincian lengkapnya. */
	href?: string;
	className?: string;
}) {
	if (uangMasuk <= 0) return null;

	const pBahan = (bahan / uangMasuk) * 100;
	const pOps = ((operasional + lain) / uangMasuk) * 100;
	const pUntung = (untung / uangMasuk) * 100;

	// Angka = rupiah asli acara ini + porsinya dari total yang dibayar klien.
	// (Dulu "per Rp100.000" — terbaca seolah biaya bahannya cuma Rp8.100.)
	const rows: Array<{
		key: string;
		label: string;
		title: string;
		amount: number;
		pct: number;
		ideal: string;
		status: Status;
		tip: string;
		cls: string;
	}> = [
		{
			key: "bahan",
			label: "Bahan",
			title: "Biaya bahan",
			amount: bahan,
			pct: pBahan,
			ideal: "Ideal di bawah 25%",
			status: costStatus(pBahan, 25, 35),
			tip: "Cetakan banyak untuk harga paket ini. Cek apakah paket unlimited terlalu murah, atau ada cetak ulang/gagal cetak.",
			cls: "bg-amber-400",
		},
		{
			key: "ops",
			label: "Crew & jalan",
			title: "Biaya crew & jalan",
			amount: operasional + lain,
			pct: pOps,
			ideal: "Ideal di bawah 35%",
			status: costStatus(pOps, 35, 45),
			tip: "Biaya orang & perjalanan makan porsi besar. Biasanya karena lokasi jauh, crew kebanyakan, atau komisi besar — pertimbangkan biaya transport/jarak di harga.",
			cls: "bg-sky-400",
		},
		{
			key: "untung",
			label: "Untung",
			title: "Untung bersih",
			amount: untung,
			pct: pUntung,
			ideal: "Ideal 35% ke atas",
			status: pUntung >= 35 ? "baik" : pUntung >= 20 ? "cek" : "buruk",
			tip: "Dari untung ini masih harus bayar biaya bulanan (kost, cicilan alat, perawatan), jadi di bawah 20% gampang jadi rugi.",
			cls: "bg-emerald-500",
		},
	];

	const worst: Status = rows.some((r) => r.status === "buruk")
		? "buruk"
		: rows.some((r) => r.status === "cek")
			? "cek"
			: "baik";
	const worstRow = rows.find((r) => r.status === worst);
	const verdict =
		worst === "baik"
			? "Biaya wajar dan untungnya bagus — harga ini layak dipertahankan."
			: `Perlu diperhatikan: ${worstRow?.title.toLowerCase()} (${pctText(worstRow?.pct ?? 0)}). ${worstRow?.tip}`;

	// Porsi batang tidak boleh negatif (rugi = untung 0).
	const segTotal = rows.reduce((s, r) => s + Math.max(0, r.pct), 0) || 1;

	return (
		<section
			className={cn(
				"space-y-3 rounded-2xl border border-border-subtle bg-secondary/40 p-4",
				className,
			)}
		>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground">
						<Activity className="size-4" aria-hidden />
					</span>
					<div className="min-w-0">
						<h4 className="text-[14px] font-semibold text-foreground">
							Sehat nggak event ini?
						</h4>
						<p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
							{verdict}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					{href ? (
						<Link
							href={href}
							className="text-[12.5px] font-medium text-sky-700 hover:underline"
						>
							Rincian di Rekap →
						</Link>
					) : null}
					<StatusChip status={worst} />
				</div>
			</div>

			{/* Uang dari klien untuk acara ini dipakai untuk apa */}
			<div className="space-y-2">
				<p className="text-[12px] text-muted-foreground">
					Dari{" "}
					<span className="tabular font-medium text-foreground" data-nominal>
						{formatRupiah(uangMasuk)}
					</span>{" "}
					yang dibayar klien:
				</p>
				<div className="flex h-2.5 overflow-hidden rounded-full bg-card">
					{rows.map((r) => (
						<div
							key={r.key}
							className={r.cls}
							style={{ width: `${(Math.max(0, r.pct) / segTotal) * 100}%` }}
						/>
					))}
				</div>
				<ul className="grid gap-x-4 gap-y-2 text-[12.5px] md:grid-cols-3">
					{rows.map((r) => (
						<li
							key={r.key}
							className="grid grid-cols-[0.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5"
						>
							<span
								className={cn("mt-[6px] size-2 rounded-full", r.cls)}
								aria-hidden
							/>
							<span className="flex flex-wrap items-center gap-x-1.5">
								<span className="text-foreground">{r.label}</span>
								<b
									className="tabular font-semibold text-foreground"
									data-nominal
								>
									{formatSignedRupiah(r.amount)}
								</b>
								<span className="tabular text-muted-foreground">
									({pctText(r.pct)})
								</span>
								{r.status !== "baik" ? <StatusChip status={r.status} /> : null}
							</span>
							<span className="col-start-2 text-[12px] text-muted-foreground">
								{r.ideal}
							</span>
						</li>
					))}
				</ul>
			</div>

			<p className="text-[11.5px] leading-snug text-muted-foreground">
				Patokan rata-rata usaha photobooth, per acara — belum termasuk biaya
				bulanan seperti kost &amp; cicilan alat.
			</p>
		</section>
	);
}

export function StatusChip({ status }: { status: Status }) {
	return (
		<span
			className={cn(
				"shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
				STATUS[status].chip,
			)}
		>
			{STATUS[status].label}
		</span>
	);
}
