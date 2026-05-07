import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
	formatDateForPdf,
	formatDateShortForPdf,
	formatRupiahForPdf,
	formatTimeForPdf,
	PDF_COLORS,
	PDF_STYLES,
	PdfFooter,
	PdfHeader,
} from "./document-base";
import type { InvoiceLineItem } from "./invoice-document";

export type QuotationData = {
	docNumber: string;
	issuedAt: string;
	validUntil: string | null;
	client: {
		name: string;
		wa?: string | null;
		email?: string | null;
	};
	event: {
		projectId: string;
		date: string;
		setupTime: string | null;
		startTime: string | null;
		endTime: string | null;
		venueName: string;
	};
	lineItems: InvoiceLineItem[];
	discount: number;
	grossUp: number;
	grandTotal: number;
	dpRequired: number;
	bankAccount: {
		bankName: string;
		accountName: string;
		accountNumber: string | null;
	} | null;
	terms?: string | null;
	contact?: { wa?: string | null; email?: string | null };
};

export function QuotationDocument({ data }: { data: QuotationData }) {
	return (
		<Document title={`Quotation ${data.docNumber}`}>
			<Page size="A4" style={PDF_STYLES.page}>
				<PdfHeader
					docTitle="QUOTATION"
					docNumber={data.docNumber}
					docDate={formatDateShortForPdf(data.issuedAt)}
				/>

				<View
					style={{
						...PDF_STYLES.statusBadge,
						backgroundColor: "#dbeafe",
						color: "#1d4ed8",
						marginBottom: 18,
					}}
				>
					<Text>QUOTE / ESTIMATE</Text>
				</View>

				<View style={PDF_STYLES.twoCol}>
					<View style={PDF_STYLES.col}>
						<Text style={PDF_STYLES.colHeader}>Untuk</Text>
						<Text style={[PDF_STYLES.colBody, { fontFamily: "Helvetica-Bold" }]}>
							{data.client.name}
						</Text>
						{data.client.wa && (
							<Text style={PDF_STYLES.colBodyMuted}>WA · {data.client.wa}</Text>
						)}
						{data.client.email && (
							<Text style={PDF_STYLES.colBodyMuted}>{data.client.email}</Text>
						)}
					</View>
					<View style={PDF_STYLES.col}>
						<Text style={PDF_STYLES.colHeader}>Event</Text>
						<Text style={[PDF_STYLES.colBody, { fontFamily: "Helvetica-Bold" }]}>
							{data.event.projectId}
						</Text>
						<Text style={PDF_STYLES.colBodyMuted}>
							{formatDateForPdf(data.event.date)}
						</Text>
						<Text style={PDF_STYLES.colBodyMuted}>
							Setup {formatTimeForPdf(data.event.setupTime)} · Mulai{" "}
							{formatTimeForPdf(data.event.startTime)} · Selesai{" "}
							{formatTimeForPdf(data.event.endTime)}
						</Text>
						<Text style={PDF_STYLES.colBodyMuted}>{data.event.venueName}</Text>
					</View>
				</View>

				<View style={PDF_STYLES.tableHeader}>
					<Text style={[PDF_STYLES.tableHeaderCell, { flex: 5 }]}>
						Item / Layanan
					</Text>
					<Text
						style={[
							PDF_STYLES.tableHeaderCell,
							{ flex: 1, textAlign: "right" },
						]}
					>
						Qty
					</Text>
					<Text
						style={[
							PDF_STYLES.tableHeaderCell,
							{ flex: 2, textAlign: "right" },
						]}
					>
						Harga
					</Text>
					<Text
						style={[
							PDF_STYLES.tableHeaderCell,
							{ flex: 2, textAlign: "right" },
						]}
					>
						Subtotal
					</Text>
				</View>

				{data.lineItems.map((item, i) => (
					<View
						// biome-ignore lint/suspicious/noArrayIndexKey: PDF render is server-side, list is stable
						key={i}
						style={i % 2 === 1 ? PDF_STYLES.tableRowZebra : PDF_STYLES.tableRow}
					>
						<View style={PDF_STYLES.tableCellLeft}>
							<Text>{item.label}</Text>
							{item.detail && (
								<Text
									style={{
										fontSize: 8,
										color: PDF_COLORS.mutedForeground,
										marginTop: 2,
									}}
								>
									{item.detail}
								</Text>
							)}
						</View>
						<Text style={PDF_STYLES.tableCellQty}>{item.quantity}×</Text>
						<Text style={PDF_STYLES.tableCellRight}>
							{formatRupiahForPdf(item.unitPrice)}
						</Text>
						<Text
							style={[PDF_STYLES.tableCellRight, { fontFamily: "Helvetica-Bold" }]}
						>
							{formatRupiahForPdf(item.total)}
						</Text>
					</View>
				))}

				<View style={PDF_STYLES.totalsBlock}>
					<View style={PDF_STYLES.totalRow}>
						<Text style={PDF_STYLES.totalLabel}>Subtotal</Text>
						<Text style={PDF_STYLES.totalValue}>
							{formatRupiahForPdf(
								data.lineItems.reduce((s, l) => s + l.total, 0),
							)}
						</Text>
					</View>
					{data.discount > 0 && (
						<View style={PDF_STYLES.totalRow}>
							<Text style={PDF_STYLES.totalLabel}>Discount</Text>
							<Text style={[PDF_STYLES.totalValue, { color: PDF_COLORS.emerald }]}>
								− {formatRupiahForPdf(data.discount)}
							</Text>
						</View>
					)}
					{data.grossUp > 0 && (
						<View style={PDF_STYLES.totalRow}>
							<Text style={PDF_STYLES.totalLabel}>Gross-up PPh</Text>
							<Text style={PDF_STYLES.totalValue}>
								+ {formatRupiahForPdf(data.grossUp)}
							</Text>
						</View>
					)}
					<View style={PDF_STYLES.totalRowGrand}>
						<Text style={PDF_STYLES.totalLabelGrand}>Grand total</Text>
						<Text style={PDF_STYLES.totalValueGrand}>
							{formatRupiahForPdf(data.grandTotal)}
						</Text>
					</View>
					{data.dpRequired > 0 && (
						<View style={[PDF_STYLES.totalRow, { marginTop: 6 }]}>
							<Text
								style={[PDF_STYLES.totalLabel, { fontFamily: "Helvetica-Bold" }]}
							>
								DP buat lock slot
							</Text>
							<Text
								style={[PDF_STYLES.totalValue, { color: PDF_COLORS.primary }]}
							>
								{formatRupiahForPdf(data.dpRequired)}
							</Text>
						</View>
					)}
				</View>

				{data.bankAccount && (
					<View
						style={{
							marginTop: 24,
							padding: 12,
							backgroundColor: PDF_COLORS.bgSubtle,
							borderRadius: 4,
							gap: 4,
						}}
					>
						<Text
							style={{
								fontSize: 8,
								fontFamily: "Helvetica-Bold",
								color: PDF_COLORS.mutedForeground,
								textTransform: "uppercase",
								letterSpacing: 1,
							}}
						>
							Pembayaran DP
						</Text>
						<Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>
							{data.bankAccount.bankName} ·{" "}
							{data.bankAccount.accountNumber ?? "—"}
						</Text>
						<Text style={{ fontSize: 9, color: PDF_COLORS.mutedForeground }}>
							a.n. {data.bankAccount.accountName}
						</Text>
					</View>
				)}

				<View style={PDF_STYLES.notesBox}>
					<Text style={PDF_STYLES.notesLabel}>Syarat & Ketentuan</Text>
					<Text style={PDF_STYLES.notesText}>
						{data.terms ??
							[
								"• Slot terkunci setelah DP minimum 30% diterima.",
								"• Pelunasan H-3 sebelum hari event.",
								"• Reschedule max 1× tanpa biaya, > 1× kena admin fee.",
								"• Cancellation: DP non-refundable.",
								data.validUntil
									? `• Berlaku sampai ${formatDateShortForPdf(data.validUntil)}.`
									: "",
							]
								.filter(Boolean)
								.join("\n")}
					</Text>
				</View>

				<PdfFooter contact={data.contact} />
			</Page>
		</Document>
	);
}
