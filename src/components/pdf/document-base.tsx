/**
 * Token + blok dasar PDF dokumen klien Tetra (quotation / invoice / kuitansi /
 * nota lunas / BAST) — gaya "Swiss" (handoff design_handoff_dokumen_swiss,
 * 30 Sep 2026). @react-pdf/renderer, dirender di server.
 *
 * Grid 6 kolom di atas konten 523.28pt (A4 − 2×36), gutter 12pt. react-pdf
 * tidak punya CSS grid → `Row` + `Col span` dengan lebar tetap. Helvetica
 * bawaan, hitam + satu aksen merah, hierarki murni dari ukuran & tebal huruf.
 * Tanpa kotak berwarna, radius, atau bayangan — hanya garis 4.5pt / 0.75pt.
 *
 * Ukuran huruf persis handoff (body 8.25pt, kecil 7.1pt) — owner minta hasil
 * identik dengan preview Claude Design (30 Sep 2026).
 */

import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ComponentProps, ReactNode } from "react";
import {
	LOGO_BLACK_DATA_URL,
	LOGO_CREAM_DATA_URL,
} from "@/lib/documents/logo-swiss-data";
import { COMPANY } from "@/lib/documents/types";

// Jangan pisahkan kata dengan tanda hubung ("kesepa-katan").
Font.registerHyphenationCallback((word) => [word]);

export const PDF_COLORS = {
	ink: "#111111",
	paper: "#FDFDFC",
	red: "#E30613",
	redOnBlack: "#FF3B30",
	muted: "#6B6B69",
	index: "#8A8A88",
	hairline: "#D4D4D2",
	/** Harga belum diisi admin (draft quotation dari bot). */
	warn: "#B45309",
} as const;

const C = PDF_COLORS;

/** Geometri halaman & grid (pt). */
export const GRID = {
	padTop: 30,
	padX: 36,
	gap: 12,
	/** Lebar per span: 1 kolom = 77.21pt. */
	span: [0, 77.21, 166.43, 255.64, 344.85, 434.07, 523.28] as const,
	/** Tinggi footer yang menempel di dasar tiap halaman. */
	footerHeight: 38,
} as const;

export const FS = {
	body: 8.25,
	small: 7.1,
	title: 84,
	big: 63,
	para: 10.5,
} as const;

export const PDF_STYLES = StyleSheet.create({
	page: {
		fontFamily: "Helvetica",
		fontSize: FS.body,
		// lineHeight TIDAK di sini: react-pdf 4.5 tidak menggambar teks
		// `render` (nomor halaman) bila <Page> punya lineHeight. Dipasang di
		// `content` yang membungkus isi halaman.
		color: C.ink,
		backgroundColor: C.paper,
		paddingTop: GRID.padTop,
		paddingHorizontal: GRID.padX,
		// Ruang footer tetap + jarak 18pt di atasnya.
		paddingBottom: GRID.footerHeight + 18,
		flexDirection: "column",
	},
	/** Pembungkus isi halaman — pemegang lineHeight dasar. */
	// fontSize ikut dipasang: react-pdf mengubah lineHeight tanpa satuan jadi
	// absolut memakai fontSize node ini (default 18 bila tidak diisi).
	content: { fontSize: FS.body, lineHeight: 1.45 },
	row: { flexDirection: "row", gap: GRID.gap },
	bold: { fontFamily: "Helvetica-Bold" },
	small: { fontSize: FS.small, lineHeight: 1.5 },
	muted: { color: C.muted },
	ruleThick: { borderTopWidth: 4.5, borderTopColor: C.ink },
	ruleThin: { borderTopWidth: 0.75, borderTopColor: C.ink },
	num: { textAlign: "right" },
});

const S = PDF_STYLES;

/** Satu style react-pdf (bukan array). */
type Style = Exclude<
	ComponentProps<typeof View>["style"],
	unknown[] | undefined
>;

/* ───────────────────────── grid ───────────────────────── */

export function Row({
	children,
	style,
	wrap,
}: {
	children: ReactNode;
	style?: Style | Style[];
	wrap?: boolean;
}) {
	return (
		<View
			style={[S.row, ...(Array.isArray(style) ? style : style ? [style] : [])]}
			wrap={wrap}
		>
			{children}
		</View>
	);
}

