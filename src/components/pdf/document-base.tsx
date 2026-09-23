/**
 * Token + blok dasar PDF dokumen klien Tetra (quotation / invoice / kuitansi /
 * nota lunas / BAST). @react-pdf/renderer, dirender di server.
 *
 * Layout mengikuti referensi owner (23 Sep 2026): identitas usaha kiri atas,
 * judul + tanggal + nomor kanan, blok "Kepada" di kanan, tabel dengan pita
 * header, garis tegas antar baris, total di kanan dengan pita TOTAL, footer
 * tiga kolom (Pertanyaan · Info pembayaran · Syarat & ketentuan). Aksen
 * warna = tinta hitam Tetra; Inter sebagai font.
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
		paddingTop: 44,
		paddingHorizontal: 50,
		// Ruang untuk footer tetap (kontak + info pembayaran) di dasar halaman.
		paddingBottom: 104,
	},

	// ── Header: identitas usaha kiri, judul kanan
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 22,
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

	// ── Blok "Kepada" (kanan) + info acara
	toRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 16,
	},
	toCol: { width: "46%" },
	toLabel: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
	toName: { fontSize: 10.5, fontWeight: 700 },
	toLine: { fontSize: 9, lineHeight: 1.45 },
	toMuted: { fontSize: 9, color: C.muted, lineHeight: 1.45 },

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
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: C.ink,
	},
	cName: { flex: 1 },
	cPrice: { width: 90, textAlign: "left", fontWeight: 600 },
	cQty: { width: 36, textAlign: "center" },
	cTotal: { width: 92, textAlign: "right", fontWeight: 700 },
	itemName: { fontSize: 10, fontWeight: 700 },
	include: { fontSize: 7.8, lineHeight: 1.35, color: C.muted, marginTop: 1 },

	// ── Bawah tabel: catatan kiri, total kanan
	afterTable: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginTop: 14,
		gap: 24,
	},
	noteCol: { flex: 1, paddingTop: 4 },
	noteLabel: { fontSize: 8.5, fontWeight: 700, marginBottom: 2 },
	noteText: { fontSize: 8.5, color: C.muted, lineHeight: 1.45 },
	totals: { width: 236 },
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
	totalV: { width: 82, fontSize: 9.5, fontWeight: 600, textAlign: "right" },
	totalBand: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 6,
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
	paidRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "center",
		paddingVertical: 3,
		paddingHorizontal: 12,
	},

	// ── Pembayaran diterima (kiri bawah tabel)
	miniRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 2.5,
	},

	// ── Terima kasih + tanda tangan
	thanksRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		marginTop: 14,
	},
	thanks: { fontSize: 10.5, fontWeight: 700, color: C.accent },
	sign: { width: 170 },
	signLabel: { fontSize: 8.5, color: C.muted },
	signImg: {
		height: 40,
		width: 120,
		objectFit: "contain",
		objectPosition: "left bottom",
		marginTop: 4,
	},
	signSpace: { height: 40, marginTop: 4 },
	signName: { fontSize: 10, fontWeight: 700, marginTop: 5 },
	signPos: { fontSize: 8.5, color: C.muted },

	// ── Footer tiga kolom (di atas garis)
	footer: {
		position: "absolute",
		bottom: 40,
		left: 50,
		right: 50,
		paddingTop: 10,
		borderTopWidth: 1.5,
		borderTopColor: C.accent,
		flexDirection: "row",
		gap: 18,
	},
	footerCol: { flex: 1 },
	footerLabel: { fontSize: 9, fontWeight: 700, marginBottom: 4 },
	footerKv: { flexDirection: "row", gap: 4, marginBottom: 1.5 },
	footerK: { width: 42, fontSize: 7.8, color: C.muted },
	footerV: { flex: 1, fontSize: 7.8, fontWeight: 500 },
	footerText: { fontSize: 7.8, lineHeight: 1.4 },
	bullet: { flexDirection: "row", gap: 4, marginBottom: 1.5 },
	bulletDot: { width: 6, fontSize: 7.8, color: C.subtle },
	bulletText: { flex: 1, fontSize: 7.8, lineHeight: 1.4 },

	pageNo: {
		position: "absolute",
		bottom: 22,
		right: 50,
		fontSize: 7.5,
		color: C.subtle,
	},

	// ── Stempel LUNAS (gambar owner) di ruang kosong header, antara logo & judul
	stamp: {
		position: "absolute",
		width: 130,
		left: 160,
		top: 4,
		transform: "rotate(-8deg)",
		opacity: 0.92,
	},

	// ── Utilitas
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
	k: { width: 76, fontSize: 8.5, color: C.muted },
	v: { flex: 1, fontSize: 9, fontWeight: 500 },
	boxBand: { backgroundColor: C.bandSoft, borderRadius: 4, padding: 11 },
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

/** Header: logo kiri; judul, tanggal, nomor (+ baris meta) kanan. */
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

/** Identitas usaha (kolom kiri, sejajar blok "Kepada"). */
export function PdfCompanyBlock() {
	return (
		<View style={PDF_STYLES.toCol}>
			<Text style={PDF_STYLES.toLabel}>Dari :</Text>
			<Text style={[PDF_STYLES.toName, { color: C.accent }]}>
				{COMPANY.name}
			</Text>
			<Text style={PDF_STYLES.toMuted}>{COMPANY.city}</Text>
			<Text style={PDF_STYLES.toMuted}>WA {COMPANY.whatsapp}</Text>
			<Text style={PDF_STYLES.toMuted}>{COMPANY.email}</Text>
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

/** Footer tetap dua kolom: Pertanyaan · Info pembayaran (kuitansi/BAST tanpa rekening). */
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
							<Text style={PDF_STYLES.footerV}>{bank.bankName}</Text>
						</View>
						{bank.accountNumber ? (
							<View style={PDF_STYLES.footerKv}>
								<Text style={PDF_STYLES.footerK}>No. rek.</Text>
								<Text style={PDF_STYLES.footerV}>{bank.accountNumber}</Text>
							</View>
						) : null}
						<View style={PDF_STYLES.footerKv}>
							<Text style={PDF_STYLES.footerK}>a.n.</Text>
							<Text style={PDF_STYLES.footerV}>{bank.accountHolder}</Text>
						</View>
					</>
				) : null}
			</View>
			<View style={PDF_STYLES.footerCol}>
				<Text style={PDF_STYLES.footerLabel}>{COMPANY.name}</Text>
				<Text style={PDF_STYLES.footerText}>{COMPANY.city}</Text>
			</View>
		</View>
	);
}

/** Syarat & ketentuan — di alur konten (bukan footer) karena panjangnya berubah-ubah. */
export function PdfTerms({ terms }: { terms: string[] }) {
	if (terms.length === 0) return null;
	return (
		<View style={{ marginTop: 18 }}>
			<Text style={PDF_STYLES.footerLabel}>Syarat & ketentuan</Text>
			{terms.map((l, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis saat render
				<View key={i} style={PDF_STYLES.bullet}>
					<Text style={PDF_STYLES.bulletDot}>•</Text>
					<Text style={PDF_STYLES.bulletText}>{l}</Text>
				</View>
			))}
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
		<View style={PDF_STYLES.sign} wrap={false}>
			<Text style={PDF_STYLES.signLabel}>{label}</Text>
			<View style={PDF_STYLES.signSpace} />
			<Text style={PDF_STYLES.signName}>{name}</Text>
			<Text style={PDF_STYLES.signPos}>Nama jelas & tanda tangan</Text>
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
