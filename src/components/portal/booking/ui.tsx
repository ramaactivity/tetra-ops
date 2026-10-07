"use client";

/**
 * Primitif booking v4: contoh cetakan (Print Preview), chip ikon, stepper,
 * baris error, tombol berlapis. Nilai px persis prototipe docs/design/booking-v4.
 */
import {
	Heart,
	Laugh,
	type LucideIcon,
	PartyPopper,
	Smile,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Fmt } from "./content";

export const INK = "#1D1D1B";
export const SEL = "4px 4px 0 -1.5px #8EDCCB,4px 4px 0 0 #1D1D1B";
export const B = `1.5px solid ${INK}`;
export const layered = (o: number, bg = "#F8F7F4") =>
	`${o}px ${o}px 0 -1.5px ${bg},${o}px ${o}px 0 0 ${INK}`;
export const opt = (sel: boolean) => ({
	background: sel ? "#D6F1EA" : "#FFFFFF",
	boxShadow: sel ? SEL : "none",
});
export const mono: CSSProperties = {
	fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};

// ── Print Preview ───────────────────────────────────────────────────────────

const THEME: Record<
	string,
	{ bg: string; s1: string; s2: string; s3: string }
> = {
	klasik: { bg: "#FFFFFF", s1: "#CEC8F6", s2: "#FCE3C6", s3: "#D6EEF8" },
	garden: { bg: "#D6F1EA", s1: "#FFFFFF", s2: "#8EDCCB", s3: "#FFFFFF" },
	butter: { bg: "#F8D98B", s1: "#FFFFFF", s2: "#FCE3C6", s3: "#FFFFFF" },
	lavender: { bg: "#CEC8F6", s1: "#FFFFFF", s2: "#D6EEF8", s3: "#FFFFFF" },
	sky: { bg: "#D6EEF8", s1: "#FFFFFF", s2: "#CEC8F6", s3: "#FFFFFF" },
	peach: { bg: "#FCE3C6", s1: "#FFFFFF", s2: "#F7D5CC", s3: "#FFFFFF" },
};

export type PvProps = {
	fmt: Fmt;
	title?: string;
	date?: string;
	kicker?: string;
	theme?: string;
	zoom?: number;
	rot?: string;
};

