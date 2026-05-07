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

export type InvoiceLineItem = {
	label: string;
	detail?: string;
	quantity: number;
	unitPrice: number;
	total: number;
};

export type InvoiceData = {
	docNumber: string;
	issuedAt: string;
	dueDate: string | null;
	client: {
		name: string;
		wa?: string | null;
		email?: string | null;
		address?: string | null;
	};
	event: {
		projectId: string;
		date: string;
		setupTime: string | null;
		startTime: string | null;
		endTime: string | null;
		venueName: string;
		venueAddress?: string | null;
	};
	lineItems: InvoiceLineItem[];
	discount: number;
	grossUp: number;
	grandTotal: number;
	totalPaid: number;
	remainingBalance: number;
	bankAccount: {
		bankName: string;
		accountName: string;
		accountNumber: string | null;
	} | null;
	notes?: string | null;
	contact?: { wa?: string | null; email?: string | null };
};

const STATUS_TONES = {
	paid: { bg: "#d1fae5", text: PDF_COLORS.emerald, label: "PAID" },
	partial: { bg: "#fef3c7", text: PDF_COLORS.amber, label: "DP / PARTIAL" },
	unpaid: { bg: "#fee2e2", text: PDF_COLORS.rose, label: "UNPAID" },
	overdue: { bg: "#fecaca", text: PDF_COLORS.rose, label: "OVERDUE" },
};

function paymentStatusFor(d: InvoiceData): keyof typeof STATUS_TONES {
	if (d.remainingBalance <= 0 && d.grandTotal > 0) return "paid";
	if (d.totalPaid > 0) return "partial";
	if (d.dueDate && new Date(d.dueDate) < new Date()) return "overdue";
	return "unpaid";
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
	const status = paymentStatusFor(data);
	const tone = STATUS_TONES[status];

	return (
		<Document title={`Invoice ${data.docNumber}`}>
			<Page size="A4" style={PDF_STYLES.page}>
				<PdfHeader
					docTitle="INVOICE"
					docNumber={data.docNumber}
					docDate={formatDateShortForPdf(data.issuedAt)}
				/>

				{/* Status badge */}
				<View
					style={{
						...PDF_STYLES.statusBadge,
						backgroundColor: tone.bg,
						color: tone.text,
						marginBottom: 18,
					}}
				>
					<Text>{tone.label}</Text>
				</View>

				{/* Bill to + Event */}
				<View style={PDF_STYLES.twoCol}>
					<View style={PDF_STYLES.col}>
						<Text style={PDF_STYLES.colHeader}>Bill to</Text>
						<Text style={[PDF_STYLES.colBody, { fontFamily: "Helvetica-Bold" }]}>
							{data.client.name}
						</Text>
						{data.client.wa && (
							<Text style={PDF_STYLES.colBodyMuted}>WA · {data.client.wa}</Text>
						)}
						{data.client.email && (
							<Text style={PDF_STYLES.colBodyMuted}>{data.client.email}</Text>
						)}
						{data.client.address && (
							<Text style={PDF_STYLES.colBodyMuted}>{data.client.address}</Text>
						)}
					</View>
					<View style={PDF_STYLES.col}>
						<Text style={PDF_STYLES.colHeader}>Event details</Text>
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
						{data.event.venueAddress && (
							<Text style={PDF_STYLES.colBodyMuted}>
								{data.event.venueAddress}
							</Text>
						)}
					</View>
				</View>

				{/* Line items */}
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
									style={{ fontSize: 8, color: PDF_COLORS.mutedForeground, marginTop: 2 }}
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

				{/* Totals */}
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
					{data.totalPaid > 0 && (
						<>
							<View style={[PDF_STYLES.totalRow, { marginTop: 6 }]}>
								<Text style={PDF_STYLES.totalLabel}>Sudah dibayar</Text>
								<Text style={[PDF_STYLES.totalValue, { color: PDF_COLORS.emerald }]}>
									{formatRupiahForPdf(data.totalPaid)}
								</Text>
							</View>
							<View style={PDF_STYLES.totalRow}>
								<Text
									style={[PDF_STYLES.totalLabel, { fontFamily: "Helvetica-Bold" }]}
								>
									Sisa
								</Text>
								<Text
									style={[
										PDF_STYLES.totalValue,
										{
											color:
												data.remainingBalance > 0
													? PDF_COLORS.rose
													: PDF_COLORS.emerald,
										},
									]}
								>
									{formatRupiahForPdf(data.remainingBalance)}
								</Text>
							</View>
						</>
					)}
				</View>

				{/* Payment instructions */}
				{data.bankAccount && data.remainingBalance > 0 && (
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
							Pembayaran
						</Text>
						<Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>
							{data.bankAccount.bankName} ·{" "}
							{data.bankAccount.accountNumber ?? "—"}
						</Text>
						<Text style={{ fontSize: 9, color: PDF_COLORS.mutedForeground }}>
							a.n. {data.bankAccount.accountName}
						</Text>
						{data.dueDate && (
							<Text style={{ fontSize: 9, color: PDF_COLORS.rose, marginTop: 4 }}>
								Mohon dilunasi sebelum {formatDateShortForPdf(data.dueDate)}
							</Text>
						)}
					</View>
				)}

				{/* Notes */}
				{data.notes && (
					<View style={PDF_STYLES.notesBox}>
						<Text style={PDF_STYLES.notesLabel}>Catatan</Text>
						<Text style={PDF_STYLES.notesText}>{data.notes}</Text>
					</View>
				)}

				<PdfFooter contact={data.contact} />
			</Page>
		</Document>
	);
}
