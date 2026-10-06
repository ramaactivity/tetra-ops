"use client";

import { Check, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { checkSlot, createDraftBooking } from "@/lib/actions/portal-booking";
import type {
	CatalogProduct,
	PublicAddonRow,
	Selection,
} from "@/lib/portal/core";
import { Err, VerifyPhone } from "./verify-phone";

const STEPS = ["Paket", "Jadwal", "Tambahan", "Data kamu"] as const;
const STORE = "tp-booking-v1";
const FRAME_LABEL: Record<string, string> = {
	"2R": "2R Photostrip",
	"4R": "4R",
	polaroid: "Polaroid",
};

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

type Draft = Omit<Selection, "category" | "hours"> & {
	category: string | null;
	hours: number | null;
};
const EMPTY: Draft = {
	category: null,
	hours: null,
	frame: null,
	units: 1,
	addons: [],
	date: "",
	start: null,
	city: null,
};

/** Wizard booking publik. Pilihan disimpan di browser sampai nomor terverifikasi. */
export function BookingWizard({
	products,
	addons,
	signedInName,
}: {
	products: CatalogProduct[];
	addons: PublicAddonRow[];
	signedInName: string | null;
}) {
	const router = useRouter();
	const [step, setStep] = useState(0);
	const [d, setD] = useState<Draft>(EMPTY);
	const [noTime, setNoTime] = useState(false);
	const [consent, setConsent] = useState(false);
	const [slot, setSlot] = useState<"cek" | "ada" | "penuh" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	// Pulihkan pilihan setelah kembali dari WhatsApp / refresh.
	useEffect(() => {
		try {
			const raw = localStorage.getItem(STORE);
			if (raw) {
				const s = JSON.parse(raw);
				setD({ ...EMPTY, ...s.d });
				setStep(s.step ?? 0);
				setNoTime(!!s.noTime);
			}
		} catch {}
	}, []);
	useEffect(() => {
		try {
			localStorage.setItem(STORE, JSON.stringify({ d, step, noTime }));
		} catch {}
	}, [d, step, noTime]);

	const product = products.find((p) => p.category === d.category) ?? null;
	const price = product?.options.find((o) => o.hours === d.hours)?.price ?? 0;
	const total = useMemo(
		() =>
			price * d.units +
			d.addons.reduce(
				(s, a) => s + (addons.find((x) => x.id === a.id)?.price ?? 0) * a.qty,
				0,
			),
		[price, d.units, d.addons, addons],
	);
	const selection = (): Selection | null =>
		d.category && d.hours && d.date
			? {
					...d,
					category: d.category,
					hours: d.hours,
					start: noTime ? null : d.start,
					city: d.city?.trim() || null,
				}
			: null;

	// Cek slot otomatis tiap jadwal berubah.
	const sel = selection();
	const slotKey = sel
		? `${sel.date}|${sel.start}|${sel.hours}|${sel.units}|${sel.city}`
		: "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: slotKey merangkum semua isi jadwal; cek ulang hanya saat jadwal berubah.
	useEffect(() => {
		if (!slotKey || (!noTime && !d.start)) return setSlot(null);
		const s = selection();
		if (!s) return;
		setSlot("cek");
		const t = setTimeout(async () => {
			const r = await checkSlot(s).catch(() => null);
			setSlot(r?.ok ? (r.available ? "ada" : "penuh") : null);
		}, 400);
		return () => clearTimeout(t);
	}, [slotKey]);

	const canNext = [
		!!product && !!d.hours,
		!!d.date && (noTime || !!d.start) && slot === "ada",
		true,
		false,
	][step];

	async function finish() {
		const s = selection();
		if (!s) return setStep(0);
		setSaving(true);
		const r = await createDraftBooking({ selection: s, consent: true });
		if (!r.ok) {
			setSaving(false);
			return setError(r.error);
		}
		try {
			localStorage.removeItem(STORE);
		} catch {}
		router.push(`/akun/booking/${r.code}`);
	}

	return (
		<>
			<div className="wrap">
				<header
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: 20,
					}}
				>
					<a
						href="https://tetraphoto.com"
						className="h2"
						style={{ color: "var(--ink)", textDecoration: "none" }}
					>
						tetra
					</a>
					<a href="/akun" className="link cap">
						{signedInName ? "Booking saya" : "Sudah pernah booking? Masuk"}
					</a>
				</header>

				<ol
					style={{
						display: "flex",
						gap: 6,
						listStyle: "none",
						padding: 0,
						margin: "0 0 18px",
					}}
					aria-label="Langkah"
				>
					{STEPS.map((s, i) => (
						<li key={s} style={{ flex: 1 }}>
							<div
								style={{
									height: 6,
									borderRadius: 99,
									border: "1.5px solid var(--ink)",
									background: i <= step ? "var(--mint)" : "#fff",
								}}
							/>
							<div
								className="cap"
								style={{
									marginTop: 6,
									color: i === step ? "var(--ink)" : undefined,
								}}
							>
								{s}
							</div>
						</li>
					))}
				</ol>

				{step === 0 && (
					<section className="enter" style={{ display: "grid", gap: 14 }}>
						<h1 className="h1">Mau booth yang mana?</h1>
						{products.map((p) => (
							<button
								key={p.category}
								type="button"
								className="opt"
								aria-pressed={d.category === p.category}
								onClick={() =>
									setD({
										...d,
										category: p.category,
										hours: p.options.some((o) => o.hours === d.hours)
											? d.hours
											: null,
										frame: p.frames.includes(d.frame ?? "") ? d.frame : null,
									})
								}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										gap: 12,
										alignItems: "baseline",
									}}
								>
									<span style={{ fontWeight: 800, fontSize: 16 }}>
										{p.label}
									</span>
									<span className="cap" style={{ whiteSpace: "nowrap" }}>
										mulai{" "}
										<span className="mono">{rp(p.options[0]?.price ?? 0)}</span>
									</span>
								</div>
								{p.description && (
									<div className="body" style={{ marginTop: 4 }}>
										{p.description}
									</div>
								)}
							</button>
						))}

						{product && (
							<div className="card enter" style={{ display: "grid", gap: 16 }}>
								<div>
									<div className="label">Durasi</div>
									<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
										{product.options.map((o) => (
											<button
												key={o.hours}
												type="button"
												className="chip"
												aria-pressed={d.hours === o.hours}
												onClick={() => setD({ ...d, hours: o.hours })}
											>
												{o.hours} jam ·{" "}
												<span className="mono">{rp(o.price)}</span>
											</button>
										))}
									</div>
								</div>
								{product.frames.length > 0 && (
									<div>
										<div className="label">Ukuran cetak</div>
										<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
											{product.frames.map((f) => (
												<button
													key={f}
													type="button"
													className="chip"
													aria-pressed={d.frame === f}
													onClick={() =>
														setD({ ...d, frame: f as Selection["frame"] })
													}
												>
													{FRAME_LABEL[f] ?? f}
												</button>
											))}
											<button
												type="button"
												className="chip"
												aria-pressed={d.frame === null}
												onClick={() => setD({ ...d, frame: null })}
											>
												Belum tahu
											</button>
										</div>
									</div>
								)}
								<Stepper
									label="Jumlah booth"
									hint="Untuk acara besar, bisa 2–3 booth sekaligus."
									value={d.units}
									min={1}
									max={3}
									onChange={(units) => setD({ ...d, units })}
								/>
							</div>
						)}
					</section>
				)}

				{step === 1 && (
					<section className="enter" style={{ display: "grid", gap: 14 }}>
						<h1 className="h1">Kapan acaranya?</h1>
						<Calendar
							value={d.date}
							onChange={(date) => setD({ ...d, date })}
						/>
						<div className="card" style={{ display: "grid", gap: 10 }}>
							<div className="label" style={{ margin: 0 }}>
								Jam mulai photobooth
							</div>
							<TimeChips
								value={noTime ? null : d.start}
								onChange={(start) => {
									setNoTime(false);
									setD({ ...d, start });
								}}
							/>
							<button
								type="button"
								className="chip"
								aria-pressed={noTime}
								onClick={() => setNoTime(!noTime)}
								style={{ justifySelf: "start" }}
							>
								Jam belum pasti
							</button>
						</div>
						<div>
							<label className="label" htmlFor="b-city">
								Kota acara
							</label>
							<input
								id="b-city"
								className="input"
								placeholder="mis. Bogor"
								value={d.city ?? ""}
								onChange={(e) => setD({ ...d, city: e.target.value })}
							/>
						</div>
						{slot === "cek" && <div className="note">Mengecek jadwal…</div>}
						{slot === "ada" && (
							<div className="note" style={{ background: "var(--mint-soft)" }}>
								Jadwalnya masih ada. Slot baru dikunci setelah DP kamu kami
								terima.
							</div>
						)}
						{slot === "penuh" && (
							<div className="note" style={{ background: "var(--peach)" }}>
								Yah, jadwal itu sudah penuh. Coba jam atau tanggal lain, ya.
							</div>
						)}
					</section>
				)}

				{step === 2 && (
					<section className="enter" style={{ display: "grid", gap: 14 }}>
						<h1 className="h1">Mau tambah apa?</h1>
						<p className="body">
							Boleh dilewati. Tambahan bisa diatur lagi bersama admin.
						</p>
						{addons.map((a) => {
							const cur = d.addons.find((x) => x.id === a.id);
							const min = a.min_qty ?? 1;
							const set = (qty: number) =>
								setD({
									...d,
									addons:
										qty <= 0
											? d.addons.filter((x) => x.id !== a.id)
											: [
													...d.addons.filter((x) => x.id !== a.id),
													{ id: a.id, qty },
												],
								});
							return (
								<div
									key={a.id}
									className="card"
									style={{ display: "flex", alignItems: "center", gap: 12 }}
								>
									<div style={{ flex: 1 }}>
										<div style={{ fontWeight: 800 }}>{a.name}</div>
										<div className="cap">
											<span className="mono">{rp(a.price)}</span> / {a.unit}
											{a.min_qty ? ` · min. ${a.min_qty}` : ""}
										</div>
									</div>
									{cur ? (
										<Stepper
											value={cur.qty}
											min={0}
											max={5000}
											step={min > 1 ? 10 : 1}
											floor={min}
											onChange={set}
										/>
									) : (
										<button
											type="button"
											className="chip"
											onClick={() => set(min)}
										>
											<Plus size={16} /> Tambah
										</button>
									)}
								</div>
							);
						})}
					</section>
				)}

				{step === 3 && (
					<section className="enter" style={{ display: "grid", gap: 14 }}>
						<h1 className="h1">Satu langkah lagi</h1>
						<Summary
							product={product}
							d={d}
							noTime={noTime}
							addons={addons}
							total={total}
						/>
						<button
							type="button"
							className="note"
							onClick={() => setConsent(!consent)}
							style={{
								display: "flex",
								gap: 12,
								textAlign: "left",
								background: "#fff",
								cursor: "pointer",
								font: "inherit",
							}}
						>
							<span className="tick" data-on={consent}>
								{consent && <Check size={16} strokeWidth={3} />}
							</span>
							<span className="body">
								Saya menyetujui{" "}
								<a
									className="link"
									href="/booking/syarat"
									target="_blank"
									rel="noopener"
								>
									syarat booking
								</a>{" "}
								(termasuk DP, pembatalan, dan pindah tanggal) serta pengolahan
								data pribadi saya oleh Tetra Photobooth untuk mengurus booking
								ini, sesuai{" "}
								<a
									className="link"
									href="/booking/syarat#privasi"
									target="_blank"
									rel="noopener"
								>
									kebijakan privasi
								</a>
								.
							</span>
						</button>
						{signedInName ? (
							<>
								<p className="body">
									Masuk sebagai <b>{signedInName}</b>.
								</p>
								<button
									type="button"
									className="btn btn-primary btn-block"
									disabled={!consent || saving}
									onClick={finish}
								>
									{saving ? "Menyimpan…" : "Simpan booking"}
								</button>
							</>
						) : (
							<VerifyPhone
								askName
								cta="Verifikasi lewat WhatsApp"
								beforeStart={() =>
									consent ? null : "Centang persetujuan dulu, ya."
								}
								onDone={finish}
							/>
						)}
						{error && <Err text={error} />}
						<p className="cap">
							Setelah tersimpan, kamu bisa melengkapi detail acara dan membayar
							DP (minimal Rp500.000) di halaman booking kamu.
						</p>
					</section>
				)}
			</div>

			<div className="dock">
				<div className="dock-inner">
					{step > 0 && (
						<button
							type="button"
							className="btn"
							aria-label="Kembali"
							onClick={() => setStep(step - 1)}
							style={{ padding: "0 14px" }}
						>
							<ChevronLeft size={20} />
						</button>
					)}
					<div style={{ flex: 1, minWidth: 0 }}>
						<div className="cap">Perkiraan total</div>
						<div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
							{rp(total)}
						</div>
					</div>
					{step < 3 && (
						<button
							type="button"
							className="btn btn-primary"
							disabled={!canNext}
							onClick={() => setStep(step + 1)}
						>
							Lanjut <ChevronRight size={18} />
						</button>
					)}
				</div>
			</div>
		</>
	);
}