/** Contoh cetakan berisi ikon (bukan foto klien — alasan consent). */
export function PrintPreview({
	fmt,
	title,
	date,
	kicker,
	theme = "klasik",
	zoom = 1,
	rot = "-2deg",
}: PvProps) {
	const t = THEME[theme] ?? THEME.klasik;
	const name = title || "Nama acaramu";
	const when = date || "TANGGAL ACARA";
	const frame: CSSProperties = {
		height: 330,
		background: t.bg,
		border: B,
		boxShadow: layered(5, "#FFFFFF"),
		transform: `rotate(${rot})`,
		display: "flex",
		flexDirection: "column",
	};
	const slot = (
		h: number,
		bg: string,
		Icon: LucideIcon,
		sz: number,
		r: number,
	) => (
		<div
			style={{
				height: h,
				flex: "none",
				borderRadius: r,
				background: bg,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Icon size={sz} strokeWidth={2} style={{ opacity: 0.45 }} />
		</div>
	);
	const caption = (k: number, tz: number, dz: number, gap: number) => (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap,
				textAlign: "center",
			}}
		>
			{kicker && (
				<span style={{ fontSize: k, letterSpacing: ".2em", fontWeight: 700 }}>
					{kicker}
				</span>
			)}
			<span
				style={{
					fontSize: tz,
					fontWeight: 800,
					lineHeight: fmt === "strip" ? 1.15 : 1.1,
					letterSpacing: "-.01em",
					overflowWrap: "anywhere",
				}}
			>
				{name}
			</span>
			<span style={{ ...mono, fontSize: dz }}>{when}</span>
			{fmt === "strip" && (
				// biome-ignore lint/performance/noImgElement: logo kecil statis, tanpa optimasi.
				<img
					src="/portal/tetra-logo.png"
					alt=""
					style={{ height: 8, filter: "invert(1)", marginTop: 6 }}
				/>
			)}
		</div>
	);
	return (
		<div
			aria-hidden
			style={{
				zoom,
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			{fmt === "strip" && (
				<div style={{ ...frame, width: 110, padding: 7, gap: 5 }}>
					{slot(66, t.s1, Smile, 20, 3)}
					{slot(66, t.s2, Laugh, 20, 3)}
					{slot(66, t.s3, Heart, 20, 3)}
					{caption(5.5, 11.5, 6.5, 4)}
				</div>
			)}
			{fmt === "4r" && (
				<div style={{ ...frame, width: 220, padding: 9, gap: 6 }}>
					{slot(126, t.s1, Smile, 30, 4)}
					{slot(126, t.s2, PartyPopper, 30, 4)}
					{caption(6, 14, 7.5, 3)}
				</div>
			)}
			{fmt === "polaroid" && (
				<div style={{ ...frame, width: 257, padding: "12px 12px 0" }}>
					{slot(240, t.s1, Smile, 44, 3)}
					{caption(6, 17, 8, 3)}
				</div>
			)}
		</div>
	);
}

// ── Primitif ────────────────────────────────────────────────────────────────

/** Kotak ikon border putus-putus berisi pastel. */
export function IconChip({
	icon: Icon,
	tint,
	size = 46,
	radius = 13,
	iconSize = 22,
}: {
	icon: LucideIcon;
	tint: string;
	size?: number;
	radius?: number;
	iconSize?: number;
}) {
	return (
		<span
			style={{
				flex: "none",
				width: size,
				height: size,
				borderRadius: radius,
				border: `1.5px dashed ${INK}`,
				background: tint,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Icon size={iconSize} strokeWidth={2} />
		</span>
	);
}

/** Lingkaran ✓ hijau / angka / kosong. */
export function Dot({
	size,
	ok,
	children,
	bg,
	fg,
	ring = INK,
	font = 12,
	mono: isMono,
}: {
	size: number;
	ok?: boolean;
	children?: ReactNode;
	bg?: string;
	fg?: string;
	ring?: string;
	font?: number;
	mono?: boolean;
}) {
	return (
		<span
			style={{
				flex: "none",
				width: size,
				height: size,
				borderRadius: size / 2,
				border: `1.5px solid ${ring}`,
				background: bg ?? (ok ? "#5DB978" : "#FFFFFF"),
				color: fg ?? (ok ? "#fff" : INK),
				fontSize: font,
				fontWeight: isMono ? 600 : 800,
				...(isMono ? mono : {}),
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				transition: "background 200ms",
			}}
		>
			{ok ? "✓" : children}
		</span>
	);
}

/** Pesan error: titik coral 8px + teks 13–14/600. */
export function ErrLine({ text, size = 13 }: { text: string; size?: number }) {
	return (
		<span
			role="alert"
			style={{
				display: "flex",
				gap: 8,
				alignItems: "center",
				fontSize: size,
				fontWeight: 600,
			}}
		>
			<span
				style={{
					flex: "none",
					width: 8,
					height: 8,
					borderRadius: 4,
					background: "#E8836F",
				}}
			/>
			{text}
		</span>
	);
}

/** − n + (border tinta, tombol + mint). */
export function Stepper({
	value,
	onDec,
	onInc,
	decOff,
	incOff,
	w = 40,
	numW = 28,
	label,
}: {
	value: ReactNode;
	onDec: () => void;
	onInc: () => void;
	decOff?: boolean;
	incOff?: boolean;
	w?: number;
	numW?: number;
	label?: string;
}) {
	return (
		<span
			style={{
				flex: "none",
				display: "flex",
				alignItems: "center",
				border: B,
				borderRadius: 12,
				overflow: "hidden",
				background: "#fff",
				height: 44,
			}}
		>
			<button
				type="button"
				onClick={onDec}
				aria-label={label ? `Kurangi ${label}` : "Kurangi"}
				style={{
					width: w,
					height: "100%",
					border: 0,
					background: "#fff",
					fontSize: 18,
					fontWeight: 700,
					opacity: decOff ? 0.3 : 1,
				}}
			>
				−
			</button>
			<span
				style={{
					width: numW,
					textAlign: "center",
					...mono,
					fontSize: 15,
					fontWeight: 600,
				}}
			>
				{value}
			</span>
			<button
				type="button"
				onClick={onInc}
				aria-label={label ? `Tambah ${label}` : "Tambah"}
				style={{
					width: w,
					height: "100%",
					border: 0,
					borderLeft: B,
					background: "#8EDCCB",
					fontSize: 18,
					fontWeight: 700,
					opacity: incOff ? 0.3 : 1,
				}}
			>
				+
			</button>
		</span>
	);
}

/** Kartu notifikasi ✓ (mint-soft) / ✕ (coral). */
export function Notice({
	kind,
	children,
	shadow,
}: {
	kind: "ok" | "bad";
	children: ReactNode;
	shadow?: boolean;
}) {
	const ok = kind === "ok";
	return (
		<div
			className="pop"
			role={ok ? "status" : "alert"}
			style={{
				display: "flex",
				gap: 12,
				alignItems: "center",
				padding: "12px 14px",
				border: B,
				borderRadius: 16,
				background: ok ? "#D6F1EA" : "#F7D5CC",
				boxShadow: shadow ? SEL : undefined,
			}}
		>
			<Dot size={30} font={14} ok={ok}>
				✕
			</Dot>
			<span style={{ fontSize: 15, lineHeight: 1.35 }}>{children}</span>
		</div>
	);
}

/** Tombol butter berlapis (CTA). */
export function Cta({
	children,
	onClick,
	o = 4,
	bg = "#F8F7F4",
	style,
	disabled,
	type = "button",
}: {
	children: ReactNode;
	onClick?: () => void;
	o?: number;
	bg?: string;
	style?: CSSProperties;
	disabled?: boolean;
	type?: "button" | "submit";
}) {
	return (
		<button
			type={type}
			className="press"
			disabled={disabled}
			onClick={onClick}
			style={
				{
					"--o": `${o}px`,
					height: 56,
					border: B,
					borderRadius: 14,
					background: "#F8D98B",
					boxShadow: layered(o, bg),
					fontSize: 17,
					fontWeight: 800,
					...style,
				} as CSSProperties
			}
		>
			{children}
		</button>
	);
}
