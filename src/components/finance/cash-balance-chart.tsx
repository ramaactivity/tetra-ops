"use client";

import { useMemo, useState } from "react";
import type { CashBookRow } from "@/lib/finance/cash-book";
import { formatRupiah, formatRupiahCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

type Day = { date: string; saldo: number; masuk: number; keluar: number };

function addDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string, withWeekday = false): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
		...(withWeekday ? { weekday: "short" as const } : {}),
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}

/** Angka bulat "enak dibaca" untuk garis bantu sumbu Y. */
function niceStep(span: number): number {
	const raw = span / 3;
	const mag = 10 ** Math.floor(Math.log10(raw || 1));
	const n = raw / mag;
	return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Grafik saldo harian (garis tangga: saldo berubah di hari ada transaksi,
 * datar di hari tanpa transaksi). Satu seri → tanpa legenda; judul kartu
 * yang menamai. Tooltip + crosshair; tabel di bawahnya = tampilan datanya.
 */
export function CashBalanceChart({
	rows,
	opening,
	from,
	to,
}: {
	rows: CashBookRow[];
	opening: number;
	from: string;
	/** Akhir periode (sudah dipotong ke hari ini kalau periode berjalan). */
	to: string;
}) {
	const days = useMemo<Day[]>(() => {
		const byDate = new Map<string, Day>();
		for (const r of rows) {
			const d = byDate.get(r.date) ?? {
				date: r.date,
				saldo: 0,
				masuk: 0,
				keluar: 0,
			};
			d.saldo = r.saldo; // baris sudah urut → terakhir = saldo akhir hari
			d.masuk += r.masuk;
			d.keluar += r.keluar;
			byDate.set(r.date, d);
		}
		const out: Day[] = [];
		let saldo = opening;
		for (let date = from; date <= to; date = addDay(date)) {
			const d = byDate.get(date);
			if (d) saldo = d.saldo;
			out.push({ date, saldo, masuk: d?.masuk ?? 0, keluar: d?.keluar ?? 0 });
		}
		return out;
	}, [rows, opening, from, to]);

	const [active, setActive] = useState<number | null>(null);

	if (days.length === 0) return null;

	const values = [opening, ...days.map((d) => d.saldo)];
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	const step = niceStep(hi - lo || Math.abs(hi) || 1);
	const yMin = Math.floor(lo / step) * step;
	const yMax = Math.max(Math.ceil(hi / step) * step, yMin + step);
	const ticks: number[] = [];
	for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);

	// Koordinat dalam persen → SVG preserveAspectRatio="none" + label HTML.
	const n = days.length;
	// Tiap hari = satu pita selebar 1/n. Saldo berubah di awal pita; titik,
	// crosshair, dan label tanggal ada di tengah pita.
	const xStart = (i: number) => (i / n) * 100;
	const xPct = (i: number) => ((i + 0.5) / n) * 100;
	const yPct = (v: number) => 100 - ((v - yMin) / (yMax - yMin)) * 100;

	let path = `M 0 ${yPct(opening)}`;
	days.forEach((d, i) => {
		path += ` H ${xStart(i)} V ${yPct(d.saldo)}`;
	});
	path += ` H 100`;

	// Saldo awal ikut dibandingkan — kalau tidak, "terendah" bisa lebih besar
	// dari saldo awal yang tertulis di kartu.
	const points = [
		{ saldo: opening, label: "saldo awal" },
		...days.map((d) => ({ saldo: d.saldo, label: dayLabel(d.date) })),
	];
	const lowest = points.reduce((m, p) => (p.saldo < m.saldo ? p : m));
	const highest = points.reduce((m, p) => (p.saldo > m.saldo ? p : m));
	const sel = active === null ? null : days[active];
	const last = days[n - 1];

	function pick(clientX: number, el: HTMLElement) {
		const rect = el.getBoundingClientRect();
		const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		setActive(Math.min(n - 1, Math.floor(f * n)));
	}

	return (
		<section className="overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-subtle px-4 py-2.5">
				<h2 className="font-heading text-[15px] font-semibold tracking-tight">
					Pergerakan saldo
				</h2>
				<p className="text-[12px] text-muted-foreground">
					Terendah{" "}
					<span
						className={cn(
							"tabular font-medium text-foreground",
							lowest.saldo < 0 && "text-destructive",
						)}
					>
						{formatRupiah(lowest.saldo)}
					</span>{" "}
					({lowest.label}) · Tertinggi{" "}
					<span className="tabular font-medium text-foreground">
						{formatRupiah(highest.saldo)}
					</span>{" "}
					({highest.label})
				</p>
			</div>

			<div className="flex gap-2 px-4 pb-3 pt-4">
				{/* Sumbu Y */}
				<div className="relative h-40 w-14 shrink-0 sm:h-48">
					{ticks.map((t) => (
						<span
							key={t}
							className="tabular absolute right-0 -translate-y-1/2 text-[10.5px] text-muted-foreground"
							style={{ top: `${yPct(t)}%` }}
						>
							{formatRupiahCompact(t).replace("Rp ", "")}
						</span>
					))}
				</div>

				<div className="min-w-0 flex-1">
					<div
						role="slider"
						tabIndex={0}
						aria-label="Saldo per hari — geser dengan panah kiri/kanan"
						aria-valuemin={0}
						aria-valuemax={n - 1}
						aria-valuenow={active ?? n - 1}
						aria-valuetext={
							sel
								? `${dayLabel(sel.date, true)}: ${formatRupiah(sel.saldo)}`
								: undefined
						}
						className="relative h-40 cursor-crosshair touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-48"
						onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
						onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
						onPointerLeave={() => setActive(null)}
						onBlur={() => setActive(null)}
						onKeyDown={(e) => {
							if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
							e.preventDefault();
							const cur = active ?? n - 1;
							setActive(
								Math.min(
									n - 1,
									Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)),
								),
							);
						}}
					>
						<svg
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							className="absolute inset-0 size-full overflow-visible"
							aria-hidden="true"
							role="presentation"
						>
							{ticks.map((t) => (
								<line
									key={t}
									x1={0}
									x2={100}
									y1={yPct(t)}
									y2={yPct(t)}
									vectorEffect="non-scaling-stroke"
									className={cn(
										t === 0 && yMin < 0
											? "stroke-muted-foreground/60"
											: "stroke-border",
									)}
									strokeWidth={1}
								/>
							))}
							<path
								d={path}
								fill="none"
								vectorEffect="non-scaling-stroke"
								strokeWidth={2}
								strokeLinejoin="round"
								strokeLinecap="round"
								className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
							/>
						</svg>

						{/* Titik akhir + crosshair (HTML supaya bulat, tidak ikut melar) */}
						<Dot x={xPct(n - 1)} y={yPct(last.saldo)} />
						{sel && active !== null && (
							<>
								<div
									className="pointer-events-none absolute inset-y-0 w-px bg-foreground/30"
									style={{ left: `${xPct(active)}%` }}
								/>
								<Dot x={xPct(active)} y={yPct(sel.saldo)} />
								<div
									className="pointer-events-none absolute top-0 z-10 w-max min-w-36 rounded-xl border border-border-subtle bg-popover px-3 py-2 text-[12px] shadow-[var(--shadow-level-3,var(--shadow-level-2))]"
									style={{
										left: `${xPct(active)}%`,
										transform: `translateX(${xPct(active) > 60 ? "calc(-100% - 10px)" : "10px"})`,
									}}
								>
									<div
										className={cn(
											"tabular text-[14px] font-semibold",
											sel.saldo < 0 && "text-destructive",
										)}
									>
										{formatRupiah(sel.saldo)}
									</div>
									<div className="text-muted-foreground">
										Saldo akhir {dayLabel(sel.date, true)}
									</div>
									{(sel.masuk > 0 || sel.keluar > 0) && (
										<div className="mt-1 space-y-0.5 border-t border-border-subtle pt-1">
											{sel.masuk > 0 && (
												<div className="tabular text-emerald-700 dark:text-emerald-400">
													+ {formatRupiah(sel.masuk)} masuk
												</div>
											)}
											{sel.keluar > 0 && (
												<div className="tabular text-rose-600 dark:text-rose-400">
													− {formatRupiah(sel.keluar)} keluar
												</div>
											)}
										</div>
									)}
								</div>
							</>
						)}
					</div>

					{/* Sumbu X: awal, tengah, akhir — di tengah pita harinya */}
					<div className="relative mt-1.5 h-4 text-[10.5px] text-muted-foreground">
						{[...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => (
							<span
								key={i}
								className="absolute -translate-x-1/2 whitespace-nowrap"
								style={{ left: `${xPct(i)}%` }}
							>
								{dayLabel(days[i].date)}
							</span>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function Dot({ x, y }: { x: number; y: number }) {
	return (
		<span
			className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a78d6] ring-2 ring-card dark:bg-[#3987e5]"
			style={{ left: `${x}%`, top: `${y}%` }}
		/>
	);
}
