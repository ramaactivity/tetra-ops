/**
 * Token + blok dasar PDF dokumen klien Tetra (quotation / invoice / kuitansi /
 * nota lunas / BAST). @react-pdf/renderer, dirender di server.
 *
 * Arah desain: editorial bersih — Inter (font yang sama dengan app), tinta
 * hitam sebagai satu-satunya warna kuat, label kecil huruf besar, garis tipis,
 * pita hitam hanya untuk TOTAL. Stempel LUNAS memakai gambar milik owner.
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
// Jangan pisahkan kata dengan tanda hubung ("kesepa-katan") — lebih rapi
// membiarkan barisnya sedikit pendek.
Font.registerHyphenationCallback((word) => [word]);

export const PDF_COLORS = {
	ink: "#1a1a17",
	muted: "#6d6c66",
	subtle: "#a3a29b",
	border: "#e6e5df",
	band: "#f0efea",
	bandSoft: "#f7f6f3",
	white: "#ffffff",
	limeText: "#3f6b1a",
} as const;

const C = PDF_COLORS;

export const PDF_STYLES = StyleSheet.create({
	page: {
		fontFamily: "Inter",
		fontSize: 9.5,
		fontWeight: 400,
		color: C.ink,
		lineHeight: 1.4,
		paddingTop: 40,
		paddingHorizontal: 48,
		paddingBottom: 60,
	},

	// ── Header
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		paddingBottom: 12,
		borderBottomWidth: 1.5,
		borderBottomColor: C.ink,
		marginBottom: 16,
	},
	logo: {
		width: 100,
		height: 50,
		objectFit: "contain",
		objectPosition: "left bottom",
	},
	title: {
		fontSize: 22,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: 2.5,
		textAlign: "right",
	},
	titleSmall: {
		fontSize: 15,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: 2,
		textAlign: "right",
	},
	docNumber: {
		fontSize: 9.5,
		fontWeight: 600,
		textAlign: "right",
		marginTop: 7,
		color: C.muted,
	},

	// ── Teks
	label: {
		fontSize: 7,
		fontWeight: 600,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.2,
		marginBottom: 5,
	},
	body: { fontSize: 9.5 },
	strong: { fontSize: 10, fontWeight: 600 },
	muted: { fontSize: 9, color: C.muted },
	kv: { flexDirection: "row", gap: 8, marginBottom: 2.5 },
	k: { width: 70, fontSize: 8.5, color: C.muted },
	v: { flex: 1, fontSize: 9, fontWeight: 500 },

	// ── Grid meta
	metaRow: { flexDirection: "row", gap: 32, marginBottom: 16 },
	metaCol: { flex: 1 },

	// ── Tabel item
	th: {
		flexDirection: "row",
		gap: 10,
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderBottomWidth: 1,
		borderBottomColor: C.ink,
	},
	thText: {
		fontSize: 7,
		fontWeight: 600,
		textTransform: "uppercase",
		letterSpacing: 1.2,
		color: C.muted,
	},
	tr: {
		flexDirection: "row",
		gap: 10,
		paddingVertical: 7,
		paddingHorizontal: 8,
		borderBottomWidth: 0.75,
		borderBottomColor: C.border,
	},
	cName: { flex: 6 },
	cQty: { width: 28, textAlign: "right", color: C.muted },
	cPrice: { width: 88, textAlign: "right" },
	cTotal: { width: 92, textAlign: "right", fontWeight: 600 },
	include: { fontSize: 8.3, lineHeight: 1.3, color: C.muted, marginTop: 0.5 },

	// ── Total
	totals: { width: 250 },
	totalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 3,
		paddingHorizontal: 8,
	},
	totalK: { fontSize: 9, color: C.muted },
	totalV: { fontSize: 9.5, fontWeight: 500 },
	totalBand: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 4,
		marginBottom: 2,
		paddingVertical: 8,
		paddingHorizontal: 10,
		backgroundColor: C.ink,
		borderRadius: 3,
	},
	totalBandK: {
		fontSize: 9,
		fontWeight: 600,
		color: C.white,
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
	totalBandV: { fontSize: 13.5, fontWeight: 700, color: C.white },

	// ── Kotak & tabel kecil
	box: {
		borderWidth: 0.75,
		borderColor: C.border,
		borderRadius: 4,
		padding: 11,
	},
	boxBand: { backgroundColor: C.bandSoft, borderRadius: 4, padding: 11 },
	miniRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 3.5,
		borderBottomWidth: 0.75,
		borderBottomColor: C.border,
	},
	bullet: { flexDirection: "row", gap: 6, marginBottom: 3 },
	bulletDot: { width: 7, fontSize: 8.5, color: C.subtle },
	bulletText: { flex: 1, fontSize: 8.5, lineHeight: 1.45 },

	// ── Tanda tangan
	sign: { width: 170 },
	signImg: {
		height: 46,
		width: 120,
		objectFit: "contain",
		objectPosition: "left bottom",
		marginTop: 6,
	},
	signSpace: { height: 46, marginTop: 6 },
	signName: { fontSize: 10, fontWeight: 700, marginTop: 6 },
	signPos: { fontSize: 8.5, color: C.muted },

	// ── Footer
	footer: {
		position: "absolute",
		bottom: 30,
		left: 48,
		right: 48,
		paddingTop: 9,
		borderTopWidth: 0.75,
		borderTopColor: C.border,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	footerText: { fontSize: 7.5, color: C.subtle },

	// ── Stempel LUNAS (gambar owner) di ruang kosong header, antara logo & judul
	stamp: {
		position: "absolute",
		width: 128,
		left: 150,
		top: 2,
		transform: "rotate(-8deg)",
		opacity: 0.92,
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
	stamp,
}: {
	title: string;
	docNumber: string;
	small?: boolean;
	/** Tampilkan stempel LUNAS milik owner. */
	stamp?: boolean;
}) {
	return (
		<View style={[PDF_STYLES.header, { position: "relative" }]} fixed>
			<Image src={LOGO_DATA_URL} style={PDF_STYLES.logo} />
			{stamp ? <PdfStampLunas /> : null}
			<View>
				<Text style={small ? PDF_STYLES.titleSmall : PDF_STYLES.title}>
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

export function Kv({ k, v }: { k: string; v: string | null | undefined }) {
	if (!v) return null;
	return (
		<View style={PDF_STYLES.kv}>
			<Text style={PDF_STYLES.k}>{k}</Text>
			<Text style={PDF_STYLES.v}>{v}</Text>
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
		<View style={PDF_STYLES.sign} wrap={false}>
			<Text style={PDF_STYLES.muted}>{label}</Text>
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
		<View style={PDF_STYLES.sign} wrap={false}>
			<Text style={PDF_STYLES.muted}>{label}</Text>
			<View style={PDF_STYLES.signSpace} />
			<Text style={PDF_STYLES.signName}>{name}</Text>
			<Text style={PDF_STYLES.signPos}>Nama jelas & tanda tangan</Text>
		</View>
	);
}

export function PdfStampLunas() {
	return <Image src={STAMP_LUNAS_DATA_URL} style={PDF_STYLES.stamp} />;
}

export function PdfBullets({ lines }: { lines: string[] }) {
	return (
		<View>
			{lines.map((l, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis saat render
				<View key={i} style={PDF_STYLES.bullet}>
					<Text style={PDF_STYLES.bulletDot}>•</Text>
					<Text style={PDF_STYLES.bulletText}>{l}</Text>
				</View>
			))}
		</View>
	);
}