export function Col({
	span,
	start,
	children,
	style,
}: {
	span: 1 | 2 | 3 | 4 | 5 | 6;
	/** Kolom awal (1-based) bila tidak mulai dari kiri, mis. totals di col 4. */
	start?: number;
	children?: ReactNode;
	style?: Style | Style[];
}) {
	const offset =
		start && start > 1 ? GRID.span[start - 1] + GRID.gap : undefined;
	return (
		<View
			style={[
				{ width: GRID.span[span] },
				offset ? { marginLeft: offset } : {},
				...(Array.isArray(style) ? style : style ? [style] : []),
			]}
		>
			{children}
		</View>
	);
}

/* ───────────────────────── format ───────────────────────── */

/** 5000000 → "5.000.000" (tanpa "Rp" — satuan ada di header kolom). */
export function formatNumberForPdf(amount: number): string {
	if (!Number.isFinite(amount)) return "0";
	// En dash, bukan U+2212: Helvetica bawaan PDF (WinAnsi) tidak punya "−".
	const sign = amount < 0 ? "–" : "";
	return `${sign}${Math.abs(Math.round(amount)).toLocaleString("id-ID")}`;
}

export function formatRupiahForPdf(amount: number): string {
	return `Rp ${formatNumberForPdf(amount)}`;
}

const MONTHS = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "2026-10-16" → Date lokal (bukan UTC) supaya tanggal tidak mundur sehari. */
function parseIso(iso: string) {
	return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
}

