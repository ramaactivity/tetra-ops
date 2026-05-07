/**
 * Shared PDF design tokens + base components for Tetra-branded documents
 * (Invoice / Quotation / BAST). Uses @react-pdf/renderer Web/Node renderer.
 *
 * Design notes:
 * - Tetra brand color: rose-700 / #be123c (matches the app primary)
 * - Body type: Helvetica (default) — works without external font loading
 * - Numbers always use tabular alignment via consistent sizing + padding
 * - Page format: A4 portrait (210 × 297 mm)
 * - Mock-up resembles a clean modern Stripe-style invoice
 */

import { StyleSheet, View, Text } from "@react-pdf/renderer";

export const PDF_COLORS = {
	primary: "#be123c",
	primaryDark: "#9f1239",
	foreground: "#171717",
	mutedForeground: "#525252",
	subtle: "#a3a3a3",
	border: "#e5e5e5",
	borderStrong: "#d4d4d4",
	bgSubtle: "#fafafa",
	emerald: "#047857",
	amber: "#b45309",
	rose: "#be123c",
	white: "#ffffff",
} as const;

export const PDF_STYLES = StyleSheet.create({
	page: {
		fontFamily: "Helvetica",
		fontSize: 10,
		color: PDF_COLORS.foreground,
		paddingTop: 36,
		paddingHorizontal: 36,
		paddingBottom: 60,
	},
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 24,
	},
	brandWordmark: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.foreground,
		letterSpacing: 1,
	},
	brandTagline: {
		fontSize: 8,
		color: PDF_COLORS.mutedForeground,
		marginTop: 2,
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	docTitle: {
		fontSize: 28,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.primary,
		textAlign: "right",
		letterSpacing: 0.5,
	},
	docMetaRight: {
		alignItems: "flex-end",
		gap: 2,
	},
	docMetaLabel: {
		fontSize: 7,
		color: PDF_COLORS.mutedForeground,
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	docMetaValue: {
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.foreground,
	},
	twoCol: {
		flexDirection: "row",
		gap: 24,
		marginBottom: 24,
	},
	col: {
		flex: 1,
		gap: 4,
	},
	colHeader: {
		fontSize: 8,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.mutedForeground,
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 4,
	},
	colBody: {
		fontSize: 10,
		color: PDF_COLORS.foreground,
		lineHeight: 1.4,
	},
	colBodyMuted: {
		fontSize: 9,
		color: PDF_COLORS.mutedForeground,
		lineHeight: 1.4,
	},
	tableHeader: {
		flexDirection: "row",
		backgroundColor: PDF_COLORS.bgSubtle,
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: PDF_COLORS.borderStrong,
		paddingVertical: 8,
		paddingHorizontal: 4,
	},
	tableHeaderCell: {
		fontSize: 8,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.mutedForeground,
		textTransform: "uppercase",
		letterSpacing: 0.8,
	},
	tableRow: {
		flexDirection: "row",
		borderBottomWidth: 1,
		borderColor: PDF_COLORS.border,
		paddingVertical: 10,
		paddingHorizontal: 4,
	},
	tableRowZebra: {
		flexDirection: "row",
		backgroundColor: PDF_COLORS.bgSubtle,
		borderBottomWidth: 1,
		borderColor: PDF_COLORS.border,
		paddingVertical: 10,
		paddingHorizontal: 4,
	},
	tableCellLeft: {
		flex: 5,
		fontSize: 10,
		color: PDF_COLORS.foreground,
		lineHeight: 1.3,
	},
	tableCellQty: {
		flex: 1,
		fontSize: 10,
		color: PDF_COLORS.mutedForeground,
		textAlign: "right",
	},
	tableCellRight: {
		flex: 2,
		fontSize: 10,
		color: PDF_COLORS.foreground,
		textAlign: "right",
	},
	totalsBlock: {
		marginTop: 14,
		alignSelf: "flex-end",
		width: "55%",
		gap: 4,
	},
	totalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 4,
	},
	totalLabel: {
		fontSize: 10,
		color: PDF_COLORS.mutedForeground,
	},
	totalValue: {
		fontSize: 10,
		color: PDF_COLORS.foreground,
		fontFamily: "Helvetica-Bold",
	},
	totalRowGrand: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingTop: 10,
		paddingBottom: 4,
		marginTop: 4,
		borderTopWidth: 1.5,
		borderColor: PDF_COLORS.foreground,
	},
	totalLabelGrand: {
		fontSize: 12,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.foreground,
	},
	totalValueGrand: {
		fontSize: 14,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.primary,
	},
	footer: {
		position: "absolute",
		bottom: 30,
		left: 36,
		right: 36,
		paddingTop: 12,
		borderTopWidth: 1,
		borderColor: PDF_COLORS.border,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	footerText: {
		fontSize: 8,
		color: PDF_COLORS.subtle,
	},
	pageNumber: {
		fontSize: 8,
		color: PDF_COLORS.subtle,
	},
	notesBox: {
		marginTop: 20,
		padding: 12,
		backgroundColor: PDF_COLORS.bgSubtle,
		borderRadius: 4,
		borderLeftWidth: 3,
		borderLeftColor: PDF_COLORS.primary,
	},
	notesLabel: {
		fontSize: 8,
		fontFamily: "Helvetica-Bold",
		color: PDF_COLORS.mutedForeground,
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 4,
	},
	notesText: {
		fontSize: 9,
		color: PDF_COLORS.foreground,
		lineHeight: 1.5,
	},
	signatureRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 60,
		gap: 40,
	},
	signatureBlock: {
		flex: 1,
		alignItems: "center",
		gap: 4,
	},
	signatureLine: {
		marginTop: 50,
		paddingTop: 4,
		borderTopWidth: 1,
		borderColor: PDF_COLORS.foreground,
		width: "100%",
		alignItems: "center",
	},
	signatureLabel: {
		fontSize: 9,
		color: PDF_COLORS.foreground,
	},
	signatureSubLabel: {
		fontSize: 8,
		color: PDF_COLORS.mutedForeground,
	},
	statusBadge: {
		alignSelf: "flex-start",
		paddingVertical: 3,
		paddingHorizontal: 8,
		borderRadius: 4,
		fontSize: 8,
		fontFamily: "Helvetica-Bold",
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
});