function Summary({
	product,
	d,
	noTime,
	addons,
	total,
}: {
	product: CatalogProduct | null;
	d: Draft;
	noTime: boolean;
	addons: PublicAddonRow[];
	total: number;
}) {
	if (!product) return null;
	const date = d.date
		? new Date(`${d.date}T00:00:00`).toLocaleDateString("id-ID", {
				weekday: "long",
				day: "numeric",
				month: "long",
				year: "numeric",
			})
		: "-";
	return (
		<div className="card layered" style={{ display: "grid", gap: 6 }}>
			<div style={{ fontWeight: 800 }}>
				{product.label} · {d.hours} jam
			</div>
			<div className="body">
				{[
					d.frame
						? FRAME_LABEL[d.frame]
						: product.frames.length
							? "Ukuran cetak menyusul"
							: null,
					d.units > 1 ? `${d.units} booth` : null,
				]
					.filter(Boolean)
					.join(" · ")}
			</div>
			<div className="body">
				{date} · {noTime || !d.start ? "jam menyusul" : `mulai ${d.start}`}
				{d.city ? ` · ${d.city}` : ""}
			</div>
			{d.addons.map((a) => {
				const row = addons.find((x) => x.id === a.id);
				return row ? (
					<div key={a.id} className="body">
						+ {row.name} × {a.qty}
					</div>
				) : null;
			})}
			<hr className="divider" />
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					fontWeight: 800,
				}}
			>
				<span>Perkiraan total</span>
				<span className="mono">{rp(total)}</span>
			</div>
		</div>
	);
}

