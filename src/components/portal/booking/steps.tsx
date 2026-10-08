"use client";

/**
 * Isi tiap layar wizard booking v4 — dipakai HP & desktop (prototipe
 * "Langkah Booking.dc.html"). Bagian yang hanya tampil di HP dibungkus .only-m;
 * di desktop konten serupa ada di panel kiri (wizard.tsx).
 */
import {
	AtSign,
	Calendar as CalIcon,
	CirclePlus,
	Clock,
	ExternalLink,
	House,
	Image as ImageIco,
	Images,
	Info,
	LayoutTemplate,
	Link as LinkIcon,
	ListChecks,
	LockKeyhole,
	Mail,
	Map as MapIcon,
	MapPin,
	MessageCircle,
	Package,
	Palette,
	ShieldCheck,
	Sparkles,
	Store,
	Type,
	User,
	Wallet,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
	type CSSProperties,
	Fragment,
	type KeyboardEvent,
	type ReactNode,
	useState,
} from "react";
import { parseInstagram } from "@/lib/portal/core";
import {
	BACKDROPS,
	BD_COLORS,
	CITIES,
	FMTD,
	FMTS,
	type Fmt,
	PRIVACY_URL,
	REFUND_URL,
	TERMS_URL,
	THEMES,
	TIMES,
} from "./content";
import type { Draft } from "./logic";
import {
	B,
	Dot,
	ErrLine,
	IconChip,
	INK,
	layered,
	mono,
	Notice,
	opt,
	PrintPreview,
	SEL,
	Stepper,
} from "./ui";
import type { Ctx } from "./wizard";

const col = (gap: number, extra?: CSSProperties): CSSProperties => ({
	display: "flex",
	flexDirection: "column",
	gap,
	...extra,
});
const inputStyle = (bc = INK, extra?: CSSProperties): CSSProperties => ({
	height: 54,
	border: `1.5px solid ${bc}`,
	borderRadius: 14,
	background: "#fff",
	padding: "0 14px",
	fontSize: 17,
	fontWeight: 700,
	width: "100%",
	...extra,
});
const sub13: CSSProperties = {
	fontSize: 13,
	lineHeight: 1.4,
	color: "#3A3936",
};
const link: CSSProperties = {
	border: 0,
	background: "transparent",
	fontSize: 13,
	fontWeight: 700,
	textDecoration: "underline",
};

export function Steps({ x }: { x: Ctx }) {
	const s = x.s;
	switch (s.screen) {
		case "type":
			return <TypeStep x={x} />;
		case "date":
			return <DateStep x={x} />;
		case "city":
			return <CityStep x={x} />;
		case "pkg":
			return <PkgStep x={x} />;
		case "dur":
			return <DurStep x={x} />;
		case "fmt":
			return <FmtStep x={x} />;
		case "backdrop":
			return <BackdropBlock x={x} standalone />;
		case "add":
			return <AddStep x={x} />;
		case "title":
			return <TitleStep x={x} />;
		case "design":
			return <DesignStep x={x} />;
		case "contact":
			return <ContactStep x={x} />;
		case "otp":
			return <OtpStep x={x} />;
		case "dash":
			return <DashStep x={x} />;
		case "review":
			return <ReviewStep x={x} />;
		default:
			return null;
	}
}

// ── 1a Jenis acara ──────────────────────────────────────────────────────────

function TypeStep({ x }: { x: Ctx }) {
	return (
		<div
			style={{
				padding: "20px 16px 140px",
				display: "grid",
				gridTemplateColumns: "repeat(2,minmax(0,1fr))",
				gap: 10,
			}}
		>
			{x.events.map((e) => {
				const sel = x.s.event === e.id;
				return (
					<button
						key={e.id}
						type="button"
						className="shrink"
						aria-pressed={sel}
						onClick={() => x.pick({ event: e.id })}
						style={
							{
								"--s": ".96",
								position: "relative",
								display: "flex",
								flexDirection: "column",
								justifyContent: "space-between",
								gap: 16,
								minHeight: 112,
								padding: 14,
								border: B,
								borderRadius: 18,
								...opt(sel),
								textAlign: "left",
							} as CSSProperties
						}
					>
						<IconChip icon={e.icon} tint={e.tint} />
						<span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25 }}>
							{e.label}
						</span>
						{sel && (
							<span style={{ position: "absolute", right: 10, top: 10 }}>
								<Dot size={26} font={13} ok />
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

// ── 1b Tanggal + jam ────────────────────────────────────────────────────────

function DateStep({ x }: { x: Ctx }) {
	const s = x.s;
	const ok = !!s.date && !s.date.full;
	const calOpen = !(s.calShut && ok);
	const { y, m } = s.cal;
	const lead = (new Date(y, m, 1).getDay() + 6) % 7;
	const nd = new Date(y, m + 1, 0).getDate();
	const atMin = y < x.today.y || (y === x.today.y && m <= x.today.m);
	return (
		<>
			<div
				style={col(14, {
					padding: `16px 16px ${ok ? "0" : "140px"}`,
				})}
			>
				{s.calShut && ok && (
					<div
						className="pop"
						style={{
							display: "flex",
							gap: 12,
							alignItems: "center",
							padding: "12px 14px",
							border: B,
							borderRadius: 16,
							background: "#D6F1EA",
							boxShadow: SEL,
						}}
					>
						<Dot size={30} font={14} ok />
						<span style={col(1, { flex: 1 })}>
							<span style={{ fontSize: 15, fontWeight: 800 }}>
								{x.dateLong}
							</span>
							<span style={{ fontSize: 13 }}>Tanggal masih tersedia</span>
						</span>
						<button
							type="button"
							onClick={() => x.set({ calShut: false })}
							style={{
								flex: "none",
								height: 40,
								padding: "0 12px",
								border: B,
								borderRadius: 12,
								background: "#fff",
								fontSize: 13,
								fontWeight: 800,
							}}
						>
							Ubah
						</button>
					</div>
				)}
				{calOpen && (
					<>
						<div
							style={col(4, {
								background: "#fff",
								border: B,
								borderRadius: 20,
								padding: "8px 10px 12px",
							})}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
								}}
							>
								<button
									type="button"
									aria-label="Bulan sebelumnya"
									disabled={atMin}
									onClick={() =>
										x.set({ cal: m ? { y, m: m - 1 } : { y: y - 1, m: 11 } })
									}
									style={calNav(atMin ? 0.25 : 1)}
								>
									‹
								</button>
								<span style={{ fontSize: 16, fontWeight: 800 }}>
									{x.monthName(m)} {y}
								</span>
								<button
									type="button"
									aria-label="Bulan berikutnya"
									onClick={() =>
										x.set({
											cal: m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 },
										})
									}
									style={calNav(1)}
								>
									›
								</button>
							</div>
							<div
								aria-hidden
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(7,minmax(0,1fr))",
									textAlign: "center",
									fontSize: 12,
									fontWeight: 700,
									color: "#5F5E5A",
									height: 24,
									alignItems: "center",
								}}
							>
								{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
									<span key={d}>{d}</span>
								))}
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(7,minmax(0,1fr))",
									gap: 3,
								}}
							>
								{Array.from({ length: lead }, (_, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: sel kosong pengisi awal bulan.
									<span key={`l${i}`} />
								))}
								{Array.from({ length: nd }, (_, i) => {
									const d = i + 1;
									const past = x.isPast(y, m, d);
									const full = !past && x.isFull(y, m, d);
									const sel =
										s.date?.y === y && s.date.m === m && s.date.d === d;
									return (
										<button
											key={d}
											type="button"
											disabled={past}
											aria-pressed={sel}
											aria-label={`${d} ${x.monthName(m)}${full ? ", penuh" : ""}`}
											onClick={() => x.pickDate({ y, m, d, full })}
											style={{
												height: 44,
												padding: 0,
												border: sel ? B : "1.5px solid transparent",
												borderRadius: 12,
												background: sel
													? full
														? "#F7D5CC"
														: "#8EDCCB"
													: "transparent",
												color: past ? "#C9C6BF" : full ? "#9A9892" : INK,
												textDecoration: full ? "line-through" : "none",
												...mono,
												fontSize: 15,
												fontWeight: sel ? 800 : 500,
												transition: "background 120ms",
											}}
										>
											{d}
										</button>
									);
								})}
							</div>
						</div>
						<div
							style={{
								display: "flex",
								gap: 14,
								fontSize: 12,
								fontWeight: 600,
								color: "#5F5E5A",
								padding: "0 4px",
							}}
						>
							<span style={{ display: "flex", gap: 6, alignItems: "center" }}>
								<span
									style={{
										width: 12,
										height: 12,
										borderRadius: 4,
										background: "#8EDCCB",
										border: B,
									}}
								/>
								Pilihanmu
							</span>
							<span style={{ display: "flex", gap: 6, alignItems: "center" }}>
								<span style={{ textDecoration: "line-through", ...mono }}>
									17
								</span>
								Penuh
							</span>
						</div>
					</>
				)}
				{ok && !s.calShut && (
					<Notice kind="ok" shadow>
						<b>{x.dateLong}</b> masih tersedia!
					</Notice>
				)}
				{s.date?.full && (
					<Notice kind="bad">
						<b>{x.dateLong}</b> sudah penuh. Coba tanggal lain, ya.
					</Notice>
				)}
			</div>
			{ok && <TimeBlock x={x} />}
		</>
	);
}

