import { Activity } from "lucide-react";
import { formatRupiah } from "@/lib/format";
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

type Status = "baik" | "cek" | "buruk";

const STATUS: Record<Status, { label: string; chip: string; bar: string }> = {
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
function costStatus(pct: number, good: number, warn: number): Status {
	return pct <= good ? "baik" : pct <= warn ? "cek" : "buruk";
}

const pctText = (n: number) => `${Math.round(n)}%`;

export function EventHealth({
	uangMasuk,
	bahan,
	operasional,
	lain,
	untung,
}: {
	uangMasuk: number;
	/** HPP — bahan habis pakai. */
	bahan: number;
	/** OpEx — crew, perjalanan, komisi. */
	operasional: number;
	/** Pengeluaran lain (kartu rekap + dibayar owner belum dicatat). */
	lain: number;
	untung: number;
}) {
	if (uangMasuk <= 0) return null;

	const pBahan = (bahan / uangMasuk) * 100;
	const pOps = ((operasional + lain) / uangMasuk) * 100;
	const pUntung = (untung / uangMasuk) * 100;

	const rows: Array<{
		key: string;
		title: string;
		what: string;
		pct: number;
		target: string;
		status: Status;
		tip: string;
	}> = [
		{
			key: "bahan",
			title: "Biaya bahan",
			what: "Kertas, tinta, sleeve, flashdisk & souvenir yang habis dipakai.",
			pct: pBahan,
			target: "Idealnya di bawah 25%",
			status: costStatus(pBahan, 25, 35),
			tip: "Cetakan banyak untuk harga paket ini. Cek apakah paket unlimited terlalu murah, atau ada cetak ulang/gagal cetak.",
		},
		{
			key: "ops",
			title: "Biaya crew & jalan",
			what: "Fee crew, transport, bensin, tol, parkir, makan, komisi & pengeluaran lain.",
			pct: pOps,
			target: "Idealnya di bawah 35%",
			status: costStatus(pOps, 35, 45),
			tip: "Biaya orang & perjalanan makan porsi besar. Biasanya karena lokasi jauh, crew kebanyakan, atau komisi besar — pertimbangkan biaya transport/jarak di harga.",
		},
		{
			key: "untung",
			title: "Untung bersih",
			what: "Sisa setelah semua biaya event dibayar.",
			pct: pUntung,
			target: "Idealnya 35% atau lebih",
			status: pUntung >= 35 ? "baik" : pUntung >= 20 ? "cek" : "buruk",
			tip: "Untung event ini tipis. Ingat, dari untung ini masih harus bayar biaya bulanan (kost, cicilan alat, perawatan) — jadi di bawah 20% gampang jadi rugi.",
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
			? "Semua biaya masih wajar dan untungnya bagus. Event seperti ini layak diulang dengan harga yang sama."
			: `Yang paling perlu diperhatikan: ${worstRow?.title.toLowerCase()} (${pctText(worstRow?.pct ?? 0)}).`;

	// Batang "tiap Rp100.000": porsi tidak boleh negatif (rugi = untung 0).
	const seg = [
		{ label: "Bahan", pct: Math.max(0, pBahan), cls: "bg-amber-400" },
		{ label: "Crew & jalan", pct: Math.max(0, pOps), cls: "bg-sky-400" },
		{ label: "Untung", pct: Math.max(0, pUntung), cls: "bg-emerald-500" },
	];
	const segTotal = seg.reduce((s, x) => s + x.pct, 0) || 1;

	return (
		<section className="space-y-3 rounded-2xl border border-border-subtle bg-secondary/40 p-4">
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
				<StatusChip status={worst} />
			</div>

			{/* Tiap Rp100.000 dari klien dipakai untuk apa */}
			<div className="space-y-1.5">
				<p className="text-[12px] font-medium text-muted-foreground">
					Dari tiap <span className="tabular">Rp100.000</span> yang dibayar
					klien:
				</p>
				<div className="flex h-3 overflow-hidden rounded-full bg-card">
					{seg.map((s) => (
						<div
							key={s.label}
							className={s.cls}
							style={{ width: `${(s.pct / segTotal) * 100}%` }}
						/>
					))}
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
					{seg.map((s) => (
						<span key={s.label} className="flex items-center gap-1.5">
							<span className={cn("size-2 rounded-full", s.cls)} />
							{s.label}{" "}
							<b className="tabular font-semibold text-foreground">
								{formatRupiah(Math.round(s.pct * 1000))}
							</b>
						</span>
					))}
				</div>
			</div>

			<ul className="grid gap-3 md:grid-cols-3">
				{rows.map((r) => (
					<li
						key={r.key}
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
								style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }}
							/>
						</div>
						<p className="text-[11.5px] font-medium text-muted-foreground">
							{r.target}
						</p>
						<p className="text-[12px] leading-snug text-muted-foreground">
							{r.status === "baik" ? r.what : r.tip}
						</p>
					</li>
				))}
			</ul>

			<p className="text-[11px] leading-snug text-muted-foreground">
				Patokan dari rata-rata usaha photobooth & jasa event. Angka ini per
				event — biaya bulanan (kost, cicilan alat) belum masuk, jadi untung
				event memang perlu cukup besar untuk menutupnya.
			</p>
		</section>
	);
}

function StatusChip({ status }: { status: Status }) {
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