function Stepper({
	label,
	hint,
	value,
	min,
	max,
	step = 1,
	floor,
	onChange,
}: {
	label?: string;
	hint?: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	/** Di bawah nilai ini langsung ke `min` (mis. add-on dengan minimal pesan). */
	floor?: number;
	onChange: (v: number) => void;
}) {
	const dec = () => {
		const next = value - step;
		onChange(floor && next < floor ? min : Math.max(min, next));
	};
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
			{label && (
				<div style={{ flex: 1 }}>
					<div className="label" style={{ margin: 0 }}>
						{label}
					</div>
					{hint && <div className="cap">{hint}</div>}
				</div>
			)}
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<button
					type="button"
					className="chip"
					aria-label="Kurangi"
					onClick={dec}
					disabled={value <= min}
					style={{ padding: "0 10px" }}
				>
					<Minus size={16} />
				</button>
				<span
					className="mono"
					style={{ minWidth: 34, textAlign: "center", fontSize: 16 }}
					aria-live="polite"
				>
					{value}
				</span>
				<button
					type="button"
					className="chip"
					aria-label="Tambah"
					onClick={() => onChange(Math.min(max, value + step))}
					disabled={value >= max}
					style={{ padding: "0 10px" }}
				>
					<Plus size={16} />
				</button>
			</div>
		</div>
	);
}

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const iso = (y: number, m: number, d: number) =>
	`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Kalender bulan sendiri (tanpa date picker bawaan browser). Minimal besok. */
function Calendar({
	value,
	onChange,
}: {
	value: string;
	onChange: (iso: string) => void;
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
					const off = day < tomorrow;
					const on = day === value;
					return (
						<button
							key={day}
							type="button"
							disabled={off}
							aria-pressed={on}
							aria-label={new Date(`${day}T00:00:00`).toLocaleDateString(
								"id-ID",
								{ day: "numeric", month: "long" },
							)}
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
								color: off ? "var(--line-soft)" : "var(--ink)",
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

function TimeChips({
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
