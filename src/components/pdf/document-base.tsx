/**
 * Token + blok dasar PDF dokumen klien Tetra (quotation / invoice / kuitansi /
 * nota lunas / BAST). @react-pdf/renderer, dirender di server.
 *
 * Layout mengikuti referensi owner (23 Sep 2026): logo kiri, judul + tanggal
 * + nomor kanan; "Dari" kiri & "Kepada" kanan; tabel berpita ungu dengan
 * garis tegas; total di kanan dengan pita TOTAL; blok penutup (terima kasih +
 * S&K di kiri, tanda tangan di POJOK KANAN BAWAH) menempel di atas footer
 * tetap dua kolom. Inter sebagai font, ungu #5a4fb5 sebagai aksen.
 */

import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
	INTER_400,
	INTER_500,
	INTER_600,
	INTER_700,
} from "@/lib/documents/fonts-data";
import { LOGO_DATA_URL } from "@/lib/documents/logo-data";
import { STAMP_LUNAS_DATA_URL } from "@/lib/documents/stamp-lunas-data";
import { COMPANY } from "@/lib/documents/types";

Font.register({
	family: "Inter",
	fonts: [
		{ src: INTER_400, fontWeight: 400 },
		{ src: INTER_500, fontWeight: 500 },
		{ src: INTER_600, fontWeight: 600 },
		{ src: INTER_700, fontWeight: 700 },
	],
});
// Jangan pisahkan kata dengan tanda hubung ("kesepa-katan").
Font.registerHyphenationCallback((word) => [word]);

export const PDF_COLORS = {
	ink: "#1a1a17",
	/** Ungu referensi owner — judul, pita tabel/total, terima kasih, garis footer. */
	accent: "#5a4fb5",
	muted: "#6d6c66",
	subtle: "#a3a29b",
	border: "#e6e5df",
	bandSoft: "#f5f4fb",
	white: "#ffffff",
	limeText: "#3f6b1a",
} as const;

const C = PDF_COLORS;

/** Geometri halaman (pt). Semua blok bawah dihitung dari sini. */
export const PAGE = {
	padX: 50,
	padTop: 44,
	footerBottom: 36,
	footerHeight: 64,
	signOffGap: 14,
} as const;