const calNav = (op: number): CSSProperties => ({
	width: 44,
	height: 44,
	border: 0,
	borderRadius: 12,
	background: "transparent",
	fontSize: 20,
	opacity: op,
});

function TimeBlock({ x }: { x: Ctx }) {
	const s = x.s;
	const manualUsed = !!s.time && s.time !== "unsure" && !TIMES.includes(s.time);
	const pad = (n: number) => String(n).padStart(2, "0");
	const manualVal = `${pad(x.mH)}:${pad(x.mM)}`;
	const spin = (label: string, v: number, dec: () => void, inc: () => void) => (
		<span style={col(4, { alignItems: "center" })}>
			<span style={{ fontSize: 11, fontWeight: 700, color: "#5F5E5A" }}>
				{label}
			</span>
			<span
				style={{
					display: "flex",
					alignItems: "center",
					border: B,
					borderRadius: 12,
					overflow: "hidden",
					background: "#fff",
					height: 52,
				}}
			>
				<button
					type="button"
					onClick={dec}
					aria-label={`Kurangi ${label}`}
					style={{
						width: 42,
						height: "100%",
						border: 0,
						background: "#fff",
						fontSize: 18,
						fontWeight: 700,
					}}
				>
					−
				</button>
				<span
					style={{
						width: 46,
						textAlign: "center",
						...mono,
						fontSize: 22,
						fontWeight: 600,
					}}
				>
					{pad(v)}
				</span>
				<button
					type="button"
					onClick={inc}
					aria-label={`Tambah ${label}`}
					style={{
						width: 42,
						height: "100%",
						border: 0,
						borderLeft: B,
						background: "#8EDCCB",
						fontSize: 18,
						fontWeight: 700,
					}}
				>
					+
				</button>
			</span>
		</span>
	);
	return (
		<div className="pop" style={col(10, { padding: "4px 16px 140px" })}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					padding: "0 4px",
				}}
			>
				<span style={{ fontSize: 17, fontWeight: 800 }}>Jam mulai</span>
				<span style={{ fontSize: 12, color: "#3A3936" }}>
					Kami cek slot booth-nya
				</span>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(4,minmax(0,1fr))",
					gap: 8,
				}}
			>
				{TIMES.map((t) => (
					<button
						key={t}
						type="button"
						className="shrink"
						aria-pressed={s.time === t}
						onClick={() => x.set({ time: t })}
						style={
							{
								"--s": ".95",
								height: 48,
								border: B,
								borderRadius: 14,
								...opt(s.time === t),
								...mono,
								fontSize: 16,
								fontWeight: 600,
							} as CSSProperties
						}
					>
						{t}
					</button>
				))}
				<button
					type="button"
					onClick={() => x.setManual(true)}
					style={{
						height: 48,
						border: `1.5px dashed ${INK}`,
						borderRadius: 14,
						background: manualUsed ? "#D6F1EA" : "transparent",
						fontSize: 13,
						fontWeight: 800,
						whiteSpace: "nowrap",
					}}
				>
					{manualUsed ? `${s.time} ✓` : "Jam lain"}
				</button>
			</div>
			{x.manual && (
				<div
					className="pop"
					style={col(12, {
						padding: 14,
						border: B,
						borderRadius: 16,
						background: "#fff",
					})}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
						}}
					>
						<span style={{ fontSize: 15, fontWeight: 800 }}>
							Atur jam sendiri
						</span>
						<button
							type="button"
							onClick={() => x.setManual(false)}
							style={link}
						>
							Tutup
						</button>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "flex-end",
							justifyContent: "center",
							gap: 10,
						}}
					>
						{spin(
							"Jam",
							x.mH,
							() => x.setMT((x.mH + 23) % 24, x.mM),
							() => x.setMT((x.mH + 1) % 24, x.mM),
						)}
						<span
							style={{
								...mono,
								fontSize: 24,
								fontWeight: 600,
								paddingBottom: 12,
							}}
						>
							:
						</span>
						{spin(
							"Menit",
							x.mM,
							() => x.setMT(x.mH, (x.mM + 45) % 60),
							() => x.setMT(x.mH, (x.mM + 15) % 60),
						)}
					</div>
					<button
						type="button"
						onClick={() => {
							x.set({ time: manualVal });
							x.setManual(false);
						}}
						style={{
							height: 48,
							border: B,
							borderRadius: 12,
							background: "#D6F1EA",
							fontSize: 15,
							fontWeight: 800,
						}}
					>
						Pakai jam {manualVal}
					</button>
				</div>
			)}
			<button
				type="button"
				aria-pressed={s.time === "unsure"}
				onClick={() => x.set({ time: "unsure" })}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					height: 48,
					padding: "0 14px",
					border: B,
					borderRadius: 16,
					...opt(s.time === "unsure"),
					fontSize: 15,
					fontWeight: 700,
					textAlign: "left",
				}}
			>
				<Clock size={20} strokeWidth={2} />
				Jam belum pasti, nanti dikabari
			</button>
			{x.busy && (
				<Notice kind="bad">
					Slot jam <b>{s.time}</b> sudah terisi di tanggal ini. Pilih jam lain
					atau "Jam belum pasti".
				</Notice>
			)}
		</div>
	);
}

// ── 1c Lokasi ───────────────────────────────────────────────────────────────

/** Isian bernomor vertikal: lingkaran 30px + garis putus-putus. */
function Numbered({
	n,
	ok,
	lock,
	last,
	children,
	pb = 18,
}: {
	n: number;
	ok: boolean;
	lock?: boolean;
	last?: boolean;
	children: ReactNode;
	pb?: number;
}) {
	return (
		<div
			style={{
				display: "flex",
				gap: 14,
				opacity: lock ? 0.4 : 1,
				transition: "opacity 200ms",
			}}
		>
			<div
				style={col(6, { flex: "none", alignItems: "center", paddingTop: 2 })}
			>
				<Dot
					size={30}
					mono
					ok={ok}
					bg={ok ? "#5DB978" : lock ? "#FFFFFF" : INK}
					fg={ok || !lock ? "#FFFFFF" : INK}
				>
					{n}
				</Dot>
				{!last && (
					<span
						style={{
							flex: 1,
							borderLeft: `1.5px dashed ${INK}`,
							minHeight: 20,
						}}
					/>
				)}
			</div>
			<div style={col(8, { flex: 1, minWidth: 0, paddingBottom: pb })}>
				{children}
			</div>
		</div>
	);
}

function Label({
	text,
	right,
	rightMuted = true,
}: {
	text: string;
	right?: ReactNode;
	rightMuted?: boolean;
}) {
	return (
		<span
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "baseline",
				gap: 8,
			}}
		>
			<span style={{ fontSize: 15, fontWeight: 800 }}>{text}</span>
			{right && (
				<span
					style={{
						fontSize: 12,
						fontWeight: 700,
						color: rightMuted ? "#5F5E5A" : INK,
						whiteSpace: "nowrap",
					}}
				>
					{right}
				</span>
			)}
		</span>
	);
}

