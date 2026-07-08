import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
	formatScheduleInline,
	hasBreak,
	parseSegments,
} from "@/lib/schedule/segments";
import {
	formatDateForPdf,
	formatDateShortForPdf,
	formatTimeForPdf,
	PDF_COLORS,
	PDF_STYLES,
	PdfFooter,
	PdfHeader,
} from "./document-base";

export type BastData = {
	docNumber: string;
	issuedAt: string;
	client: {
		name: string;
		picName?: string | null;
		picPosition?: string | null;
	};
	event: {
		projectId: string;
		date: string;
		setupTime: string | null;
		startTime: string | null;
		endTime: string | null;
		/** Raw events.session_segments JSONB — multi-sesi (jeda) or null. */
		sessionSegments?: unknown;
		venueName: string;
		venueAddress?: string | null;
		packageName: string | null;
		frameSize: string;
	};
	deliverables: Array<{
		label: string;
		quantity: number;
		notes?: string;
	}>;
	crewLead: {
		fullName: string;
		role: string;
	} | null;
	notes?: string | null;
	contact?: { wa?: string | null; email?: string | null };
};

export function BastDocument({ data }: { data: BastData }) {
	const segments = parseSegments(data.event.sessionSegments);
	return (
		<Document title={`BAST ${data.docNumber}`}>
			<Page size="A4" style={PDF_STYLES.page}>
				<PdfHeader
					docTitle="BAST"
					docNumber={data.docNumber}
					docDate={formatDateShortForPdf(data.issuedAt)}
				/>

				<Text
					style={{
						fontSize: 11,
						color: PDF_COLORS.mutedForeground,
						marginBottom: 8,
					}}
				>
					Berita Acara Serah Terima
				</Text>

				<Text
					style={{
						fontSize: 10,
						lineHeight: 1.6,
						marginBottom: 16,
						color: PDF_COLORS.foreground,
					}}
				>
					Pada hari ini,{" "}
					<Text style={{ fontFamily: "Helvetica-Bold" }}>
						{formatDateForPdf(data.issuedAt)}
					</Text>
					, telah dilaksanakan serah terima hasil layanan photobooth oleh{" "}
					<Text style={{ fontFamily: "Helvetica-Bold" }}>Tetra Photobooth</Text>{" "}
					(selanjutnya disebut "Pihak Pertama") kepada{" "}
					<Text style={{ fontFamily: "Helvetica-Bold" }}>
						{data.client.name}
					</Text>{" "}
					(selanjutnya disebut "Pihak Kedua") atas event berikut:
				</Text>

				<View style={PDF_STYLES.twoCol}>
					<View style={PDF_STYLES.col}>
						<Text style={PDF_STYLES.colHeader}>Pihak Kedua</Text>
						<Text
							style={[PDF_STYLES.colBody, { fontFamily: "Helvetica-Bold" }]}
						>
							{data.client.name}
						</Text>
						{data.client.picName && (
							<Text style={PDF_STYLES.colBodyMuted}>
								PIC: {data.client.picName}
								{data.client.picPosition ? ` (${data.client.picPosition})` : ""}
							</Text>
						)}
					</View>
					<View style={PDF_STYLES.col}>
						<Text style={PDF_STYLES.colHeader}>Detail Event</Text>
						<Text
							style={[PDF_STYLES.colBody, { fontFamily: "Helvetica-Bold" }]}
						>
							{data.event.projectId}
						</Text>
						<Text style={PDF_STYLES.colBodyMuted}>
							{formatDateForPdf(data.event.date)}
						</Text>
						{hasBreak(segments) ? (
							<Text style={PDF_STYLES.colBodyMuted}>
								{formatScheduleInline(
									data.event.startTime,
									data.event.endTime,
									segments,
								)}{" "}
								(Setup {formatTimeForPdf(data.event.setupTime)})
							</Text>
						) : (
							<Text style={PDF_STYLES.colBodyMuted}>
								{formatTimeForPdf(data.event.startTime)} —{" "}
								{formatTimeForPdf(data.event.endTime)} (Setup{" "}
								{formatTimeForPdf(data.event.setupTime)})
							</Text>
						)}
						<Text style={PDF_STYLES.colBodyMuted}>{data.event.venueName}</Text>
						{data.event.venueAddress && (
							<Text style={PDF_STYLES.colBodyMuted}>
								{data.event.venueAddress}
							</Text>
						)}
						{data.event.packageName && (
							<Text style={PDF_STYLES.colBodyMuted}>
								Paket: {data.event.packageName}
							</Text>
						)}
						<Text style={PDF_STYLES.colBodyMuted}>
							Frame: {data.event.frameSize}
						</Text>
					</View>
				</View>

				{/* Deliverables */}
				<Text
					style={{
						fontSize: 10,
						fontFamily: "Helvetica-Bold",
						marginTop: 8,
						marginBottom: 8,
					}}
				>
					Deliverables yang diserahterimakan:
				</Text>

				<View style={PDF_STYLES.tableHeader}>
					<Text style={[PDF_STYLES.tableHeaderCell, { flex: 1 }]}>No.</Text>
					<Text style={[PDF_STYLES.tableHeaderCell, { flex: 6 }]}>Item</Text>
					<Text
						style={[
							PDF_STYLES.tableHeaderCell,
							{ flex: 2, textAlign: "right" },
						]}
					>
						Qty
					</Text>
				</View>

				{data.deliverables.length === 0 ? (
					<View style={PDF_STYLES.tableRow}>
						<Text style={[PDF_STYLES.tableCellLeft, { flex: 9 }]}>
							Layanan photobooth selesai sesuai paket.
						</Text>
					</View>
				) : (
					data.deliverables.map((d, i) => (
						<View
							// biome-ignore lint/suspicious/noArrayIndexKey: PDF render
							key={i}
							style={
								i % 2 === 1 ? PDF_STYLES.tableRowZebra : PDF_STYLES.tableRow
							}
						>
							<Text
								style={{
									flex: 1,
									fontSize: 10,
									color: PDF_COLORS.mutedForeground,
								}}
							>
								{i + 1}.
							</Text>
							<View style={[PDF_STYLES.tableCellLeft, { flex: 6 }]}>
								<Text>{d.label}</Text>
								{d.notes && (
									<Text
										style={{
											fontSize: 8,
											color: PDF_COLORS.mutedForeground,
											marginTop: 2,
										}}
									>
										{d.notes}
									</Text>
								)}
							</View>
							<Text style={[PDF_STYLES.tableCellRight, { flex: 2 }]}>
								{d.quantity.toLocaleString("id-ID")}
							</Text>
						</View>
					))
				)}

				<Text
					style={{
						fontSize: 10,
						lineHeight: 1.6,
						marginTop: 18,
						color: PDF_COLORS.foreground,
					}}
				>
					Pihak Kedua dengan ini menyatakan bahwa layanan tersebut telah
					diterima dengan baik dan sesuai dengan kesepakatan. Berita acara ini
					dibuat untuk dipergunakan sebagaimana mestinya.
				</Text>

				{data.notes && (
					<View style={PDF_STYLES.notesBox}>
						<Text style={PDF_STYLES.notesLabel}>Catatan</Text>
						<Text style={PDF_STYLES.notesText}>{data.notes}</Text>
					</View>
				)}

				{/* Signatures */}
				<View style={PDF_STYLES.signatureRow}>
					<View style={PDF_STYLES.signatureBlock}>
						<Text style={[PDF_STYLES.signatureSubLabel, { marginBottom: 4 }]}>
							Pihak Pertama
						</Text>
						<View style={PDF_STYLES.signatureLine}>
							<Text style={PDF_STYLES.signatureLabel}>
								{data.crewLead?.fullName ?? "Tetra Photobooth"}
							</Text>
							<Text style={PDF_STYLES.signatureSubLabel}>
								{data.crewLead?.role
									? `(${data.crewLead.role})`
									: "Tetra Photobooth"}
							</Text>
						</View>
					</View>
					<View style={PDF_STYLES.signatureBlock}>
						<Text style={[PDF_STYLES.signatureSubLabel, { marginBottom: 4 }]}>
							Pihak Kedua
						</Text>
						<View style={PDF_STYLES.signatureLine}>
							<Text style={PDF_STYLES.signatureLabel}>
								{data.client.picName ?? data.client.name}
							</Text>
							<Text style={PDF_STYLES.signatureSubLabel}>
								{data.client.picPosition ?? "—"}
							</Text>
						</View>
					</View>
				</View>

				<PdfFooter contact={data.contact} />
			</Page>
		</Document>
	);
}