export const PDF_STYLES = StyleSheet.create({
	page: {
		fontFamily: "Inter",
		fontSize: 9.5,
		fontWeight: 400,
		color: C.ink,
		lineHeight: 1.4,
		paddingTop: PAGE.padTop,
		paddingHorizontal: PAGE.padX,
		paddingBottom: 120, // ditimpa per halaman: lihat bottomReserve()
	},

	// ── Header: logo kiri; judul + tanggal + nomor kanan
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 24,
	},
	logo: {
		width: 112,
		height: 56,
		objectFit: "contain",
		objectPosition: "left top",
	},
	title: {
		fontSize: 26,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: 3,
		textAlign: "right",
		color: C.accent,
	},
	titleSmall: {
		fontSize: 18,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: 2.5,
		textAlign: "right",
		color: C.accent,
	},
	titleDate: {
		fontSize: 10.5,
		fontWeight: 600,
		textAlign: "right",
		marginTop: 8,
	},
	titleMeta: {
		fontSize: 8.5,
		color: C.muted,
		textAlign: "right",
		marginTop: 2,
	},

	// ── Dua kolom "Dari" / "Kepada" (grid 50/50)
	twoCol: { flexDirection: "row", marginBottom: 22 },
	colL: { width: "50%", paddingRight: 16 },
	colR: { width: "50%" },
	blockLabel: {
		fontSize: 7.5,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.1,
		marginBottom: 4,
	},
	blockName: { fontSize: 10.5, fontWeight: 700 },
	blockLine: { fontSize: 9, lineHeight: 1.45 },
	blockMuted: { fontSize: 9, color: C.muted, lineHeight: 1.45 },

	// ── Tabel item
	th: {
		flexDirection: "row",
		gap: 10,
		backgroundColor: C.accent,
		paddingVertical: 8,
		paddingHorizontal: 12,
	},
	thText: { fontSize: 8.5, fontWeight: 700, color: C.white },
	tr: {
		flexDirection: "row",
		gap: 10,
		paddingVertical: 9,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: C.ink,
	},
	cName: { flex: 1 },
	cPrice: { width: 92, fontWeight: 600 },
	cQty: { width: 36, textAlign: "center" },
	cTotal: { width: 96, textAlign: "right", fontWeight: 700 },
	itemName: { fontSize: 10, fontWeight: 700 },
	include: { fontSize: 7.8, lineHeight: 1.35, color: C.muted, marginTop: 1 },

	// ── Bawah tabel: kiri (pembayaran/catatan) — kanan (total)
	afterTable: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginTop: 12,
	},
	leftCol: { width: "50%", paddingRight: 24, paddingTop: 6 },
	rightCol: { width: "50%" },
	sideLabel: {
		fontSize: 7.5,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.1,
		marginBottom: 4,
	},
	sideText: { fontSize: 8.5, color: C.muted, lineHeight: 1.45 },
	payRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 3,
		borderBottomWidth: 0.75,
		borderBottomColor: C.border,
	},
	payK: { fontSize: 8.5 },
	payMeta: { fontSize: 7.8, color: C.muted },
	payV: { fontSize: 8.5, fontWeight: 600 },

	totalRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "center",
		paddingVertical: 3.5,
		paddingHorizontal: 12,
	},
	totalK: {
		fontSize: 8.5,
		fontWeight: 700,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	totalSep: { fontSize: 8.5, fontWeight: 700, marginHorizontal: 6 },
	totalV: { width: 84, fontSize: 9.5, fontWeight: 600, textAlign: "right" },
	totalBand: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 6,
		marginBottom: 4,
		paddingVertical: 10,
		paddingHorizontal: 12,
		backgroundColor: C.accent,
	},
	totalBandK: {
		fontSize: 10,
		fontWeight: 700,
		color: C.white,
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	totalBandV: { fontSize: 14, fontWeight: 700, color: C.white },

	// ── Blok penutup (absolut, di atas footer): kiri S&K, kanan tanda tangan
	signOff: {
		position: "absolute",
		left: PAGE.padX,
		right: PAGE.padX,
		bottom: PAGE.footerBottom + PAGE.footerHeight + PAGE.signOffGap,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
	},
	signOffLeft: { flex: 1, paddingRight: 24 },
	thanks: { fontSize: 10.5, fontWeight: 700, color: C.accent, marginBottom: 8 },
	termsLabel: {
		fontSize: 7.5,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.1,
		marginBottom: 3,
	},
	bullet: { flexDirection: "row", gap: 4, marginBottom: 1.5 },
	bulletDot: { width: 6, fontSize: 7.8, color: C.subtle },
	bulletText: { flex: 1, fontSize: 7.8, lineHeight: 1.4 },
	sign: { width: 170, alignItems: "flex-start" },
	signLabel: { fontSize: 8.5, color: C.muted },
	signImg: {
		height: 44,
		width: 130,
		objectFit: "contain",
		objectPosition: "left bottom",
		marginTop: 4,
	},
	signSpace: { height: 44, marginTop: 4 },
	signName: { fontSize: 10, fontWeight: 700, marginTop: 5 },
	signPos: { fontSize: 8.5, color: C.muted },

	// ── Footer tetap dua kolom
	footer: {
		position: "absolute",
		left: PAGE.padX,
		right: PAGE.padX,
		bottom: PAGE.footerBottom,
		height: PAGE.footerHeight,
		paddingTop: 10,
		borderTopWidth: 1.5,
		borderTopColor: C.accent,
		flexDirection: "row",
		gap: 24,
	},
	footerCol: { flex: 1 },
	footerLabel: { fontSize: 8.5, fontWeight: 700, marginBottom: 3 },
	footerKv: { flexDirection: "row", gap: 4, marginBottom: 1 },
	footerK: { width: 44, fontSize: 7.8, color: C.muted },
	footerV: { flex: 1, fontSize: 7.8, fontWeight: 500 },
	pageNo: {
		position: "absolute",
		bottom: 20,
		right: PAGE.padX,
		fontSize: 7.5,
		color: C.subtle,
	},

	// ── Stempel LUNAS (gambar owner) di ruang kosong header
	stamp: {
		position: "absolute",
		width: 130,
		left: 160,
		top: 4,
		transform: "rotate(-8deg)",
		opacity: 0.92,
	},

	// ── Utilitas (kuitansi)
	label: {
		fontSize: 7.5,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.1,
		marginBottom: 4,
	},
	body: { fontSize: 9.5 },
	kv: { flexDirection: "row", gap: 8, marginBottom: 2.5 },
	k: { width: 84, fontSize: 8.5, color: C.muted },
	v: { flex: 1, fontSize: 9, fontWeight: 500 },
	boxBand: { backgroundColor: C.bandSoft, borderRadius: 4, padding: 11 },
});