function CityStep({ x }: { x: Ctx }) {
	const s = x.s;
	const q = [s.venue, s.city].filter(Boolean);
	return (
		<div style={col(6, { padding: "22px 16px 140px" })}>
			<Numbered n={1} ok={s.city.trim().length >= 3}>
				<Label text="Kota" right="Wajib" rightMuted={false} />
				<input
					className="in"
					data-auto
					value={s.city}
					onChange={(e) => x.set({ city: e.target.value })}
					onKeyDown={x.onEnter}
					autoComplete="address-level2"
					enterKeyHint="next"
					placeholder="Contoh: Bogor"
					aria-label="Kota"
					style={inputStyle()}
				/>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
					{CITIES.map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => x.set({ city: c })}
							style={{
								height: 36,
								padding: "0 12px",
								border: B,
								borderRadius: 999,
								background: s.city === c ? "#8EDCCB" : "#FFFFFF",
								fontSize: 13,
								fontWeight: 700,
								transition: "background 120ms",
							}}
						>
							{c}
						</button>
					))}
				</div>
			</Numbered>
			<Numbered n={2} ok={!!s.venue.trim()}>
				<Label text="Nama venue" right="Boleh menyusul" />
				<span style={{ ...sub13, marginTop: -4 }}>
					Nama yang biasa kamu sebut, mis. "Gedung Kirana".
				</span>
				<input
					className="in"
					value={s.venue}
					onChange={(e) => x.set({ venue: e.target.value })}
					onKeyDown={x.onEnter}
					enterKeyHint="next"
					placeholder="Nama gedung, hotel, atau rumah"
					aria-label="Nama venue"
					maxLength={120}
					style={inputStyle()}
				/>
			</Numbered>
			<Numbered n={3} ok={!!s.mapsUrl} last pb={0}>
				<Label text="Lokasi di Google Maps" right="Boleh menyusul" />
				<span style={{ ...sub13, marginTop: -4 }}>
					Nama di Maps kadang beda. Link ini membantu tim kami menemukan
					lokasinya.
				</span>
				{!s.mapsUrl && (
					<>
						<a
							href={x.mapsSearch}
							target="_blank"
							rel="noopener noreferrer"
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								height: 50,
								padding: "0 14px",
								border: B,
								borderRadius: 14,
								background: "#D6F1EA",
								fontSize: 15,
								fontWeight: 400,
								textDecoration: "none",
								boxShadow: layered(4),
							}}
						>
							<MapIcon size={18} strokeWidth={2} />
							<span style={{ flex: 1 }}>
								{q.length
									? `Cari "${q.join(", ")}" di Maps`
									: "Cari di Google Maps"}
							</span>
							<ExternalLink size={16} strokeWidth={2} />
						</a>
						<div style={{ position: "relative" }}>
							<LinkIcon
								size={18}
								strokeWidth={2}
								style={{ position: "absolute", left: 14, top: 17 }}
							/>
							<input
								className="in"
								value={x.mapsIn}
								onChange={(e) => x.onMapsIn(e.target.value)}
								type="url"
								inputMode="url"
								placeholder="Tempel link dari tombol Bagikan"
								aria-label="Link Google Maps"
								style={{
									height: 52,
									border: `1.5px dashed ${INK}`,
									borderRadius: 14,
									background: "#fff",
									padding: "0 14px 0 42px",
									fontSize: 16,
									fontWeight: 600,
									width: "100%",
								}}
							/>
						</div>
						{x.mapsErr && (
							<ErrLine text="Itu bukan link Google Maps. Salin dari tombol Bagikan di Maps." />
						)}
					</>
				)}
				{!!s.mapsUrl && (
					<div
						className="pop"
						style={{
							display: "flex",
							gap: 12,
							alignItems: "center",
							padding: "10px 12px",
							border: B,
							borderRadius: 14,
							background: "#fff",
						}}
					>
						<span
							style={{
								flex: "none",
								width: 44,
								height: 44,
								borderRadius: 10,
								border: B,
								background:
									"repeating-linear-gradient(0deg,transparent 0 9px,#D6D3CC 9px 10px),repeating-linear-gradient(90deg,#D6F1EA 0 9px,#D6D3CC 9px 10px)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<MapPin size={18} strokeWidth={2} />
						</span>
						<span style={col(1, { flex: 1, minWidth: 0 })}>
							<span style={{ fontSize: 14, fontWeight: 800 }}>
								✓ Link Maps tersimpan
							</span>
							<span
								style={{
									...mono,
									fontSize: 11,
									color: "#3A3936",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{s.mapsUrl}
							</span>
						</span>
						<button
							type="button"
							onClick={() => x.set({ mapsUrl: "" })}
							style={{ ...link, flex: "none" }}
						>
							Ganti
						</button>
					</div>
				)}
			</Numbered>
		</div>
	);
}

// ── 2a Paket ────────────────────────────────────────────────────────────────

function PkgStep({ x }: { x: Ctx }) {
	return (
		<div style={col(10, { padding: "20px 16px 140px" })}>
			{x.loadingPkgs
				? [0, 1, 2, 3].map((i) => (
						<div
							key={i}
							style={{ height: 84, borderRadius: 18, background: "#EFEDE8" }}
						/>
					))
				: x.pkgs.map((p, i) => {
						const sel = x.s.pkg === p.category;
						return (
							<div
								key={p.category}
								style={{
									border: B,
									borderRadius: 18,
									...opt(sel),
									overflow: "hidden",
									transition: "background 150ms,box-shadow 150ms",
								}}
							>
								<button
									type="button"
									className="shrink"
									aria-expanded={sel}
									onClick={() => x.pickPkg(p.category)}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 14,
										width: "100%",
										minHeight: 84,
										padding: "12px 14px",
										border: 0,
										background: "transparent",
										textAlign: "left",
									}}
								>
									<IconChip
										icon={p.c.icon}
										tint={p.c.tint}
										size={50}
										radius={14}
										iconSize={24}
									/>
									<span style={col(4, { flex: 1, minWidth: 0 })}>
										{i === 0 && (
											<span
												style={{
													alignSelf: "flex-start",
													height: 22,
													padding: "0 8px",
													border: B,
													borderRadius: 999,
													background: "#F8D98B",
													fontSize: 11,
													fontWeight: 800,
													display: "flex",
													alignItems: "center",
													whiteSpace: "nowrap",
												}}
											>
												{x.recLabel}
											</span>
										)}
										<span
											style={{
												fontSize: 16,
												fontWeight: 800,
												lineHeight: 1.25,
											}}
										>
											{p.c.name}
										</span>
										<span style={{ ...mono, fontSize: 13, color: "#3A3936" }}>
											{p.from}
										</span>
									</span>
									<Dot
										size={24}
										font={12}
										ok={sel}
										ring={sel ? INK : "#D6D3CC"}
									/>
								</button>
								{sel && (
									<div className="only-m">
										<div
											className="pop"
											style={col(10, { padding: "0 14px 16px" })}
										>
											<div style={{ borderTop: `1.5px dashed ${INK}` }} />
											<span style={{ fontSize: 14, lineHeight: 1.5 }}>
												{p.c.desc}
											</span>
											<Points points={p.c.points} />
											<span style={{ fontSize: 13, color: "#3A3936" }}>
												<b>Cocok untuk:</b> {p.c.fit}
											</span>
										</div>
									</div>
								)}
							</div>
						);
					})}
		</div>
	);
}

function Points({
	points,
	size = 13,
	gap = 4,
}: {
	points: string[];
	size?: number;
	gap?: number;
}) {
	return (
		<div style={col(gap)}>
			{points.map((pt) => (
				<span
					key={pt}
					style={{
						display: "flex",
						gap: 8,
						fontSize: size,
						lineHeight: 1.4,
						color: "#3A3936",
					}}
				>
					<span style={{ flex: "none", color: INK, fontWeight: 800 }}>✓</span>
					{pt}
				</span>
			))}
		</div>
	);
}

// ── 2b Durasi + unit ────────────────────────────────────────────────────────

function DurStep({ x }: { x: Ctx }) {
	const s = x.s;
	const p = x.pk;
	if (!p) return null;
	return (
		<div style={col(16, { padding: "20px 16px 140px" })}>
			<div
				style={{
					display: "flex",
					gap: 14,
					alignItems: "flex-start",
					padding: 14,
					border: B,
					borderRadius: 18,
					background: "#fff",
				}}
			>
				<IconChip icon={p.c.icon} tint={p.c.tint} />
				<div style={col(6, { minWidth: 0 })}>
					<span style={{ fontSize: 16, fontWeight: 800 }}>{p.c.name}</span>
					<Points points={p.c.points} gap={6} />
				</div>
			</div>
			<div style={col(8)}>
				{p.options.map((o) => (
					<button
						key={o.hours}
						type="button"
						className="shrink"
						aria-pressed={s.dur === o.hours}
						onClick={() => x.set({ dur: o.hours })}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 14,
							height: 58,
							padding: "0 16px",
							border: B,
							borderRadius: 16,
							...opt(s.dur === o.hours),
						}}
					>
						<span style={{ fontSize: 16, fontWeight: 800 }}>{o.hours} jam</span>
						<span style={{ ...mono, fontSize: 16, fontWeight: 600 }}>
							{x.rp(o.price * s.units)}
						</span>
					</button>
				))}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					padding: "12px 14px",
					border: `1.5px dashed ${INK}`,
					borderRadius: 16,
				}}
			>
				<span style={col(2, { flex: 1 })}>
					<span style={{ fontSize: 15, fontWeight: 800 }}>Jumlah booth</span>
					<span style={{ fontSize: 13, color: "#3A3936" }}>
						Untuk acara besar, maks 3 spot.
					</span>
				</span>
				<Stepper
					label="jumlah booth"
					value={s.units}
					onDec={() => x.set({ units: Math.max(1, s.units - 1) })}
					onInc={() => x.set({ units: Math.min(3, s.units + 1) })}
					decOff={s.units <= 1}
					incOff={s.units >= 3}
				/>
			</div>
		</div>
	);
}

// ── 2c Format cetak + backdrop ──────────────────────────────────────────────

