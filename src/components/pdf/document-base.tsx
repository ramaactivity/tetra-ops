/**
 * Token + blok dasar PDF dokumen klien Tetra (quotation / invoice / kuitansi /
 * nota lunas / BAST). @react-pdf/renderer, dirender di server.
 *
 * Arah desain: editorial bersih — putih, logo Tetra di header, tipografi tegas
 * (Helvetica bawaan supaya tidak bergantung font eksternal), tinta hitam sebagai
 * satu-satunya warna kuat, hijau lime hanya untuk "LUNAS". A4 portrait.
 */

import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { LOGO_DATA_URL } from "@/lib/documents/logo-data";
import { COMPANY } from "@/lib/documents/types";

export const PDF_COLORS = {
	ink: "#1a1a17",
	foreground: "#1a1a17",
	muted: "#6d6c66",
	subtle: "#a3a29b",
	border: "#e9e8e2",
	borderStrong: "#b9b8b1",
	band: "#f0efea",
	bandSoft: "#f7f6f3",
	white: "#ffffff",
	limeBg: "#cdf2a0",
	limeText: "#2e4d16",
	orangeBg: "#ffe2d4",
	orangeText: "#97350f",
	roseText: "#d12e36",
} as const;

export const PDF_STYLES = StyleSheet.create({
	page: {
		fontFamily: "Helvetica",
		fontSize: 9.5,
		color: PDF_COLORS.foreground,
		paddingTop: 40,
		paddingHorizontal: 44,
		paddingBottom: 60,
		lineHeight: 1.35,
	},
	// Header
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		paddingBottom: 12,
		borderBottomWidth: 1.5,
		borderBottomColor: PDF_COLORS.ink,
		marginBottom: 14,
	},
	logo: {
		width: 112,
		height: 56,
		objectFit: "contain",
		objectPosition: "left top",
	},
	docTitle: {
		fontSize: 24,
		lineHeight: 1,
		fontFamily: "Helvetica-Bold",
		letterSpacing: 2,
		textAlign: "right",
		color: PDF_COLORS.ink,
	},
	docTitleSmall: {
		fontSize: 16,
		lineHeight: 1,
		fontFamily: "Helvetica-Bold",
		letterSpacing: 1.5,
		textAlign: "right",
		color: PDF_COLORS.ink,
	},
	docNumber: {
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
		textAlign: "right",
		marginTop: 8,
	},
	// Label/value kecil
	eyebrow: {
		fontSize: 7.5,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.muted,
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 3,
	},
	body: { fontSize: 9.5, color: PDF_COLORS.foreground },
	bodyBold: {
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.foreground,
	},
	bodyMuted: { fontSize: 9, color: PDF_COLORS.muted },
	twoCol: { flexDirection: "row", gap: 28, marginBottom: 14 },
	col: { flex: 1, gap: 2 },
	metaRow: { flexDirection: "row", gap: 6 },
	metaKey: { width: 78, fontSize: 9, color: PDF_COLORS.muted },
	metaVal: { flex: 1, fontSize: 9, color: PDF_COLORS.foreground },
	// Tabel item
	th: {
		flexDirection: "row",
		gap: 8,
		backgroundColor: PDF_COLORS.ink,
		paddingVertical: 7,
		paddingHorizontal: 10,
	},
	thText: {
		fontSize: 7.5,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.white,
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	tr: {
		flexDirection: "row",
		gap: 8,
		paddingVertical: 7,
		paddingHorizontal: 10,
		borderBottomWidth: 1,
		borderBottomColor: PDF_COLORS.border,
	},
	cellName: { flex: 6 },
	cellQty: { flex: 1, textAlign: "right", color: PDF_COLORS.muted },
	cellPrice: { flex: 2.4, textAlign: "right" },
	cellTotal: { flex: 2.6, textAlign: "right", fontFamily: "Helvetica-Bold" },
	include: {
		fontSize: 8.5,
		lineHeight: 1.3,
		color: PDF_COLORS.muted,
		marginTop: 1,
	},
	// Total
	totals: { marginTop: 10, alignSelf: "flex-end", width: "52%" },
	totalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 4,
		paddingHorizontal: 10,
	},
	totalKey: { fontSize: 9.5, color: PDF_COLORS.muted },
	totalVal: { fontSize: 9.5 },
	totalGrand: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 4,
		paddingVertical: 8,
		paddingHorizontal: 10,
		backgroundColor: PDF_COLORS.band,
		borderRadius: 3,
	},
	totalGrandKey: { fontSize: 10, fontFamily: "Helvetica-Bold" },
	totalGrandVal: { fontSize: 13, fontFamily: "Helvetica-Bold" },
	// Kotak
	box: {
		borderWidth: 1,
		borderColor: PDF_COLORS.border,
		borderRadius: 4,
		padding: 10,
	},
	bulletRow: { flexDirection: "row", gap: 6, marginBottom: 3 },
	bulletDot: { width: 8, fontSize: 9, color: PDF_COLORS.muted },
	bulletText: {
		flex: 1,
		fontSize: 8.8,
		color: PDF_COLORS.foreground,
		lineHeight: 1.4,
	},
	// Tanda tangan
	signRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginTop: 18,
		gap: 40,
	},
	signBlock: { width: 180, alignItems: "flex-start" },
	signImg: {
		height: 48,
		width: 120,
		objectFit: "contain",
		objectPosition: "left bottom",
		marginTop: 4,
	},
	signSpace: { height: 48, marginTop: 4 },
	signName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 4 },
	signPos: { fontSize: 8.5, color: PDF_COLORS.muted },
	// Footer
	footer: {
		position: "absolute",
		bottom: 28,
		left: 44,
		right: 44,
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: PDF_COLORS.border,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	footerText: { fontSize: 7.5, color: PDF_COLORS.subtle },
	// Stempel
	// Duduk di ruang kosong header, antara logo dan judul.
	stamp: {
		position: "absolute",
		top: 52,
		left: 210,
		paddingVertical: 5,
		paddingHorizontal: 14,
		borderWidth: 2,
		borderRadius: 4,
		fontSize: 16,
		fontFamily: "Helvetica-Bold",
		letterSpacing: 3,
		transform: "rotate(-8deg)",
	},
});

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
	small,
}: {
	title: string;
	docNumber: string;
	small?: boolean;
}) {
	return (
		<View style={PDF_STYLES.headerRow} fixed>
			<Image src={LOGO_DATA_URL} style={PDF_STYLES.logo} />
			<View>
				<Text style={small ? PDF_STYLES.docTitleSmall : PDF_STYLES.docTitle}>
					{title}
				</Text>
				<Text style={PDF_STYLES.docNumber}>No. {docNumber}</Text>
			</View>
		</View>
	);
}