/**
 * Ruang bawah halaman = footer + blok penutup. Tinggi S&K diperkirakan dari
 * jumlah karakter (kolom kiri ±300pt pada 7.8pt ≈ 78 karakter per baris,
 * ±11pt per baris). Tanda tangan ±86pt. Lebih longgar sedikit lebih aman
 * daripada blok penutup menimpa total.
 */
export function bottomReserve(terms: string[], thanks: boolean): number {
	const lines = terms.reduce(
		(n, t) => n + Math.max(1, Math.ceil(t.length / 78)),
		0,
	);
	const termsH = terms.length ? 14 + lines * 11 : 0;
	const leftH = (thanks ? 24 : 0) + termsH;
	const signOffH = Math.max(86, leftH);
	return (
		PAGE.footerBottom + PAGE.footerHeight + PAGE.signOffGap + signOffH + 18
	);
}

export function formatRupiahForPdf(amount: number): string {
	if (!Number.isFinite(amount)) return "Rp 0";
	const sign = amount < 0 ? "-" : "";
	return `${sign}Rp ${Math.abs(Math.round(amount)).toLocaleString("id-ID")}`;
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

function parseIso(iso: string) {
	return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
}

/** "23 September 2026" */
export function formatDateForPdf(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = parseIso(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Selasa, 29 September 2026" */
export function formatDateLongForPdf(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = parseIso(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${DAYS[d.getDay()]}, ${formatDateForPdf(iso)}`;
}

export function PdfHeader({
	title,
	docNumber,
	date,
	meta = [],
	small,
	stamp,
}: {
	title: string;
	docNumber: string;
	date: string;
	/** Baris kecil di bawah nomor, mis. "Jatuh tempo 30 Juli 2026". */
	meta?: string[];
	small?: boolean;
	/** Tampilkan stempel LUNAS milik owner. */
	stamp?: boolean;
}) {
	return (
		<View style={[PDF_STYLES.header, { position: "relative" }]}>
			<Image src={LOGO_DATA_URL} style={PDF_STYLES.logo} />
			{stamp ? (
				<Image src={STAMP_LUNAS_DATA_URL} style={PDF_STYLES.stamp} />
			) : null}
			<View>
				<Text style={small ? PDF_STYLES.titleSmall : PDF_STYLES.title}>
					{title}
				</Text>
				<Text style={PDF_STYLES.titleDate}>{formatDateForPdf(date)}</Text>
				<Text style={PDF_STYLES.titleMeta}>No. {docNumber}</Text>
				{meta.map((m) => (
					<Text key={m} style={PDF_STYLES.titleMeta}>
						{m}
					</Text>
				))}
			</View>
		</View>
	);
}

/** Identitas usaha — kolom kiri, sejajar "Kepada". */
export function PdfCompanyBlock() {
	return (
		<View style={PDF_STYLES.colL}>
			<Text style={PDF_STYLES.blockLabel}>Dari</Text>
			<Text style={[PDF_STYLES.blockName, { color: C.accent }]}>
				{COMPANY.name}
			</Text>
			<Text style={PDF_STYLES.blockMuted}>{COMPANY.city}</Text>
			<Text style={PDF_STYLES.blockMuted}>WA {COMPANY.whatsapp}</Text>
			<Text style={PDF_STYLES.blockMuted}>{COMPANY.email}</Text>
		</View>
	);
}

export function PdfPageNo() {
	return (
		<Text
			style={PDF_STYLES.pageNo}
			fixed
			render={({ pageNumber, totalPages }) =>
				totalPages > 1 ? `${pageNumber}/${totalPages}` : ""
			}
		/>
	);
}

/** Footer tetap: Pertanyaan · Info pembayaran (opsional). */
export function PdfFooter({
	bank,
}: {
	bank?: {
		bankName: string;
		accountHolder: string;
		accountNumber: string | null;
	} | null;
}) {
	return (
		<View style={PDF_STYLES.footer} fixed>
			<View style={PDF_STYLES.footerCol}>
				<Text style={PDF_STYLES.footerLabel}>Pertanyaan?</Text>
				<View style={PDF_STYLES.footerKv}>
					<Text style={PDF_STYLES.footerK}>WhatsApp</Text>
					<Text style={PDF_STYLES.footerV}>{COMPANY.whatsapp}</Text>
				</View>
				<View style={PDF_STYLES.footerKv}>
					<Text style={PDF_STYLES.footerK}>Email</Text>
					<Text style={PDF_STYLES.footerV}>{COMPANY.email}</Text>
				</View>
				<View style={PDF_STYLES.footerKv}>
					<Text style={PDF_STYLES.footerK}>Instagram</Text>
					<Text style={PDF_STYLES.footerV}>{COMPANY.instagram}</Text>
				</View>
			</View>
			<View style={PDF_STYLES.footerCol}>
				{bank ? (
					<>
						<Text style={PDF_STYLES.footerLabel}>Info pembayaran</Text>
						<View style={PDF_STYLES.footerKv}>
							<Text style={PDF_STYLES.footerK}>Bank</Text>
							<Text style={PDF_STYLES.footerV}>
								{bank.bankName}
								{bank.accountNumber ? ` · ${bank.accountNumber}` : ""}
							</Text>
						</View>
						<View style={PDF_STYLES.footerKv}>
							<Text style={PDF_STYLES.footerK}>a.n.</Text>
							<Text style={PDF_STYLES.footerV}>{bank.accountHolder}</Text>
						</View>
						<Text style={[PDF_STYLES.footerK, { width: "auto", marginTop: 1 }]}>
							Kirim bukti transfer ke WhatsApp di samping.
						</Text>
					</>
				) : null}
			</View>
		</View>
	);
}

export function PdfSignature({
	signer,
	label = "Hormat kami,",
}: {
	signer: { name: string; position: string; signatureData: string | null };
	label?: string;
}) {
	return (
		<View style={PDF_STYLES.sign}>
			<Text style={PDF_STYLES.signLabel}>{label}</Text>
			{signer.signatureData ? (
				<Image src={signer.signatureData} style={PDF_STYLES.signImg} />
			) : (
				<View style={PDF_STYLES.signSpace} />
			)}
			<Text style={PDF_STYLES.signName}>{signer.name}</Text>
			<Text style={PDF_STYLES.signPos}>
				{signer.position} · {COMPANY.name}
			</Text>
		</View>
	);
}

/** Kolom tanda tangan kosong (klien di BAST). */
export function PdfSignatureBlank({
	name,
	label,
}: {
	name: string;
	label: string;
}) {
	return (
		<View style={PDF_STYLES.sign}>
			<Text style={PDF_STYLES.signLabel}>{label}</Text>
			<View style={PDF_STYLES.signSpace} />
			<Text style={PDF_STYLES.signName}>{name}</Text>
			<Text style={PDF_STYLES.signPos}>Nama jelas & tanda tangan</Text>
		</View>
	);
}

/**
 * Blok penutup di atas footer: kiri = terima kasih + S&K, kanan = tanda
 * tangan di pojok kanan bawah. Absolut, jadi selalu di tempat yang sama.
 */
export function PdfSignOff({
	thanks,
	terms = [],
	right,
}: {
	thanks?: string;
	terms?: string[];
	right: React.ReactNode;
}) {
	return (
		<View style={PDF_STYLES.signOff}>
			<View style={PDF_STYLES.signOffLeft}>
				{thanks ? <Text style={PDF_STYLES.thanks}>{thanks}</Text> : null}
				{terms.length ? (
					<View>
						<Text style={PDF_STYLES.termsLabel}>Syarat & ketentuan</Text>
						{terms.map((l, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis saat render
							<View key={i} style={PDF_STYLES.bullet}>
								<Text style={PDF_STYLES.bulletDot}>•</Text>
								<Text style={PDF_STYLES.bulletText}>{l}</Text>
							</View>
						))}
					</View>
				) : null}
			</View>
			{right}
		</View>
	);
}

export function Kv({ k, v }: { k: string; v: string | null | undefined }) {
	if (!v) return null;
	return (
		<View style={PDF_STYLES.kv}>
			<Text style={PDF_STYLES.k}>{k}</Text>
			<Text style={PDF_STYLES.v}>{v}</Text>
		</View>
	);
}