function FmtStep({ x }: { x: Ctx }) {
	const s = x.s;
	return (
		<>
			<div style={col(10, { padding: "20px 16px 0" })}>
				<div className="only-m">
					<div
						style={col(10, {
							border: B,
							borderRadius: 18,
							background: "#fff",
							padding: "14px 14px 12px",
							marginBottom: 4,
						})}
					>
						<span style={{ fontSize: 13, fontWeight: 800 }}>
							Bandingkan ukuran asli
						</span>
						<div
							style={{
								display: "flex",
								alignItems: "flex-end",
								justifyContent: "center",
								gap: 14,
								height: 150,
								borderBottom: B,
								paddingBottom: 8,
								position: "relative",
							}}
						>
							<Ruler size={10} left={5} />
							{FMTS.map(([k], i) => (
								<div
									key={k}
									className="drop"
									style={
										{
											"--i": i,
											opacity: x.fmtOp(k),
											transition: "opacity 200ms",
										} as CSSProperties
									}
								>
									<PrintPreview {...x.pv} fmt={k} zoom={0.42} rot="0deg" />
								</div>
							))}
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(3,minmax(0,1fr))",
								gap: 8,
								textAlign: "center",
								...mono,
								fontSize: 11,
							}}
						>
							<span>5 × 15 cm</span>
							<span>10 × 15 cm</span>
							<span>bingkai polaroid</span>
						</div>
					</div>
				</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(3,minmax(0,1fr))",
						gap: 10,
					}}
				>
					{FMTS.map(([k, label]) => (
						<button
							key={k}
							type="button"
							className="shrink"
							aria-pressed={s.fmt === k}
							onClick={() => x.set({ fmt: k })}
							style={
								{
									"--s": ".96",
									display: "flex",
									flexDirection: "column",
									padding: 0,
									border: B,
									borderRadius: 18,
									overflow: "hidden",
									...opt(s.fmt === k),
								} as CSSProperties
							}
						>
							<span
								style={{
									height: 156,
									width: "100%",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									borderBottom: B,
									background: "#FCE3C6",
								}}
							>
								<PrintPreview {...x.pv} fmt={k} zoom={0.38} rot="0deg" />
							</span>
							<span
								style={{
									padding: "12px 6px",
									fontSize: 15,
									fontWeight: 800,
									textAlign: "center",
									width: "100%",
								}}
							>
								{label}
							</span>
						</button>
					))}
				</div>
				{s.fmt && s.fmt !== "later" && (
					<div
						className="pop"
						style={{
							padding: "12px 14px",
							border: B,
							borderRadius: 16,
							background: "#FFFFFF",
							fontSize: 14,
							lineHeight: 1.5,
						}}
					>
						<b>
							{FMTS.find((f) => f[0] === s.fmt)?.[1]} · {FMTD[s.fmt as Fmt][0]}
						</b>{" "}
						· {FMTD[s.fmt as Fmt][1]}
					</div>
				)}
				<button
					type="button"
					aria-pressed={s.fmt === "later"}
					onClick={() => x.set({ fmt: "later" })}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						height: 56,
						border: B,
						borderRadius: 16,
						...opt(s.fmt === "later"),
						fontSize: 15,
						fontWeight: 700,
					}}
				>
					Belum tahu, nanti saja
				</button>
				<span style={{ fontSize: 13, color: "#5F5E5A", textAlign: "center" }}>
					Harga tidak berubah. Harga mengikuti durasi.
				</span>
			</div>
			<BackdropBlock x={x} />
		</>
	);
}

export function Ruler({ size, left }: { size: number; left: number }) {
	return (
		<>
			<span
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					bottom: size === 10 ? 8 : 12,
					borderLeft: `1.5px dashed ${INK}`,
				}}
			/>
			<span
				style={{
					position: "absolute",
					left,
					top: size === 10 ? 0 : 2,
					...mono,
					fontSize: size,
				}}
			>
				15 cm
			</span>
		</>
	);
}

function BackdropBlock({ x, standalone }: { x: Ctx; standalone?: boolean }) {
	const s = x.s;
	const bdName = BD_COLORS.find((c) => c[0] === s.bdColor)?.[1];
	return (
		<div style={col(10, { padding: "22px 16px 140px" })}>
			{!standalone && (
				<div
					style={col(2, {
						padding: "14px 4px 2px",
						borderTop: `1.5px dashed ${INK}`,
					})}
				>
					<span style={{ fontSize: 17, fontWeight: 800 }}>Backdrop</span>
					<span style={{ fontSize: 13, color: "#3A3936" }}>
						Latar di belakang booth. Pakai punya siapa?
					</span>
				</div>
			)}
			{BACKDROPS.map((b) => (
				<Fragment key={b.k}>
					<button
						type="button"
						className="shrink"
						aria-pressed={s.backdrop === b.k}
						onClick={() =>
							x.pick({ backdrop: b.k }, !!standalone && b.k !== "tetra")
						}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 14,
							minHeight: 76,
							padding: "12px 14px",
							border: B,
							borderRadius: 18,
							...opt(s.backdrop === b.k),
							textAlign: "left",
						}}
					>
						<IconChip icon={b.icon} tint={b.tint} />
						<span style={col(2, { flex: 1 })}>
							<span style={{ fontSize: 15, fontWeight: 800 }}>{b.label}</span>
							<span style={sub13}>{b.sub}</span>
						</span>
					</button>
					{b.k === "tetra" && s.backdrop === "tetra" && (
						<div
							className="pop"
							style={col(12, {
								padding: 14,
								border: B,
								borderRadius: 18,
								background: "#fff",
							})}
						>
							<span
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "baseline",
									gap: 8,
								}}
							>
								<span style={{ fontSize: 15, fontWeight: 800 }}>
									Warna kain
								</span>
								<span style={{ fontSize: 13, fontWeight: 700 }}>
									{bdName ?? "Belum dipilih"}
								</span>
							</span>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(3,minmax(0,1fr))",
									gap: 10,
								}}
							>
								{BD_COLORS.map(([k, label, hex]) => {
									const sel = s.bdColor === k;
									return (
										<button
											key={k}
											type="button"
											aria-label={label}
											aria-pressed={sel}
											onClick={() => x.set({ bdColor: k })}
											style={{
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
												gap: 6,
												padding: 0,
												border: 0,
												background: "transparent",
											}}
										>
											<span
												style={{
													position: "relative",
													width: "100%",
													height: 64,
													borderRadius: 12,
													border: B,
													background: `repeating-linear-gradient(90deg,rgba(0,0,0,0) 0 9px,rgba(0,0,0,.10) 9px 13px,rgba(255,255,255,.14) 13px 16px),${hex}`,
													boxShadow: sel
														? "0 0 0 3px #F8F7F4,0 0 0 4.5px #1D1D1B"
														: "none",
													transition: "box-shadow 150ms",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													color: ["white", "silver", "gold"].includes(k)
														? INK
														: "#FFFFFF",
													fontSize: 18,
													fontWeight: 800,
												}}
											>
												{sel ? "✓" : ""}
											</span>
											<span
												style={{
													fontSize: 12,
													fontWeight: sel ? 800 : 600,
													textAlign: "center",
													lineHeight: 1.2,
												}}
											>
												{label}
											</span>
										</button>
									);
								})}
							</div>
							<span style={{ fontSize: 12, lineHeight: 1.4, color: "#3A3936" }}>
								Warna di layar bisa sedikit berbeda dengan kain aslinya.
							</span>
						</div>
					)}
				</Fragment>
			))}
		</div>
	);
}

// ── 3 Tambahan ──────────────────────────────────────────────────────────────