export function formatRupiahForPdf(amount: number): string {
	if (!Number.isFinite(amount)) return "Rp 0";
	const sign = amount < 0 ? "-" : "";
	return `${sign}Rp ${Math.abs(Math.round(amount)).toLocaleString("id-ID")}`;
}

export function formatDateForPdf(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

export function formatDateShortForPdf(
	iso: string | null | undefined,
): string {
	if (!iso) return "—";
	const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function formatTimeForPdf(t: string | null | undefined): string {
	if (!t) return "—";
	return t.slice(0, 5);
}

// Reusable header block — used by all 3 document types
export function PdfHeader({
	docTitle,
	docNumber,
	docDate,
}: {
	docTitle: string;
	docNumber: string | null;
	docDate: string;
}) {
	return (
		<View style={PDF_STYLES.headerRow}>
			<View>
				<Text style={PDF_STYLES.brandWordmark}>TETRA</Text>
				<Text style={PDF_STYLES.brandTagline}>Photobooth · Bogor</Text>
			</View>
			<View style={{ alignItems: "flex-end", gap: 6 }}>
				<Text style={PDF_STYLES.docTitle}>{docTitle}</Text>
				<View style={PDF_STYLES.docMetaRight}>
					{docNumber && (
						<>
							<Text style={PDF_STYLES.docMetaLabel}>No.</Text>
							<Text style={PDF_STYLES.docMetaValue}>{docNumber}</Text>
						</>
					)}
					<Text style={[PDF_STYLES.docMetaLabel, { marginTop: 4 }]}>
						Tanggal terbit
					</Text>
					<Text style={PDF_STYLES.docMetaValue}>{docDate}</Text>
				</View>
			</View>
		</View>
	);
}

// Reusable footer
export function PdfFooter({
	contact,
}: {
	contact?: { wa?: string | null; email?: string | null };
}) {
	return (
		<View style={PDF_STYLES.footer} fixed>
			<View>
				<Text style={PDF_STYLES.footerText}>
					Tetra Photobooth · Bogor, Indonesia
				</Text>
				{(contact?.wa || contact?.email) && (
					<Text style={PDF_STYLES.footerText}>
						{contact?.wa && `WA ${contact.wa}`}
						{contact?.wa && contact?.email && " · "}
						{contact?.email && `${contact.email}`}
					</Text>
				)}
			</View>
			<Text
				style={PDF_STYLES.pageNumber}
				render={({ pageNumber, totalPages }) =>
					`Hal ${pageNumber} / ${totalPages}`
				}
			/>
		</View>
	);
}
