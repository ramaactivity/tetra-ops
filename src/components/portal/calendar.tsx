"use client";

/** Kalender & pilihan jam untuk form pindah tanggal (tanpa picker bawaan browser). */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const iso = (y: number, m: number, d: number) =>
	`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Kalender bulan sendiri (tanpa date picker bawaan browser). Minimal besok. */
export function Calendar({
	value,
	onChange,
	full = [],
	onMonth,
}: {
	value: string;
	onChange: (iso: string) => void;
	/** Tanggal yang sudah penuh — dicoret dan tidak bisa dipilih. */
	full?: string[];
	/** Dipanggil saat bulan tampil berganti (from, to) untuk memuat tanggal penuh. */
	onMonth?: (from: string, to: string) => void;
}) {
	const now = new Date();
	const tomorrow = iso(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	const init = value ? new Date(`${value}T00:00:00`) : now;
	const [ym, setYm] = useState({ y: init.getFullYear(), m: init.getMonth() });
	const first = new Date(ym.y, ym.m, 1);
	const lead = (first.getDay() + 6) % 7;
	const days = new Date(ym.y, ym.m + 1, 0).getDate();
	const canPrev = ym.y > now.getFullYear() || ym.m > now.getMonth();
	const shift = (n: number) => {
		const t = new Date(ym.y, ym.m + n, 1);
		setYm({ y: t.getFullYear(), m: t.getMonth() });
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: muat ulang hanya saat bulan berganti.
	useEffect(() => {
		onMonth?.(iso(ym.y, ym.m, 1), iso(ym.y, ym.m, days));
	}, [ym.y, ym.m]);
	return (
		<div className="card">
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 12,
				}}
			>
				<button
					type="button"
					className="chip"
					aria-label="Bulan sebelumnya"
					disabled={!canPrev}
					onClick={() => shift(-1)}
					style={{ padding: "0 10px" }}
				>
					<ChevronLeft size={18} />
				</button>
				<div className="h2" aria-live="polite">
					{first.toLocaleDateString("id-ID", {
						month: "long",
						year: "numeric",
					})}
				</div>
				<button
					type="button"
					className="chip"
					aria-label="Bulan berikutnya"
					onClick={() => shift(1)}
					style={{ padding: "0 10px" }}
				>
					<ChevronRight size={18} />
				</button>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(7, minmax(0,1fr))",
					gap: 4,
					textAlign: "center",
				}}
			>
				{WEEKDAYS.map((w) => (
					<div key={w} className="cap" style={{ padding: "4px 0" }}>
						{w}
					</div>
				))}
				{Array.from({ length: days }, (_, i) => {
					const day = iso(ym.y, ym.m, i + 1);
					const penuh = full.includes(day);
					const off = day < tomorrow || penuh;
					const on = day === value;
					return (
						<button
							key={day}
							type="button"
							disabled={off}
							aria-pressed={on}
							aria-label={`${new Date(`${day}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}${penuh ? " (penuh)" : ""}`}
							onClick={() => onChange(day)}
							className="mono"
							style={{
								// Tanggal 1 mulai di kolom harinya (Senin = kolom 1).
								gridColumnStart: i === 0 ? lead + 1 : undefined,
								height: 40,
								borderRadius: 10,
								border: on
									? "1.5px solid var(--ink)"
									: "1.5px solid transparent",
								background: on ? "var(--mint)" : "transparent",
								color: off ? "var(--muted)" : "var(--ink)",
								textDecoration: penuh ? "line-through" : undefined,
								fontSize: 15,
								cursor: off ? "default" : "pointer",
							}}
						>
							{i + 1}
						</button>
					);
				})}
			</div>
		</div>
	);
}

const TIMES = Array.from({ length: 31 }, (_, i) => {
	const m = 7 * 60 + i * 30;
	return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

export function TimeChips({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (v: string) => void;
}) {
	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				overflowX: "auto",
				paddingBottom: 4,
				margin: "0 -4px",
				padding: "0 4px 4px",
			}}
		>
			{TIMES.map((t) => (
				<button
					key={t}
					type="button"
					className="chip mono"
					aria-pressed={value === t}
					onClick={() => onChange(t)}
					style={{ flex: "none" }}
				>
					{t}
				</button>
			))}
		</div>
	);
}