function AddStep({ x }: { x: Ctx }) {
	return (
		<div style={col(10, { padding: "20px 16px 140px" })}>
			{x.adds.map((a) => {
				const n = x.s.adds[a.id] ?? 0;
				const open = x.addOpen === a.id;
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: hover hanya mengganti penjelasan di panel kiri desktop; tombol "Apa ini?" setara untuk keyboard.
					<div
						key={a.id}
						onMouseEnter={() => x.setAddFocus(a.id)}
						style={{
							display: "flex",
							gap: 12,
							alignItems: "flex-start",
							padding: 12,
							border: B,
							borderRadius: 18,
							background: n ? "#D6F1EA" : "#FFFFFF",
							boxShadow: n ? SEL : "none",
							transition: "background 150ms,box-shadow 150ms",
						}}
					>
						<IconChip
							icon={a.c.icon}
							tint={a.c.tint}
							size={44}
							radius={12}
							iconSize={21}
						/>
						<span style={col(2, { flex: 1, minWidth: 0 })}>
							<span style={{ fontSize: 15, fontWeight: 800 }}>{a.c.name}</span>
							<span
								style={{ fontSize: 13, lineHeight: 1.35, color: "#3A3936" }}
							>
								{a.c.benefit}
							</span>
							<span
								style={{
									display: "flex",
									gap: "4px 10px",
									alignItems: "center",
									flexWrap: "wrap",
									marginTop: 2,
								}}
							>
								<span style={{ ...mono, fontSize: 12 }}>{a.priceLine}</span>
								<button
									type="button"
									aria-expanded={open}
									onClick={() => {
										x.setAddOpen(open ? null : a.id);
										x.setAddFocus(a.id);
									}}
									style={{
										...link,
										whiteSpace: "nowrap",
										padding: "4px 0",
										fontSize: 12,
										textUnderlineOffset: 2,
									}}
								>
									{open ? "Tutup" : "Apa ini?"}
								</button>
							</span>
							{open && (
								<span
									className="pop"
									style={{
										marginTop: 6,
										padding: "10px 12px",
										border: `1.5px dashed ${INK}`,
										borderRadius: 12,
										background: "#fff",
										fontSize: 13,
										lineHeight: 1.5,
									}}
								>
									{a.c.desc}
								</span>
							)}
						</span>
						{n === 0 ? (
							<button
								type="button"
								className="shrink"
								aria-label={`Tambah ${a.c.name}`}
								onClick={() => x.setAdd(a.id, a.min)}
								style={
									{
										"--s": ".92",
										flex: "none",
										width: 44,
										height: 44,
										border: B,
										borderRadius: 12,
										background: "#fff",
										fontSize: 20,
										fontWeight: 700,
									} as CSSProperties
								}
							>
								+
							</button>
						) : (
							<Stepper
								label={a.c.name}
								value={n}
								w={36}
								numW={24}
								onDec={() => x.setAdd(a.id, n - 1 < a.min ? 0 : n - 1)}
								onInc={() => x.setAdd(a.id, n + 1)}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ── 4a Nama di cetakan ──────────────────────────────────────────────────────

function TitleStep({ x }: { x: Ctx }) {
	const s = x.s;
	const err =
		x.touched.title && s.title.trim().length < 2
			? "Isi nama yang mau tercetak, ya."
			: "";
	return (
		<div style={col(14, { padding: "20px 16px 140px" })}>
			<div style={{ position: "relative" }}>
				<input
					className="in"
					data-auto
					value={s.title}
					onChange={(e) => x.set({ title: e.target.value })}
					onBlur={() => x.touch("title")}
					onKeyDown={x.onEnter}
					maxLength={40}
					enterKeyHint="next"
					placeholder={x.ev ? `Contoh: ${x.ev.ph}` : "Contoh: Rina & Dimas"}
					aria-label="Nama di cetakan"
					aria-invalid={!!err}
					style={{
						height: 60,
						border: `1.5px solid ${err ? "#E8836F" : INK}`,
						borderRadius: 16,
						background: "#fff",
						padding: "0 64px 0 16px",
						fontSize: 19,
						fontWeight: 700,
						width: "100%",
					}}
				/>
				<span
					style={{
						position: "absolute",
						right: 14,
						top: 21,
						...mono,
						fontSize: 12,
						color: "#5F5E5A",
					}}
				>
					{s.title.length}/40
				</span>
			</div>
			{err && <ErrLine text={err} size={14} />}
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					alignItems: "center",
				}}
			>
				<span style={{ fontSize: 13, fontWeight: 700, color: "#5F5E5A" }}>
					Contoh:
				</span>
				{(x.ev?.ideas ?? ["Rina & Dimas", "The Wedding of R & D"]).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => x.set({ title: t })}
						style={{
							height: 38,
							padding: "0 14px",
							border: `1.5px dashed ${INK}`,
							borderRadius: 999,
							background: "#fff",
							fontSize: 13,
							fontWeight: 700,
							whiteSpace: "nowrap",
						}}
					>
						{t}
					</button>
				))}
			</div>
			<div className="only-m">
				<div
					style={{
						marginTop: 4,
						border: B,
						borderRadius: 22,
						background: "#FCE3C6",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							height: 350,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<div key={x.pvKey} className={x.bumpCls}>
							<PrintPreview
								{...x.pv}
								fmt={x.pvTitleFmt}
								zoom={0.94}
								rot="-2deg"
							/>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							borderTop: B,
							background: "#fff",
							height: 46,
						}}
					>
						{FMTS.map(([k, l], j) => (
							<button
								key={k}
								type="button"
								aria-pressed={x.pvTitleFmt === k}
								onClick={() => x.setPvAlt(k)}
								style={{
									flex: 1,
									border: 0,
									borderLeft: j ? B : "0",
									background: x.pvTitleFmt === k ? "#CEC8F6" : "#FFFFFF",
									fontSize: 13,
									fontWeight: 800,
								}}
							>
								{l}
							</button>
						))}
					</div>
				</div>
			</div>
			<div
				style={col(0, {
					border: B,
					borderRadius: 18,
					background: "#fff",
					padding: "6px 14px",
				})}
			>
				<span style={{ fontSize: 13, fontWeight: 800, padding: "8px 0 4px" }}>
					Yang tercetak di frame
				</span>
				{[
					{
						n: "1",
						bg: "#F8D98B",
						t: "Nama acara",
						s: s.title
							? `“${s.title}”, dari isian ini.`
							: "Dari isian di atas.",
					},
					{
						n: "2",
						bg: "#CEC8F6",
						t: "Tanggal",
						s: x.dShort
							? `Otomatis: ${x.dShort}.`
							: "Otomatis dari langkah Acaramu.",
					},
					{
						n: "3",
						bg: "#D6EEF8",
						t: "Desain frame",
						s: "Warna dan ornamen dibuat tim Tetra sesuai temamu.",
					},
				].map((r) => (
					<div
						key={r.n}
						style={{
							display: "flex",
							gap: 12,
							alignItems: "flex-start",
							padding: "10px 0",
							borderTop: "1.5px dashed #D6D3CC",
						}}
					>
						<Dot size={24} font={11} mono bg={r.bg}>
							{r.n}
						</Dot>
						<span style={col(2)}>
							<span style={{ fontSize: 14, fontWeight: 800 }}>{r.t}</span>
							<span style={sub13}>{r.s}</span>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ── 4b Intip desain ─────────────────────────────────────────────────────────

function DesignStep({ x }: { x: Ctx }) {
	return (
		<div style={col(14, { padding: "20px 16px 140px" })}>
			<div className="only-m">
				<div style={col(8)}>
					<span style={{ fontSize: 13, fontWeight: 800 }}>
						Intip katalog template
					</span>
					<div
						className="noscroll"
						style={{
							display: "flex",
							gap: 10,
							overflowX: "auto",
							margin: "0 -16px",
							padding: "2px 16px 8px",
						}}
					>
						{THEMES.map(([k, l]) => (
							<button
								key={k}
								type="button"
								aria-pressed={x.s.theme === k}
								onClick={() => x.set({ theme: k })}
								style={{
									flex: "none",
									width: 112,
									display: "flex",
									flexDirection: "column",
									padding: 0,
									border: B,
									borderRadius: 16,
									overflow: "hidden",
									...opt(x.s.theme === k),
								}}
							>
								<span
									style={{
										height: 150,
										width: "100%",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										background: "#F8F7F4",
										borderBottom: B,
									}}
								>
									<PrintPreview
										{...x.pv}
										fmt={x.pvTitleFmt}
										theme={k}
										zoom={0.38}
										rot="0deg"
									/>
								</span>
								<span
									style={{
										padding: "9px 6px",
										fontSize: 13,
										fontWeight: 800,
										textAlign: "center",
										width: "100%",
									}}
								>
									{l}
								</span>
							</button>
						))}
					</div>
				</div>
			</div>
			<div style={col(10)}>
				<InfoCard
					icon={LayoutTemplate}
					tint="#CEC8F6"
					t="Pilih dari katalog"
					s="Template siap pakai. Tinggal pilih, nama dan tanggalmu otomatis masuk."
				/>
				<InfoCard
					icon={Palette}
					tint="#FCE3C6"
					t="Desain custom"
					s="Ceritakan tema, warna, atau kirim referensi. Tim desain Tetra yang membuatkan."
				/>
			</div>
			<div
				style={{
					display: "flex",
					gap: 12,
					alignItems: "center",
					padding: "12px 14px",
					border: B,
					borderRadius: 16,
					background: "#F8D98B",
				}}
			>
				<LockKeyhole size={20} strokeWidth={2} style={{ flex: "none" }} />
				<span style={{ fontSize: 13, lineHeight: 1.45 }}>
					<b>Terbuka setelah DP.</b> Diatur dari dashboard booking kamu.
				</span>
			</div>
		</div>
	);
}

function InfoCard({
	icon,
	tint,
	t,
	s,
}: {
	icon: typeof Palette;
	tint: string;
	t: string;
	s: string;
}) {
	return (
		<div
			style={{
				display: "flex",
				gap: 14,
				alignItems: "flex-start",
				padding: 14,
				border: B,
				borderRadius: 18,
				background: "#fff",
			}}
		>
			<IconChip icon={icon} tint={tint} />
			<span style={col(3)}>
				<span style={{ fontSize: 15, fontWeight: 800 }}>{t}</span>
				<span style={{ fontSize: 13, lineHeight: 1.45, color: "#3A3936" }}>
					{s}
				</span>
			</span>
		</div>
	);
}

// ── 4e Intip dashboard ──────────────────────────────────────────────────────

export const DASH_TILES = [
	{
		icon: Palette,
		badge: "Setelah DP",
		t: "Pilih desain frame",
		bg: "#CEC8F6",
	},
	{ icon: ListChecks, badge: "0/3", t: "Lengkapi data", bg: "#FFFFFF" },
	{ icon: Wallet, badge: "DP", t: "Pembayaran", bg: "#F8D98B" },
	{ icon: Images, badge: "H+1", t: "Galeri foto acara", bg: "#D6EEF8" },
];

function DashStep({ x }: { x: Ctx }) {
	const list = [
		{
			icon: Palette,
			tint: "#CEC8F6",
			t: "Desain frame",
			s: "Pilih template atau ajukan desain custom, lalu setujui hasilnya.",
			badge: "Setelah DP",
			badgeBg: "#F8D98B",
		},
		{
			icon: ListChecks,
			tint: "#D6F1EA",
			t: "Lengkapi data acara",
			s: "Venue, PIC hari H, rundown. Isi bertahap, tersimpan otomatis.",
			badge: "Langsung",
			badgeBg: "#D6F1EA",
		},
		{
			icon: Wallet,
			tint: "#FCE3C6",
			t: "DP & pelunasan",
			s: "Lihat tagihan dan unggah bukti transfer.",
			badge: "Langsung",
			badgeBg: "#D6F1EA",
		},
		{
			icon: Images,
			tint: "#D6EEF8",
			t: "Galeri foto acara",
			s: "Semua foto booth bisa dilihat dan diunduh setelah acara.",
			badge: "Setelah acara",
			badgeBg: "#FFFFFF",
		},
	];
	return (
		<div style={col(14, { padding: "20px 16px 140px" })}>
			<div className="only-m">
				<div
					style={{
						border: B,
						borderRadius: 20,
						background: "#fff",
						overflow: "hidden",
						boxShadow: layered(4),
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							padding: "12px 14px",
							background: "#FCE3C6",
							borderBottom: B,
						}}
					>
						<span style={col(1)}>
							<span style={{ fontSize: 11, fontWeight: 700, color: "#3A3936" }}>
								DASHBOARD BOOKING
							</span>
							<span style={{ fontSize: 15, fontWeight: 800 }}>
								{x.dashTitle}
							</span>
						</span>
						<span
							style={{
								flex: "none",
								...mono,
								fontSize: 11,
								padding: "3px 8px",
								border: B,
								borderRadius: 999,
								background: "#fff",
								whiteSpace: "nowrap",
							}}
						>
							{x.dashCountdown}
						</span>
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(2,minmax(0,1fr))",
							gap: 8,
							padding: 10,
						}}
					>
						{DASH_TILES.map((t) => (
							<div
								key={t.t}
								style={col(8, {
									padding: 10,
									border: B,
									borderRadius: 12,
									background: t.bg,
								})}
							>
								<span
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
									}}
								>
									<t.icon size={18} strokeWidth={2} />
									<span style={{ fontSize: 10, fontWeight: 800 }}>
										{t.badge}
									</span>
								</span>
								<span
									style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25 }}
								>
									{t.t}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
			<div
				style={col(0, {
					border: B,
					borderRadius: 18,
					background: "#fff",
					padding: "4px 14px",
				})}
			>
				{list.map((r, i) => (
					<div
						key={r.t}
						style={{
							display: "flex",
							gap: 12,
							alignItems: "flex-start",
							padding: "12px 0",
							borderBottom: i < list.length - 1 ? "1.5px dashed #D6D3CC" : "0",
						}}
					>
						<IconChip
							icon={r.icon}
							tint={r.tint}
							size={38}
							radius={11}
							iconSize={18}
						/>
						<span style={col(2, { flex: 1 })}>
							<span
								style={{
									display: "flex",
									justifyContent: "space-between",
									gap: 8,
									alignItems: "center",
								}}
							>
								<span style={{ fontSize: 15, fontWeight: 800 }}>{r.t}</span>
								<span
									style={{
										flex: "none",
										fontSize: 11,
										fontWeight: 800,
										padding: "2px 8px",
										border: B,
										borderRadius: 999,
										background: r.badgeBg,
										whiteSpace: "nowrap",
									}}
								>
									{r.badge}
								</span>
							</span>
							<span style={sub13}>{r.s}</span>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ── 4c Kontak + WO ──────────────────────────────────────────────────────────

function WaInput({
	value,
	onChange,
	onBlur,
	bc = INK,
	h = 54,
	r = 14,
	fs = 17,
	fw = 700,
	extra,
}: {
	value: string;
	onChange: (v: string) => void;
	onBlur?: () => void;
	bc?: string;
	h?: number;
	r?: number;
	fs?: number;
	fw?: number;
	extra?: Record<string, unknown>;
}) {
	return (
		<div style={{ position: "relative" }}>
			<span
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					bottom: 0,
					width: 62,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					...mono,
					fontSize: 16,
					fontWeight: 600,
					borderRight: "1.5px solid #D6D3CC",
					pointerEvents: "none",
				}}
			>
				+62
			</span>
			<input
				className="in"
				type="tel"
				inputMode="tel"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={onBlur}
				placeholder="812 3456 7890"
				{...extra}
				style={{
					height: h,
					border: `1.5px solid ${bc}`,
					borderRadius: r,
					background: "#fff",
					padding: "0 14px 0 76px",
					...mono,
					fontSize: fs,
					fontWeight: fw,
					width: "100%",
				}}
			/>
		</div>
	);
}

function ContactStep({ x }: { x: Ctx }) {
	const igList = parseInstagram(x.s.ig);
	const s = x.s;
	const v = x.v;
	const T = x.touched;
	const fErr = (k: "name" | "wa" | "email", msg: string) =>
		T[k] && !v[k] ? msg : "";
	const nameErr = fErr("name", "Nama belum diisi.");
	const waErr = fErr("wa", "Nomor WhatsApp belum valid. Contoh: 812 3456 7890");
	const emailErr = fErr(
		"email",
		"Format email belum benar. Contoh: nama@email.com",
	);
	const waLock = !v.name;
	const emailLock = !(v.name && v.wa);
	return (
		<>
			<div style={col(6, { padding: "22px 16px 0" })}>
				<Numbered n={1} ok={v.name}>
					<Label text="Nama kamu" />
					<span style={{ ...sub13, marginTop: -4 }}>
						Pemesan sekaligus pemilik acara.
					</span>
					<input
						className="in"
						data-auto
						data-field="name"
						autoComplete="name"
						enterKeyHint="next"
						placeholder="Nama lengkap"
						aria-label="Nama kamu"
						aria-invalid={!!nameErr}
						value={s.name}
						maxLength={80}
						onChange={(e) => x.set({ name: e.target.value })}
						onBlur={() => x.touch("name")}
						onKeyDown={x.onEnter}
						style={inputStyle(nameErr ? "#E8836F" : INK)}
					/>
					{nameErr && <ErrLine text={nameErr} />}
				</Numbered>
				<Numbered n={2} ok={v.wa} lock={waLock}>
					<Label
						text="Nomor WhatsApp"
						right={x.verifiedNow ? "✓ Terverifikasi" : undefined}
						rightMuted={false}
					/>
					<span style={{ ...sub13, marginTop: -4 }}>
						Kode verifikasi dan semua kabar booking dikirim ke sini.
					</span>
					<WaInput
						value={s.wa}
						onChange={(wa) => x.set({ wa })}
						onBlur={() => x.touch("wa")}
						bc={waErr ? "#E8836F" : INK}
						extra={{
							"data-field": "wa",
							autoComplete: "tel-national",
							enterKeyHint: "next",
							disabled: waLock,
							onKeyDown: x.onEnter,
							"aria-label": "Nomor WhatsApp",
							"aria-invalid": !!waErr,
						}}
					/>
					{waErr && <ErrLine text={waErr} />}
				</Numbered>
				<Numbered n={3} ok={!!s.email.trim() && v.email} lock={emailLock}>
					<Label text="Email" right="Opsional" />
					<span style={{ ...sub13, marginTop: -4 }}>
						Untuk kirim invoice dan kuitansi.
					</span>
					<input
						className="in"
						data-field="email"
						type="email"
						inputMode="email"
						autoComplete="email"
						enterKeyHint="next"
						placeholder="nama@email.com"
						aria-label="Email"
						aria-invalid={!!emailErr}
						disabled={emailLock}
						value={s.email}
						maxLength={120}
						onChange={(e) => x.set({ email: e.target.value })}
						onBlur={() => x.touch("email")}
						onKeyDown={x.onEnter}
						style={inputStyle(emailErr ? "#E8836F" : INK)}
					/>
					{emailErr && <ErrLine text={emailErr} />}
				</Numbered>
				<Numbered n={4} ok={igList.length > 0} lock={emailLock} last pb={4}>
					<Label text="Instagram" right="Opsional" />
					<span style={{ ...sub13, marginTop: -4 }}>
						IG pengantin, perusahaan/acara, atau WO/EO. Di halaman foto, tamu
						diarahkan untuk <b>follow dan tag akun ini</b> saat upload ke story,
						jadi acaramu ikut ramai di Instagram.
					</span>
					<input
						className="in"
						data-field="ig"
						autoComplete="off"
						autoCapitalize="none"
						enterKeyHint="done"
						placeholder="@rinadimas @bahagia.organizer"
						aria-label="Instagram"
						disabled={emailLock}
						value={s.ig}
						maxLength={240}
						onChange={(e) => x.set({ ig: e.target.value })}
						onBlur={() => x.set({ ig: igList.map((h) => `@${h}`).join(" ") })}
						onKeyDown={x.onEnter}
						style={{ ...inputStyle(), ...mono, fontSize: 16 }}
					/>
					<span style={{ fontSize: 12, color: "#5F5E5A" }}>
						Boleh lebih dari satu (maks. 6). Akun ini ditampilkan di halaman
						foto tamu.
					</span>
				</Numbered>
				<div
					style={{
						display: "flex",
						gap: 10,
						alignItems: "flex-start",
						marginTop: 10,
						padding: "12px 14px",
						border: `1.5px dashed ${INK}`,
						borderRadius: 14,
						background: "#D6EEF8",
						fontSize: 13,
						lineHeight: 1.45,
					}}
				>
					<ShieldCheck
						size={18}
						strokeWidth={2}
						style={{ flex: "none", marginTop: 1 }}
					/>
					<span>Datamu hanya dipakai untuk booking ini. Tidak ada spam.</span>
				</div>
				{x.verifyErr && <ErrLine text={x.verifyErr} size={14} />}
			</div>
			<div style={col(10, { padding: "20px 16px 140px" })}>
				<div
					style={col(2, {
						padding: "14px 4px 2px",
						borderTop: `1.5px dashed ${INK}`,
					})}
				>
					<span
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "baseline",
						}}
					>
						<span style={{ fontSize: 17, fontWeight: 800 }}>
							Kamu memesan sebagai…
						</span>
						<span style={{ fontSize: 12, fontWeight: 700, color: "#5F5E5A" }}>
							Opsional
						</span>
					</span>
				</div>
				{(
					[
						{
							k: "no",
							label: "Pemilik acara / keluarga",
							sub: "Aku sendiri yang punya acara.",
							icon: House,
							tint: "#FCE3C6",
						},
						{
							k: "yes",
							label: "WO / vendor",
							sub: "Memesan untuk klien.",
							icon: Store,
							tint: "#CEC8F6",
						},
					] as const
				).map((o) => (
					<button
						key={o.k}
						type="button"
						aria-pressed={s.wo === o.k}
						onClick={() => x.set({ wo: s.wo === o.k ? null : o.k })}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 14,
							minHeight: 72,
							padding: "12px 14px",
							border: B,
							borderRadius: 18,
							...opt(s.wo === o.k),
							textAlign: "left",
							transition: "background 150ms,box-shadow 150ms",
						}}
					>
						<IconChip icon={o.icon} tint={o.tint} />
						<span style={col(2, { flex: 1 })}>
							<span style={{ fontSize: 15, fontWeight: 800 }}>{o.label}</span>
							<span style={{ fontSize: 13, color: "#3A3936" }}>{o.sub}</span>
						</span>
					</button>
				))}
				{s.wo === "yes" && (
					<div
						className="pop"
						style={col(14, {
							marginTop: 6,
							padding: 16,
							border: B,
							borderRadius: 18,
							background: "#fff",
						})}
					>
						<div style={col(8)}>
							<label
								htmlFor="bk-wo-name"
								style={{ fontSize: 14, fontWeight: 700 }}
							>
								Nama usaha WO / vendor
							</label>
							<input
								id="bk-wo-name"
								className="in"
								value={s.woName}
								maxLength={120}
								onChange={(e) => x.set({ woName: e.target.value })}
								placeholder="Contoh: Bahagia Organizer"
								style={{
									height: 52,
									border: B,
									borderRadius: 12,
									background: "#fff",
									padding: "0 14px",
									fontSize: 16,
									fontWeight: 600,
									width: "100%",
								}}
							/>
						</div>
						<div style={col(8)}>
							<span style={{ fontSize: 14, fontWeight: 700 }}>
								WhatsApp klien / pengantin
							</span>
							<WaInput
								value={s.woWa}
								onChange={(woWa) => x.set({ woWa })}
								h={52}
								r={12}
								fs={16}
								fw={600}
								extra={{ "aria-label": "WhatsApp klien" }}
							/>
							<span style={{ fontSize: 13, color: "#5F5E5A" }}>
								Klien ikut dikabari soal booking ini.
							</span>
						</div>
					</div>
				)}
			</div>
		</>
	);
}

// ── 4d Verifikasi (klien mengirim kode ke WA Tetra — DR-027) ────────────────

function OtpStep({ x }: { x: Ctx }) {
	const o = x.otp;
	const chars = (o.code ?? "")
		.replace(/^TP-/, "")
		.padEnd(6, " ")
		.slice(0, 6)
		.split("");
	const emailMode = o.mode === "email";
	return (
		<div style={col(16, { padding: "20px 16px 140px" })}>
			{emailMode ? (
				<label
					style={{
						position: "relative",
						display: "grid",
						gridTemplateColumns: "repeat(6,minmax(0,1fr))",
						gap: 8,
						cursor: "text",
					}}
				>
					{Array.from({ length: 6 }, (_, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: 6 kotak kode tetap.
							key={i}
							style={{
								height: 60,
								border: `1.5px solid ${o.state === "wrong" ? "#E8836F" : INK}`,
								borderRadius: 14,
								background: "#fff",
								boxShadow:
									i === Math.min(o.typed.length, 5) && o.state !== "ok"
										? "0 0 0 3px #8EDCCB"
										: "none",
								...mono,
								fontSize: 24,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								transition: "box-shadow 120ms",
							}}
						>
							{o.typed[i] ?? ""}
						</span>
					))}
					<input
						data-auto
						value={o.typed}
						onChange={(e) => x.onEmailCode(e.target.value)}
						inputMode="numeric"
						autoComplete="one-time-code"
						maxLength={6}
						aria-label="Kode verifikasi"
						style={{
							position: "absolute",
							inset: 0,
							opacity: 0,
							fontSize: 16,
							width: "100%",
						}}
					/>
				</label>
			) : (
				<output
					aria-label={`Kode verifikasi ${o.code ?? ""}`}
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(6,minmax(0,1fr))",
						gap: 8,
					}}
				>
					{chars.map((ch, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: 6 kotak kode tetap.
							key={i}
							style={{
								height: 60,
								border: B,
								borderRadius: 14,
								background: "#fff",
								...mono,
								fontSize: 24,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							{ch.trim()}
						</span>
					))}
				</output>
			)}
			{o.state === "wrong" && (
				<ErrLine
					text="Kodenya belum cocok. Cek lagi pesan WhatsApp-nya."
					size={14}
				/>
			)}
			{o.state === "expired" && (
				<div
					style={{
						display: "flex",
						gap: 12,
						alignItems: "center",
						padding: "12px 14px",
						border: B,
						borderRadius: 16,
						background: "#F7D5CC",
						fontSize: 14,
						lineHeight: 1.4,
					}}
				>
					<span style={{ flex: 1 }}>Kodenya sudah kedaluwarsa.</span>
					<button
						type="button"
						onClick={x.resend}
						style={{
							flex: "none",
							height: 40,
							padding: "0 14px",
							border: B,
							borderRadius: 12,
							background: "#fff",
							fontSize: 14,
							fontWeight: 800,
						}}
					>
						Kirim kode baru
					</button>
				</div>
			)}
			{o.state === "ok" && (
				<div
					className="pop"
					role="status"
					style={{
						display: "flex",
						gap: 12,
						alignItems: "center",
						padding: "12px 14px",
						border: B,
						borderRadius: 16,
						background: "#D6F1EA",
						fontSize: 15,
						fontWeight: 700,
					}}
				>
					<Dot size={28} font={13} ok />
					Nomor terverifikasi
				</div>
			)}
			{o.error && <ErrLine text={o.error} size={14} />}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					fontSize: 14,
					gap: 12,
					flexWrap: "wrap",
				}}
			>
				{o.state !== "ok" &&
					o.state !== "expired" &&
					(o.wait > 0 ? (
						<span style={{ color: "#5F5E5A" }}>
							Kirim ulang dalam{" "}
							<span style={{ ...mono, color: INK }}>
								00:{String(o.wait).padStart(2, "0")}
							</span>
						</span>
					) : (
						<button
							type="button"
							onClick={x.resend}
							style={{
								...link,
								padding: "6px 0",
								fontSize: 14,
								textUnderlineOffset: 3,
							}}
						>
							Kirim ulang kode
						</button>
					))}
				<button
					type="button"
					onClick={x.editWa}
					style={{
						...link,
						padding: "6px 0",
						fontSize: 14,
						textUnderlineOffset: 3,
					}}
				>
					Ganti nomor
				</button>
			</div>
			<div
				style={{
					display: "flex",
					gap: 12,
					alignItems: "center",
					padding: 14,
					border: B,
					borderRadius: 16,
					background: "#fff",
				}}
			>
				<IconChip
					icon={emailMode ? Mail : MessageCircle}
					tint="#D6F1EA"
					size={42}
					radius={12}
					iconSize={20}
				/>
				<span style={{ fontSize: 13, lineHeight: 1.45 }}>
					{emailMode ? (
						<>
							Buka email <b>{x.s.email}</b>, cari pesan dari{" "}
							<b>Tetra Photobooth</b>, lalu ketik 6 angka di atas.
						</>
					) : (
						<>
							Tekan <b>Buka WhatsApp</b>, lalu kirim pesan berisi kode ini ke{" "}
							<b>Tetra Photobooth</b>. Halaman ini lanjut sendiri setelah
							pesannya masuk.
						</>
					)}
				</span>
			</div>
			{!emailMode && o.waUrl && <DesktopWa url={o.waUrl} />}
			{!emailMode && x.s.email.trim() && x.v.email && (
				<button
					type="button"
					onClick={x.toEmail}
					style={{
						...link,
						alignSelf: "flex-start",
						fontSize: 14,
						textUnderlineOffset: 3,
					}}
				>
					WhatsApp tidak bisa? Kirim kode ke email
				</button>
			)}
		</div>
	);
}

/** Desktop: WA biasanya di HP atau sudah terbuka di tab lain — QR + salin pesan. */
function DesktopWa({ url }: { url: string }) {
	const [copied, setCopied] = useState(false);
	const u = new URL(url);
	const num = u.pathname.replace(/\D/g, "");
	const text = u.searchParams.get("text") ?? "";
	const shown =
		`+${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5, 9)} ${num.slice(9)}`.trim();
	return (
		<div className="only-d">
			<div
				style={{
					display: "flex",
					gap: 16,
					alignItems: "center",
					padding: 14,
					border: B,
					borderRadius: 16,
					background: "#fff",
				}}
			>
				<span
					style={{
						flex: "none",
						padding: 6,
						border: B,
						borderRadius: 12,
						background: "#fff",
						display: "flex",
					}}
				>
					<QRCodeSVG value={url} size={108} fgColor={INK} />
				</span>
				<span style={col(8, { minWidth: 0 })}>
					<span style={{ fontSize: 14, fontWeight: 800 }}>
						WhatsApp-nya di HP?
					</span>
					<span style={sub13}>
						Scan QR ini dengan kamera HP. Pesannya sudah terisi, tinggal kirim.
					</span>
					<span style={sub13}>
						Atau salin pesannya, lalu kirim ke <b style={mono}>{shown}</b> dari
						WhatsApp Web yang sudah terbuka.
					</span>
					<button
						type="button"
						onClick={() => {
							navigator.clipboard?.writeText(text).then(() => setCopied(true));
							setTimeout(() => setCopied(false), 1500);
						}}
						style={{
							alignSelf: "flex-start",
							height: 40,
							padding: "0 14px",
							border: B,
							borderRadius: 12,
							background: copied ? "#D6F1EA" : "#fff",
							fontSize: 14,
							fontWeight: 800,
						}}
					>
						{copied ? "Pesan tersalin ✓" : "Salin pesan"}
					</button>
				</span>
			</div>
		</div>
	);
}

// ── 5 Cek & kirim ───────────────────────────────────────────────────────────

function ReviewStep({ x }: { x: Ctx }) {
	const s = x.s;
	const rows: Array<{
		icon: typeof Type;
		k: string;
		v: string;
		to: Draft["screen"];
	}> = [
		{
			icon: x.ev?.icon ?? Sparkles,
			k: "Acara",
			v: x.ev?.label ?? "—",
			to: "type",
		},
		{
			icon: CalIcon,
			k: "Tanggal & jam",
			v: [x.dShort || "—", s.time === "unsure" ? "jam belum pasti" : s.time]
				.filter(Boolean)
				.join(" · "),
			to: "date",
		},
		{
			icon: MapPin,
			k: "Lokasi",
			v:
				[s.venue || "Venue menyusul", s.city].filter(Boolean).join(" · ") +
				(s.mapsUrl ? " · Maps ✓" : ""),
			to: "city",
		},
		{ icon: x.pk?.c.icon ?? Package, k: "Paket", v: x.pkgLine, to: "pkg" },
		{
			icon: ImageIco,
			k: "Backdrop",
			v: x.bdLine,
			to: x.hasFmt ? "fmt" : "backdrop",
		},
		{ icon: CirclePlus, k: "Tambahan", v: x.addLine || "Tidak ada", to: "add" },
		{ icon: Type, k: "Nama di cetakan", v: s.title || "—", to: "title" },
		{
			icon: User,
			k: "Pemesan",
			v:
				[s.name, s.wa && `+62 ${s.wa}${x.verifiedNow ? " ✓" : ""}`]
					.filter(Boolean)
					.join(" · ") || "—",
			to: "contact",
		},
		{ icon: Mail, k: "Email", v: s.email || "Tidak diisi", to: "contact" },
		{
			icon: AtSign,
			k: "Instagram",
			v:
				parseInstagram(s.ig)
					.map((h) => `@${h}`)
					.join(" ") || "Tidak diisi",
			to: "contact",
		},
		{
			icon: Store,
			k: "Lewat WO",
			v: s.wo === "yes" ? `${s.woName} · klien +62 ${s.woWa}` : "Tidak",
			to: "contact",
		},
	];
	const box = (on: boolean): CSSProperties => ({
		flex: "none",
		width: 24,
		height: 24,
		borderRadius: 7,
		border: B,
		background: on ? "#5DB978" : "#FFFFFF",
		color: "#fff",
		fontSize: 13,
		fontWeight: 800,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	});
	return (
		<div style={col(14, { padding: "20px 16px 140px" })}>
			<div
				style={{
					border: B,
					borderRadius: 18,
					background: "#fff",
					overflow: "hidden",
				}}
			>
				{rows.map((r) => (
					<button
						key={r.k}
						type="button"
						className="rowbtn"
						onClick={() => x.editTo(r.to)}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							width: "100%",
							padding: "11px 14px",
							border: 0,
							borderBottom: "1.5px dashed #D6D3CC",
							background: "#fff",
							textAlign: "left",
						}}
					>
						<r.icon
							size={18}
							strokeWidth={2}
							style={{ flex: "none", opacity: 0.85 }}
						/>
						<span style={col(1, { flex: 1, minWidth: 0 })}>
							<span style={{ fontSize: 12, fontWeight: 700, color: "#5F5E5A" }}>
								{r.k}
							</span>
							<span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
								{r.v}
							</span>
						</span>
						<span
							style={{
								flex: "none",
								fontSize: 13,
								fontWeight: 700,
								textDecoration: "underline",
								textUnderlineOffset: 3,
							}}
						>
							Ubah
						</span>
					</button>
				))}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: 14,
						background: "#FCE3C6",
						borderTop: B,
					}}
				>
					<span style={{ fontSize: 16, fontWeight: 800 }}>Total</span>
					<span
						style={{
							...mono,
							fontSize: 20,
							fontWeight: 600,
							letterSpacing: "-.02em",
						}}
					>
						{x.totalShown}
					</span>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						padding: "12px 14px",
						borderTop: `1.5px dashed ${INK}`,
					}}
				>
					<span style={{ fontSize: 14, fontWeight: 700 }}>DP minimal</span>
					<span style={{ ...mono, fontSize: 16, fontWeight: 600 }}>
						{x.dpStr}
					</span>
				</div>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: centang kustom sesuai desain v4; role + aria-checked setara checkbox. */}
			<button
				id="bk-consent"
				key={`consent-${x.flash}`}
				type="button"
				role="checkbox"
				aria-checked={s.consent}
				className={x.flash && !s.consent ? "pop" : undefined}
				onClick={() => x.set({ consent: !s.consent })}
				style={{
					display: "flex",
					gap: 12,
					alignItems: "flex-start",
					padding: 14,
					border:
						x.flash && !s.consent
							? "1.5px solid #E8836F"
							: `1.5px dashed ${INK}`,
					borderRadius: 16,
					background: x.flash && !s.consent ? "#F7D5CC" : "transparent",
					textAlign: "left",
				}}
			>
				<span style={box(s.consent)}>{s.consent ? "✓" : ""}</span>
				<span style={{ fontSize: 14, lineHeight: 1.45 }}>
					Aku setuju data booking ini diolah Tetra sesuai{" "}
					<a
						href={PRIVACY_URL}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
					>
						kebijakan privasi
					</a>{" "}
					dan{" "}
					<a
						href={TERMS_URL}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
					>
						syarat & ketentuan
					</a>
					. <span style={{ color: "#5F5E5A" }}>Wajib.</span>
				</span>
			</button>
			{/* biome-ignore lint/a11y/useSemanticElements: centang kustom sesuai desain v4; role + aria-checked setara checkbox. */}
			<button
				type="button"
				role="checkbox"
				aria-checked={s.portfolio}
				onClick={() => x.set({ portfolio: !s.portfolio })}
				style={{
					display: "flex",
					gap: 12,
					alignItems: "flex-start",
					padding: 14,
					border: `1.5px dashed ${INK}`,
					borderRadius: 16,
					background: "transparent",
					textAlign: "left",
				}}
			>
				<span style={box(s.portfolio)}>{s.portfolio ? "✓" : ""}</span>
				<span style={{ fontSize: 14, lineHeight: 1.45 }}>
					Boleh, Tetra memakai foto dari acaraku untuk portofolio.{" "}
					<span style={{ color: "#5F5E5A" }}>Opsional.</span>
				</span>
			</button>
			<div
				style={{
					display: "flex",
					gap: 10,
					alignItems: "flex-start",
					padding: "12px 14px",
					border: `1.5px dashed ${INK}`,
					borderRadius: 14,
					background: "#D6EEF8",
					fontSize: 13,
					lineHeight: 1.45,
				}}
			>
				<Info
					size={18}
					strokeWidth={2}
					style={{ flex: "none", marginTop: 1 }}
				/>
				<span>
					Booking dikirim sebagai <b>draf</b>. Tanggalmu baru terkunci setelah
					DP dibayar.{" "}
					<a href={REFUND_URL} target="_blank" rel="noopener noreferrer">
						Kebijakan refund
					</a>
				</span>
			</div>
			{x.submitErr && <ErrLine text={x.submitErr} size={14} />}
		</div>
	);
}

export type EnterHandler = (e: KeyboardEvent<HTMLInputElement>) => void;
