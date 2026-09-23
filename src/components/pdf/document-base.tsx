/**
 * Token + blok dasar PDF dokumen klien Tetra (quotation / invoice / kuitansi /
 * nota lunas / BAST). @react-pdf/renderer, dirender di server.
 *
 * Layout mengikuti referensi owner (23 Sep 2026): letterhead (logo + alamat
 * kecil) kiri, judul besar + tanggal + nomor kanan; KEPADA kiri & ACARA kanan;
 * tabel berpita ungu; total kanan dengan pita TOTAL; penutup (terima kasih +
 * S&K kiri, tanda tangan kanan) mengalir setelah total; footer tetap di dasar
 * halaman. Inter, aksen ungu #5a4fb5. Skala: body 10pt, ritme spasi 8/16/24.
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
	ink: "#1b1b1f",
	/** Ungu referensi owner — judul, pita tabel/total, terima kasih, garis footer. */
	accent: "#5a4fb5",
	accentSoft: "#eeecf8",
	muted: "#6b6a75",
	subtle: "#a5a4ad",
	border: "#e4e3ea",
	white: "#ffffff",
	limeText: "#3f6b1a",
} as const;

const C = PDF_COLORS;

/** Geometri halaman (pt). */
export const PAGE = {
	padX: 46,
	padTop: 40,
	footerBottom: 32,
	footerHeight: 70,
} as const;

