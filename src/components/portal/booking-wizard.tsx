"use client";

import { Check, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	checkSlot,
	createDraftBooking,
	fullDatesOf,
} from "@/lib/actions/portal-booking";
import { EVENT_KINDS, PRODUCT_CONTENT } from "@/lib/portal/catalog-content";
import type {
	CatalogProduct,
	PublicAddonRow,
	Selection,
} from "@/lib/portal/core";
import { Err, VerifyPhone } from "./verify-phone";

const STEPS = ["Acara", "Paket", "Tambahan", "Data kamu"] as const;
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
	/** Jenis acara (event_types.code) dan perkiraan tamu — ikut ke detail booking. */
	kind: string | null;
	guests: string;
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
	kind: null,
	guests: "",
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
	// Dipesan WO/vendor untuk kliennya (DR-028).
	const [wo, setWo] = useState({
		on: false,
		nama: "",
		klien: "",
		klienWa: "",
		kelola: "wo" as "wo" | "klien",
	});
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
				window.history.replaceState({ tpStep: s.step ?? 0 }, "");
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
					frame: d.frame,
					units: d.units,
					addons: d.addons,
					date: d.date,
					category: d.category,
					hours: d.hours,
					start: noTime ? null : d.start,
					city: d.city?.trim() || null,
				}
			: null;

	// Cek slot otomatis tiap jadwal berubah.
	const sel = selection();
	const slotKey = sel
		? `${sel.date}|${sel.start}|${noTime}|${sel.hours}|${sel.units}|${sel.city}`
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

	// Tanggal yang sudah penuh (sehari penuh, 1 booth) untuk dicoret di kalender.
	const [full, setFull] = useState<string[]>([]);
	const loadMonth = useCallback(async (from: string, to: string) => {
		const r = await fullDatesOf(from, to).catch(() => null);
		if (r?.ok)
			setFull((prev) => [
				...new Set([...prev.filter((x) => x < from || x > to), ...r.dates]),
			]);
	}, []);

	// Rekomendasi sesuai jenis acara tampil paling atas.
	const sortedProducts = useMemo(
		() =>
			[...products].sort(
				(a, b) =>
					Number(
						PRODUCT_CONTENT[b.category]?.recommend.includes(d.kind ?? "") ??
							false,
					) -
					Number(
						PRODUCT_CONTENT[a.category]?.recommend.includes(d.kind ?? "") ??
							false,
					),
			),
		[products, d.kind],
	);

	// Langkah tersinkron dengan history: tombol back HP kembali ke langkah sebelumnya.
	const go = (n: number) => {
		setStep(n);
		window.history.pushState({ tpStep: n }, "");
		window.scrollTo({ top: 0 });
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: daftar sekali saat mount.
	useEffect(() => {
		window.history.replaceState({ tpStep: step }, "");
		const onPop = (e: PopStateEvent) =>
			setStep(typeof e.state?.tpStep === "number" ? e.state.tpStep : 0);
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);

	const canNext = [
		!!d.kind && !!d.date && (noTime || !!d.start) && !full.includes(d.date),
		!!product && !!d.hours && slot === "ada",
		true,
		false,
	][step];

	async function finish() {
		const s = selection();
		if (!s) return go(0);
		setSaving(true);
		const detail = {
			...(d.kind ? { kategori: d.kind } : {}),
			...(d.guests ? { jumlah_tamu: d.guests } : {}),
			...(wo.on && wo.nama.trim() ? { wo_nama: wo.nama.trim() } : {}),
		};
		const r = await createDraftBooking({
			selection: s,
			consent: true,
			detail,
			...(wo.on
				? {
						asWo: true,
						managedBy: wo.kelola,
						client:
							wo.klien.trim().length >= 2
								? {
										name: wo.klien.trim(),
										phone: wo.klienWa.trim() || undefined,
									}
								: undefined,
					}
				: {}),
		});
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
						<h1 className="h1">Acaranya apa & kapan?</h1>
						<p className="cap">Cek dulu tanggalmu masih ada atau tidak.</p>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
								gap: 10,
							}}
						>
							{EVENT_KINDS.map((k) => (
								<button
									key={k.code}
									type="button"
									className="opt"
									aria-pressed={d.kind === k.code}
									onClick={() => setD({ ...d, kind: k.code })}
									style={{ padding: 6, textAlign: "center" }}
								>
									{/* biome-ignore lint/performance/noImgElement: foto statis kecil di public/. */}
									<img
										src={k.image}
										alt=""
										loading="lazy"
										style={{
											width: "100%",
											aspectRatio: "1",
											objectFit: "cover",
											borderRadius: 10,
											display: "block",
										}}
									/>
									<div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>
										{k.label}
									</div>
								</button>
							))}
						</div>
						<Calendar
							value={d.date}
							full={full}
							onMonth={loadMonth}
							onChange={(date) => setD({ ...d, date })}
						/>
						{d.date && full.includes(d.date) && (
							<div className="note" style={{ background: "var(--peach)" }}>
								Tanggal ini sudah penuh. Coba tanggal lain, ya.
							</div>
						)}
						{d.date && !full.includes(d.date) && (
							<div className="note" style={{ background: "var(--mint-soft)" }}>
								Tanggal ini masih tersedia ✓
							</div>
						)}
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
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
								gap: 10,
							}}
						>
							<div>
								<label className="label" htmlFor="b-city">
									Kota acara
								</label>
								<input
									id="b-city"
									className="input"
									autoComplete="address-level2"
									enterKeyHint="next"
									placeholder="mis. Bogor"
									value={d.city ?? ""}
									onChange={(e) => setD({ ...d, city: e.target.value })}
								/>
							</div>
							<div>
								<label className="label" htmlFor="b-guests">
									Perkiraan tamu
								</label>
								<input
									id="b-guests"
									className="input mono"
									inputMode="numeric"
									enterKeyHint="done"
									placeholder="300"
									maxLength={5}
									value={d.guests}
									onChange={(e) =>
										setD({ ...d, guests: e.target.value.replace(/\D/g, "") })
									}
								/>
							</div>
						</div>
					</section>
				)}

				{step === 1 && (
					<section className="enter" style={{ display: "grid", gap: 14 }}>
						<h1 className="h1">Pilih paketnya</h1>
						<p className="cap">
							Harga sudah termasuk crew, setup, dan transport Jabodetabek.
						</p>
						{sortedProducts.map((p) => (
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
								<ProductCard p={p} kind={d.kind} />
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
						{slot === "cek" && <div className="note">Mengecek jadwal…</div>}
						{slot === "penuh" && (
							<div className="note" style={{ background: "var(--peach)" }}>
								Untuk durasi/jumlah booth ini jadwalnya sudah penuh. Coba durasi
								lain, atau ganti tanggal di langkah sebelumnya.
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
							className="chip"
							aria-pressed={wo.on}
							onClick={() => setWo({ ...wo, on: !wo.on })}
							style={{ justifySelf: "start" }}
						>
							Saya WO / vendor, memesan untuk klien
						</button>
						{wo.on && (
							<div className="card enter" style={{ display: "grid", gap: 12 }}>
								<div>
									<label className="label" htmlFor="wo-nama">
										Nama usaha WO / vendor
									</label>
									<input
										id="wo-nama"
										className="input"
										placeholder="mis. Nakisha WO"
										value={wo.nama}
										onChange={(e) => setWo({ ...wo, nama: e.target.value })}
									/>
									<div className="cap" style={{ marginTop: 4 }}>
										Kalau nomor kamu sudah terdaftar sebagai rekanan Tetra, kami
										kenali otomatis.
									</div>
								</div>
								<div>
									<label className="label" htmlFor="wo-klien">
										Nama klien (pemilik acara)
									</label>
									<input
										id="wo-klien"
										className="input"
										placeholder="mis. Rina & Dimas"
										value={wo.klien}
										onChange={(e) => setWo({ ...wo, klien: e.target.value })}
									/>
								</div>
								<div>
									<label className="label" htmlFor="wo-klien-wa">
										WhatsApp klien (opsional)
									</label>
									<input
										id="wo-klien-wa"
										className="input mono"
										type="tel"
										inputMode="tel"
										placeholder="0812 3456 7890"
										value={wo.klienWa}
										onChange={(e) => setWo({ ...wo, klienWa: e.target.value })}
									/>
									<div className="cap" style={{ marginTop: 4 }}>
										Kalau diisi, klien ikut bisa membuka booking ini.
									</div>
								</div>
								<div>
									<div className="label">
										Siapa yang mengurus detail & desain?
									</div>
									<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
										<button
											type="button"
											className="chip"
											aria-pressed={wo.kelola === "wo"}
											onClick={() => setWo({ ...wo, kelola: "wo" })}
										>
											Saya (WO)
										</button>
										<button
											type="button"
											className="chip"
											aria-pressed={wo.kelola === "klien"}
											onClick={() => setWo({ ...wo, kelola: "klien" })}
										>
											Klien langsung
										</button>
									</div>
								</div>
							</div>
						)}
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
							onClick={() => window.history.back()}
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
							onClick={() => go(step + 1)}
						>
							Lanjut <ChevronRight size={18} />
						</button>
					)}
				</div>
			</div>
		</>
	);
}

/** Kartu paket: foto cetakan asli, isi paket, harga mulai, rekomendasi per acara. */
function ProductCard({ p, kind }: { p: CatalogProduct; kind: string | null }) {
	const c = PRODUCT_CONTENT[p.category];
	const fit = !!kind && !!c?.recommend.includes(kind);
	return (
		<div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
			{c && (
				// biome-ignore lint/performance/noImgElement: foto statis kecil di public/.
				<img
					src={c.image}
					alt=""
					loading="lazy"
					style={{
						width: 84,
						minHeight: 84,
						objectFit: "cover",
						borderRadius: 10,
						flex: "none",
						alignSelf: "flex-start",
					}}
				/>
			)}
			<div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
				<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
					{fit && (
						<span
							className="pill"
							style={{ background: "var(--mint-soft)", height: 22 }}
						>
							Cocok untuk acaramu
						</span>
					)}
					{c?.badge && (
						<span
							className="pill"
							style={{ background: "var(--butter)", height: 22 }}
						>
							{c.badge}
						</span>
					)}
				</div>
				<div style={{ fontWeight: 800, fontSize: 16 }}>
					{c?.label ?? p.label}
				</div>
				{c && <div className="body">{c.tagline}</div>}
				{c && (
					<ul
						className="cap"
						style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 2 }}
					>
						{c.points.map((pt) => (
							<li key={pt}>{pt}</li>
						))}
					</ul>
				)}
				<div className="cap">
					mulai{" "}
					<span
						className="mono"
						style={{ color: "var(--ink)", fontWeight: 600 }}
					>
						{rp(p.options[0]?.price ?? 0)}
					</span>{" "}
					·{" "}
					{p.options.length > 1
						? `${p.options[0].hours}–${p.options[p.options.length - 1].hours} jam`
						: `${p.options[0]?.hours} jam`}
				</div>
			</div>
		</div>
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