export function PdfFooter() {
	return (
		<View style={PDF_STYLES.footer} fixed>
			<Text style={PDF_STYLES.footerText}>
				{COMPANY.name} · {COMPANY.city} · {COMPANY.email} · {COMPANY.instagram}{" "}
				· WA {COMPANY.whatsapp}
			</Text>
			<Text
				style={PDF_STYLES.footerText}
				render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
			/>
		</View>
	);
}

export function PdfSignature({
	signer,
	label = "Hormat kami,",
	place,
}: {
	signer: { name: string; position: string; signatureData: string | null };
	label?: string;
	place?: string;
}) {
	return (
		<View style={PDF_STYLES.signBlock} wrap={false}>
			{place ? <Text style={PDF_STYLES.bodyMuted}>{place}</Text> : null}
			<Text style={PDF_STYLES.body}>{label}</Text>
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

/** Kolom tanda tangan kosong (untuk klien di BAST). */
export function PdfSignatureBlank({
	name,
	label,
}: {
	name: string;
	label: string;
}) {
	return (
		<View style={PDF_STYLES.signBlock} wrap={false}>
			<Text style={PDF_STYLES.body}>{label}</Text>
			<View style={PDF_STYLES.signSpace} />
			<Text style={PDF_STYLES.signName}>{name}</Text>
			<Text style={PDF_STYLES.signPos}>Nama jelas & tanda tangan</Text>
		</View>
	);
}

export function PdfStamp({
	text,
	tone,
}: {
	text: string;
	tone: "lime" | "orange" | "ink";
}) {
	const color =
		tone === "lime"
			? PDF_COLORS.limeText
			: tone === "orange"
				? PDF_COLORS.orangeText
				: PDF_COLORS.ink;
	const bg =
		tone === "lime"
			? PDF_COLORS.limeBg
			: tone === "orange"
				? PDF_COLORS.orangeBg
				: PDF_COLORS.white;
	return (
		<Text
			style={[
				PDF_STYLES.stamp,
				{ color, borderColor: color, backgroundColor: bg },
			]}
		>
			{text}
		</Text>
	);
}

export function PdfBullets({ lines }: { lines: string[] }) {
	return (
		<View>
			{lines.map((l, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis saat render
				<View key={i} style={PDF_STYLES.bulletRow}>
					<Text style={PDF_STYLES.bulletDot}>•</Text>
					<Text style={PDF_STYLES.bulletText}>{l}</Text>
				</View>
			))}
		</View>
	);
}