export const PDF_STYLES = StyleSheet.create({
	page: {
		fontFamily: "Inter",
		fontSize: 10,
		fontWeight: 400,
		color: C.ink,
		lineHeight: 1.4,
		paddingTop: PAGE.padTop,
		paddingHorizontal: PAGE.padX,
		paddingBottom: PAGE.footerBottom + PAGE.footerHeight + 20,
	},

	// ── Letterhead: logo + alamat kiri; judul + tanggal + nomor kanan
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 28,
	},
	logo: {
		width: 118,
		height: 58,
		objectFit: "contain",
		objectPosition: "left top",
	},
	companyLine: { fontSize: 8.5, color: C.muted, lineHeight: 1.45 },
	title: {
		fontSize: 28,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: 3,
		textAlign: "right",
		color: C.accent,
	},
	titleSmall: {
		fontSize: 20,
		lineHeight: 1,
		fontWeight: 700,
		letterSpacing: 2.5,
		textAlign: "right",
		color: C.accent,
	},
	titleDate: {
		fontSize: 11,
		fontWeight: 600,
		textAlign: "right",
		marginTop: 8,
	},
	titleMeta: { fontSize: 9, color: C.muted, textAlign: "right", marginTop: 2 },

	// ── Dua kolom KEPADA / ACARA
	twoCol: { flexDirection: "row", marginBottom: 24 },
	colL: { width: "52%", paddingRight: 20 },
	colR: { width: "48%" },
	blockLabel: {
		fontSize: 8,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.2,
		marginBottom: 5,
	},
	blockName: { fontSize: 12, fontWeight: 700, lineHeight: 1.3 },
	blockLine: { fontSize: 10, lineHeight: 1.45 },
	blockMuted: { fontSize: 9.5, color: C.muted, lineHeight: 1.45 },

	// ── Tabel item
	th: {
		flexDirection: "row",
		gap: 12,
		backgroundColor: C.accent,
		paddingVertical: 9,
		paddingHorizontal: 14,
		borderRadius: 2,
	},
	thText: { fontSize: 9, fontWeight: 700, color: C.white },
	tr: {
		flexDirection: "row",
		gap: 12,
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderBottomWidth: 0.75,
		borderBottomColor: C.border,
	},
	tableEnd: { borderBottomWidth: 1.25, borderBottomColor: C.ink },
	cName: { flex: 1 },
	cPrice: { width: 96, fontWeight: 600 },
	cQty: { width: 36, textAlign: "center" },
	cTotal: { width: 100, textAlign: "right", fontWeight: 700 },
	itemName: { fontSize: 10.5, fontWeight: 700 },
	include: { fontSize: 8.5, lineHeight: 1.4, color: C.muted, marginTop: 1.5 },

	// ── Bawah tabel: kiri (pembayaran/catatan) — kanan (total)
	afterTable: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginTop: 14,
	},
	leftCol: { width: "52%", paddingRight: 20, paddingTop: 4 },
	rightCol: { width: "48%" },
	sideLabel: {
		fontSize: 8,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.2,
		marginBottom: 4,
	},
	sideText: { fontSize: 9.5, color: C.muted, lineHeight: 1.45 },
	payRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 4,
		borderBottomWidth: 0.75,
		borderBottomColor: C.border,
	},
	payType: { width: 54, fontSize: 9.5, fontWeight: 600 },
	payMeta: { flex: 1, fontSize: 8.5, color: C.muted },
	payV: { width: 78, fontSize: 9.5, fontWeight: 600, textAlign: "right" },

	totalRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "center",
		paddingVertical: 4,
		paddingHorizontal: 14,
	},
	totalK: {
		fontSize: 9,
		fontWeight: 700,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	totalSep: { fontSize: 9, fontWeight: 700, marginHorizontal: 6 },
	totalV: { width: 92, fontSize: 10, fontWeight: 600, textAlign: "right" },
	totalBand: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 6,
		marginBottom: 6,
		paddingVertical: 11,
		paddingHorizontal: 14,
		backgroundColor: C.accent,
		borderRadius: 2,
	},
	totalBandK: {
		fontSize: 10.5,
		fontWeight: 700,
		color: C.white,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	totalBandV: { fontSize: 15, fontWeight: 700, color: C.white },

	// ── Penutup: mengalir setelah total. Kiri terima kasih + S&K, kanan tanda tangan
	signOff: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		marginTop: 30,
	},
	signOffLeft: { flex: 1, paddingRight: 28 },
	thanks: {
		fontSize: 11,
		fontWeight: 700,
		color: C.accent,
		marginBottom: 10,
	},
	termsLabel: {
		fontSize: 8,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.2,
		marginBottom: 4,
	},
	bullet: { flexDirection: "row", gap: 5, marginBottom: 2 },
	bulletDot: { width: 6, fontSize: 8.5, color: C.subtle },
	bulletText: { flex: 1, fontSize: 8.5, lineHeight: 1.45 },
	sign: { width: 180 },
	signLabel: { fontSize: 9.5, color: C.muted },
	signImg: {
		height: 48,
		width: 140,
		objectFit: "contain",
		objectPosition: "left bottom",
		marginTop: 6,
	},
	signSpace: { height: 48, marginTop: 6 },
	signName: { fontSize: 11, fontWeight: 700, marginTop: 6 },
	signPos: { fontSize: 9, color: C.muted },

	// ── Footer tetap di dasar halaman
	footer: {
		position: "absolute",
		left: PAGE.padX,
		right: PAGE.padX,
		bottom: PAGE.footerBottom,
		height: PAGE.footerHeight,
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: C.accent,
		flexDirection: "row",
		gap: 28,
	},
	footerCol: { flex: 1 },
	footerLabel: { fontSize: 9, fontWeight: 700, marginBottom: 4 },
	footerKv: { flexDirection: "row", gap: 6, marginBottom: 1.5 },
	footerK: { width: 50, fontSize: 8.5, color: C.muted },
	footerV: { flex: 1, fontSize: 8.5, fontWeight: 500 },
	footerNote: { fontSize: 8, color: C.muted, marginTop: 2 },
	pageNo: {
		position: "absolute",
		bottom: 18,
		right: PAGE.padX,
		fontSize: 8,
		color: C.subtle,
	},

	// ── Stempel LUNAS (gambar owner) di ruang kosong letterhead
	stamp: {
		position: "absolute",
		width: 136,
		left: 168,
		top: 2,
		transform: "rotate(-8deg)",
		opacity: 0.92,
	},

	// ── Utilitas (kuitansi)
	label: {
		fontSize: 8,
		fontWeight: 700,
		color: C.muted,
		textTransform: "uppercase",
		letterSpacing: 1.2,
		marginBottom: 5,
	},
	body: { fontSize: 10 },
	kv: { flexDirection: "row", gap: 8, marginBottom: 3 },
	k: { width: 96, fontSize: 9.5, color: C.muted },
	v: { flex: 1, fontSize: 10, fontWeight: 500 },
	boxBand: { backgroundColor: C.accentSoft, borderRadius: 3, padding: 12 },
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

/** Letterhead: logo + alamat kiri; judul, tanggal, nomor (+ meta) kanan. */
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
			<View>
				<Image src={LOGO_DATA_URL} style={PDF_STYLES.logo} />
				<View style={{ marginTop: 8 }}>
					<Text style={PDF_STYLES.companyLine}>{COMPANY.city}</Text>
					<Text style={PDF_STYLES.companyLine}>
						WA {COMPANY.whatsapp} · {COMPANY.email}
					</Text>
				</View>
			</View>
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
						<Text style={PDF_STYLES.footerNote}>
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

/** Penutup: kiri terima kasih + S&K, kanan tanda tangan. Tidak dipecah lintas halaman. */
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
		<View style={PDF_STYLES.signOff} wrap={false}>
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