/** "16.10.2026" */
export function formatDateDots(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = parseIso(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const p = (n: number) => String(n).padStart(2, "0");
	return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** "16 Oktober 2026" */
export function formatDateForPdf(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = parseIso(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Jumat, 16 Oktober 2026" */
export function formatDateLongForPdf(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = parseIso(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${DAYS[d.getDay()]}, ${formatDateForPdf(iso)}`;
}

/* ───────────────────────── header ───────────────────────── */

/** A putih (default) · B hitam · C merah — isi identik, hanya blok judul. */
export type HeaderVariant = "a" | "b" | "c";

const HEADER_THEME: Record<
	HeaderVariant,
	{ bg: string | null; fg: string; dot: string; logo: string }
> = {
	a: { bg: null, fg: C.ink, dot: C.red, logo: LOGO_BLACK_DATA_URL },
	b: { bg: C.ink, fg: C.paper, dot: C.redOnBlack, logo: LOGO_CREAM_DATA_URL },
	c: { bg: C.red, fg: C.paper, dot: C.ink, logo: LOGO_CREAM_DATA_URL },
};

/** Letterhead (garis 4.5pt + logo + kontak) lalu judul raksasa bertitik. */
export function PdfHeader({
	title,
	variant = "a",
}: {
	title: string;
	variant?: HeaderVariant;
}) {
	const t = HEADER_THEME[variant];
	const bleed = t.bg
		? {
				backgroundColor: t.bg,
				marginTop: -GRID.padTop,
				marginHorizontal: -GRID.padX,
				paddingTop: GRID.padTop,
				paddingHorizontal: GRID.padX,
				paddingBottom: GRID.padTop,
			}
		: {};
	return (
		<View style={[{ color: t.fg }, bleed]}>
			<Row
				style={[
					S.small,
					{ borderTopWidth: 4.5, borderTopColor: t.fg, paddingTop: 10.5 },
				]}
			>
				<Col span={2}>
					{/* Proporsi aset 944×430 → tinggi 28.5pt */}
					<Image src={t.logo} style={{ height: 28.5, width: 62.6 }} />
				</Col>
				<Col span={2}>
					<Text>{COMPANY.name}</Text>
					<Text>{COMPANY.city}</Text>
				</Col>
				<Col span={1}>
					<Text>WA {COMPANY.whatsapp}</Text>
					<Text>{COMPANY.instagram}</Text>
				</Col>
				<Col span={1}>
					{/* Email dipecah di "@" supaya muat satu kolom tanpa terpotong. */}
					<Text>{COMPANY.email.split("@")[0]}</Text>
					<Text>@{COMPANY.email.split("@")[1]}</Text>
				</Col>
			</Row>
			<Text
				style={[
					S.bold,
					{
						marginTop: 18,
						fontSize: FS.title,
						lineHeight: 0.8,
						letterSpacing: -4.6,
						marginLeft: -4.5,
						// react-pdf memotong glyph di atas baseline bila lineHeight < 1;
						// ruang kecil di atas mengompensasi.
						paddingTop: 4,
					},
				]}
			>
				{title}
				<Text style={{ color: t.dot }}>.</Text>
			</Text>
		</View>
	);
}

/* ───────────────────────── blok ───────────────────────── */

/** Pasangan label tebal di atas + nilai di bawah (meta row, pihak). */
export function LabelBlock({
	label,
	lines,
}: {
	label: string;
	lines: Array<string | null | undefined | false>;
}) {
	return (
		<View>
			<Text style={S.bold}>{label}</Text>
			{lines
				.filter((l): l is string => Boolean(l))
				.map((l) => (
					<Text key={l}>{l}</Text>
				))}
		</View>
	);
}

/** Baris meta: No. · tanggal · status/referensi. */
export function MetaRow({
	cells,
}: {
	cells: Array<{ k: string; v: string; span: 1 | 2 | 3 | 4 }>;
}) {
	return (
		// 30 (bukan 21 handoff): kotak judul react-pdf lebih tinggi dari
		// lineHeight 0.8 desain, judul dinaikkan 9pt → jarak dikembalikan di sini.
		<Row style={[S.ruleThin, { marginTop: 33.5, paddingTop: 7.5 }]}>
			{cells.map((c) => (
				<Col key={c.k} span={c.span}>
					<LabelBlock label={c.k} lines={[c.v]} />
				</Col>
			))}
		</Row>
	);
}

/**
 * Angka besar merah — inti dokumen. Rata kanan, tidak boleh wrap: font
 * diperkecil otomatis bila teksnya terlalu panjang untuk span 4.
 */
export function BigFigure({
	label,
	sub,
	value,
}: {
	label: string;
	sub?: string | null;
	value: string;
}) {
	// Helvetica-Bold ≈ 0.55em per karakter setelah letterSpacing −0.05em.
	const fit = Math.min(FS.big, GRID.span[4] / (value.length * 0.55));
	return (
		<Row style={[S.ruleThick, { marginTop: 21, paddingTop: 9 }]} wrap={false}>
			<Col span={2}>
				<LabelBlock label={label} lines={[sub]} />
			</Col>
			{/* Ruang = 0.85em (lineHeight handoff). react-pdf mengabaikan
			    lineHeight < 1 dan memakai tinggi glyph penuh (~1.2em) — margin
			    negatif mengembalikan ±25pt yang dulu mendorong blok bawah ke
			    halaman 2. Kotak bertinggi tetap tidak bisa: teks yang "tak muat"
			    dibuang react-pdf. */}
			<Col span={4}>
				<Text
					style={[
						S.bold,
						S.num,
						{
							fontSize: fit,
							lineHeight: 1,
							marginTop: -fit * 0.1,
							marginBottom: -fit * 0.1,
							letterSpacing: -fit * 0.05,
							color: C.red,
						},
					]}
				>
					{value}
				</Text>
			</Col>
		</Row>
	);
}

/** Nomor urut dua digit ("01") di kolom kecil + teks. */
export function Numbered({
	n,
	children,
	width = 16.5,
}: {
	n: number;
	children: ReactNode;
	width?: number;
}) {
	return (
		<View style={{ flexDirection: "row" }}>
			<Text style={{ width, color: C.index }}>
				{String(n).padStart(2, "0")}
			</Text>
			<View style={{ flex: 1 }}>{children}</View>
		</View>
	);
}

export type PdfSigner = {
	name: string;
	position: string;
	signatureData: string | null;
};

/** Tanda tangan rata kanan: label → gambar → nama → jabatan. */
export function PdfSignature({
	signer,
	label = "Hormat kami",
	rule = false,
}: {
	signer: PdfSigner;
	label?: string;
	/** BAST: garis di atas nama selebar kolom. */
	rule?: boolean;
}) {
	return (
		<View style={{ alignItems: "flex-end", textAlign: "right" }}>
			<Text style={[S.bold, { fontSize: FS.body }]}>{label}</Text>
			{signer.signatureData ? (
				<Image
					src={signer.signatureData}
					style={{
						height: 46.5,
						width: 150,
						objectFit: "contain",
						objectPosition: "right bottom",
						marginRight: -4.5,
					}}
				/>
			) : (
				<View style={{ height: 46.5 }} />
			)}
			<View
				style={
					rule
						? [S.ruleThin, { alignSelf: "stretch", paddingTop: 4.5 }]
						: undefined
				}
			>
				<Text style={[S.bold, { fontSize: FS.body, textAlign: "right" }]}>
					{signer.name}
				</Text>
			</View>
			<Text>
				{signer.position}, {COMPANY.name}
			</Text>
		</View>
	);
}

/**
 * Blok yang selalu duduk di dasar halaman terakhir (di atas footer). Jarak
 * minimum 24pt ke atas (handoff ≥30; 24 supaya quotation 4 item + 7
 * ketentuan tetap satu halaman — di dokumen biasa jaraknya jauh lebih lega).
 * Spacer
 * `flexGrow` menghabiskan sisa ruang — tanpa posisi absolut, jadi react-pdf
 * tetap memindahkan blok ke halaman baru bila ruangnya tidak cukup.
 */
export function PinnedBottom({ children }: { children: ReactNode }) {
	return (
		<View style={{ flexGrow: 1, justifyContent: "flex-end" }} wrap={false}>
			<View style={{ marginTop: 24 }}>{children}</View>
		</View>
	);
}

/** Blok bawah: Pembayaran · Ketentuan · tanda tangan (rata kanan). */
export function PdfBottom({
	bank,
	terms,
	signer,
	signLabel,
}: {
	bank: {
		bankName: string;
		accountHolder: string;
		accountNumber: string | null;
	} | null;
	terms: string[];
	signer: PdfSigner;
	signLabel?: string;
}) {
	const termList = (list: string[], from: number) =>
		list.map((t, i) => (
			<View key={t} style={{ flexDirection: "row", marginBottom: 2.25 }}>
				<Text style={{ width: 10.5 }}>{from + i + 1}</Text>
				<Text style={{ flex: 1 }}>{t}</Text>
			</View>
		));
	const termsLabel = (
		<Text style={[S.bold, { fontSize: FS.body, marginBottom: 4.5 }]}>
			Ketentuan
		</Text>
	);
	// Ketentuan panjang (quotation: 7 poin): di kolom span 2 tingginya ±170pt
	// dan mendorong blok bawah ke halaman 2 → Ketentuan jadi span 3, tanda
	// tangan span 1 (tetap rata kanan). ≤4 poin: persis grid handoff 2·2·2.
	const long = terms.length > 4;
	return (
		<PinnedBottom>
			<Row style={[S.ruleThin, S.small, { paddingTop: 9 }]}>
				<Col span={2}>
					{bank ? (
						<>
							<Text style={[S.bold, { fontSize: FS.body, marginBottom: 4.5 }]}>
								Pembayaran
							</Text>
							<Text>
								{bank.bankName}
								{bank.accountNumber ? ` ${bank.accountNumber}` : ""}
							</Text>
							<Text>a.n. {bank.accountHolder}</Text>
							<Text>Kirim bukti transfer ke WhatsApp {COMPANY.whatsapp}.</Text>
						</>
					) : null}
				</Col>
				<Col span={long ? 3 : 2}>
					{terms.length > 0 ? (
						<>
							{termsLabel}
							{termList(terms, 0)}
						</>
					) : null}
				</Col>
				<Col span={long ? 1 : 2}>
					<PdfSignature signer={signer} label={signLabel} />
				</Col>
			</Row>
		</PinnedBottom>
	);
}

/** Footer tetap di dasar tiap halaman: garis + ucapan terima kasih. */
export function PdfFooter({ thanks }: { thanks: string }) {
	return (
		<View
			fixed
			style={[
				S.ruleThin,
				S.small,
				{
					position: "absolute",
					left: GRID.padX,
					right: GRID.padX,
					bottom: 0,
					height: GRID.footerHeight,
					paddingTop: 9,
				},
			]}
		>
			<Text style={S.bold}>{thanks}</Text>
		</View>
	);
}

/**
 * "{nomor} · 1/2" di kanan footer. Harus anak langsung <Page> (bukan di dalam
 * fragment/View footer) — kalau tidak, `render` react-pdf tidak dipanggil.
 */
export function PdfPageNumber({ docNumber }: { docNumber: string }) {
	return (
		<Text
			fixed
			style={{
				position: "absolute",
				// Sebaris dengan teks footer: 9pt di bawah garis footer.
				bottom: GRID.footerHeight - 9 - FS.small * 1.5,
				right: GRID.padX,
				width: GRID.span[2],
				fontSize: FS.small,
				textAlign: "right",
			}}
			render={({ pageNumber, totalPages }) =>
				`${docNumber} · ${pageNumber}/${totalPages}`
			}
		/>
	);
}
