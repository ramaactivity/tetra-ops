/**
 * Satu komponen PDF untuk semua dokumen klien. Varian per `docType`:
 *   quotation / invoice / nota_lunas → tabel item + total (+ pembayaran)
 *   receipt                          → kuitansi satu pembayaran (terbilang)
 *   bast                             → berita acara + serah terima + 2 ttd
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PdfDocData } from "@/lib/documents/pdf-data";
import { COMPANY, DOC_TITLE } from "@/lib/documents/types";
import { terbilangRupiah } from "@/lib/terbilang";
import {
	formatDateForPdf,
	formatDateLongForPdf,
	formatRupiahForPdf,
	PDF_COLORS,
	PDF_STYLES,
	PdfBullets,
	PdfFooter,
	PdfHeader,
	PdfSignature,
	PdfSignatureBlank,
	PdfStamp,
} from "./document-base";

const S = PDF_STYLES;
const rp = formatRupiahForPdf;

function ClientBlock({ d }: { d: PdfDocData }) {
	const c = d.client;
	return (
		<View style={S.col}>
			<Text style={S.eyebrow}>Ditujukan kepada</Text>
			<Text style={S.bodyBold}>{c.name}</Text>
			{c.org ? <Text style={S.body}>{c.org}</Text> : null}
			{c.address ? <Text style={S.bodyMuted}>{c.address}</Text> : null}
			{c.phone ? <Text style={S.bodyMuted}>WA {c.phone}</Text> : null}
			{c.email ? <Text style={S.bodyMuted}>{c.email}</Text> : null}
		</View>
	);
}

function Meta({ k, v }: { k: string; v: string | null | undefined }) {
	if (!v) return null;
	return (
		<View style={S.metaRow}>
			<Text style={S.metaKey}>{k}</Text>
			<Text style={S.metaVal}>{v}</Text>
		</View>
	);
}

function DetailBlock({ d }: { d: PdfDocData }) {
	const venue = [d.event.venue, d.event.city].filter(Boolean).join(", ");
	return (
		<View style={S.col}>
			<Text style={S.eyebrow}>Detail</Text>
			<Meta k="Tanggal terbit" v={formatDateForPdf(d.issuedAt)} />
			{d.docType === "quotation" ? (
				<Meta
					k="Berlaku sampai"
					v={d.validUntil ? formatDateForPdf(d.validUntil) : null}
				/>
			) : null}
			{d.docType === "invoice" ? (
				<Meta
					k="Jatuh tempo"
					v={d.dueDate ? formatDateForPdf(d.dueDate) : null}
				/>
			) : null}
			<Meta
				k="Waktu acara"
				v={d.event.date ? formatDateLongForPdf(d.event.date) : null}
			/>
			<Meta k="Jam" v={d.event.time} />
			<Meta k="Lokasi" v={venue || null} />
			{d.event.address ? <Meta k="" v={d.event.address} /> : null}
			<Meta k="Kode event" v={d.event.projectId} />
		</View>
	);
}

function ItemsTable({ d }: { d: PdfDocData }) {
	return (
		<View>
			<View style={S.th} fixed>
				<Text style={[S.thText, S.cellName]}>Item</Text>
				<Text style={[S.thText, S.cellQty]}>Qty</Text>
				<Text style={[S.thText, S.cellPrice]}>Harga</Text>
				<Text style={[S.thText, S.cellTotal]}>Jumlah</Text>
			</View>
			{d.items.map((it, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: urutan item stabil saat render
				<View key={i} style={S.tr} wrap={false}>
					<View style={S.cellName}>
						<Text style={S.bodyBold}>{it.name}</Text>
						{it.includes.filter(Boolean).map((inc, j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
							<Text key={j} style={S.include}>
								· {inc}
							</Text>
						))}
					</View>
					<Text style={[S.body, S.cellQty]}>{it.qty}</Text>
					<Text style={[S.body, S.cellPrice]}>{rp(it.unit_price)}</Text>
					<Text style={[S.body, S.cellTotal]}>
						{rp(it.qty * it.unit_price)}
					</Text>
				</View>
			))}
		</View>
	);
}

function Totals({ d }: { d: PdfDocData }) {
	const t = d.totals;
	const showSub = t.discount > 0 || t.grossUp > 0;
	return (
		<View style={S.totals} wrap={false}>
			{showSub ? (
				<View style={S.totalRow}>
					<Text style={S.totalKey}>Subtotal</Text>
					<Text style={S.totalVal}>{rp(t.subtotal)}</Text>
				</View>
			) : null}
			{t.discount > 0 ? (
				<View style={S.totalRow}>
					<Text style={S.totalKey}>Diskon</Text>
					<Text style={S.totalVal}>- {rp(t.discount)}</Text>
				</View>
			) : null}
			{t.grossUp > 0 ? (
				<View style={S.totalRow}>
					<Text style={S.totalKey}>
						Gross-up PPh {formatRate(d.grossUpRate)}%
					</Text>
					<Text style={S.totalVal}>{rp(t.grossUp)}</Text>
				</View>
			) : null}
			<View style={S.totalGrand}>
				<Text style={S.totalGrandKey}>TOTAL</Text>
				<Text style={S.totalGrandVal}>{rp(t.total)}</Text>
			</View>
			{d.payment ? (
				<>
					<View style={S.totalRow}>
						<Text style={S.totalKey}>Sudah dibayar</Text>
						<Text style={S.totalVal}>{rp(d.payment.totalPaid)}</Text>
					</View>
					<View
						style={[
							S.totalRow,
							{ borderTopWidth: 1, borderTopColor: PDF_COLORS.border },
						]}
					>
						<Text
							style={[
								S.totalKey,
								{ fontFamily: "Helvetica-Bold", color: PDF_COLORS.ink },
							]}
						>
							{d.payment.remaining > 0 ? "Sisa tagihan" : "Sisa tagihan"}
						</Text>
						<Text
							style={[
								S.totalVal,
								{ fontFamily: "Helvetica-Bold" },
								d.payment.remaining > 0 ? {} : { color: PDF_COLORS.limeText },
							]}
						>
							{d.payment.remaining > 0 ? rp(d.payment.remaining) : "LUNAS"}
						</Text>
					</View>
				</>
			) : null}
		</View>
	);
}

function formatRate(r: number) {
	return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

function BankBox({ d }: { d: PdfDocData }) {
	if (!d.bank) return null;
	return (
		<View style={[S.box, { flex: 1 }]} wrap={false}>
			<Text style={S.eyebrow}>Pembayaran ke</Text>
			<Text style={S.bodyBold}>
				{d.bank.bankName}
				{d.bank.accountNumber ? ` · ${d.bank.accountNumber}` : ""}
			</Text>
			<Text style={S.body}>a.n. {d.bank.accountHolder}</Text>
			<Text style={[S.bodyMuted, { marginTop: 3 }]}>
				Mohon kirim bukti transfer ke WA {COMPANY.whatsapp}.
			</Text>
		</View>
	);
}

function PaymentHistory({ d }: { d: PdfDocData }) {
	if (!d.payment || d.payment.history.length === 0) return null;
	return (
		<View style={[S.box, { flex: 1 }]} wrap={false}>
			<Text style={S.eyebrow}>Riwayat pembayaran</Text>
			{d.payment.history.map((p) => (
				<View
					key={p.ref}
					style={{
						flexDirection: "row",
						justifyContent: "space-between",
						marginBottom: 2,
					}}
				>
					<Text style={S.bodyMuted}>
						{formatDateForPdf(p.date)} · {labelType(p.type)}
						{p.bank ? ` · ${p.bank}` : ""}
					</Text>
					<Text style={S.body}>{rp(p.amount)}</Text>
				</View>
			))}
		</View>
	);
}

function labelType(t: string) {
	return t === "dp"
		? "DP"
		: t === "partial"
			? "Cicilan"
			: t === "pelunasan"
				? "Pelunasan"
				: t;
}

/** Catatan + S&K di kiri, tanda tangan di kanan — hemat tinggi, seperti referensi Canva. */
function TermsAndSignature({ d, label }: { d: PdfDocData; label?: string }) {
	const lines = (d.terms ?? "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	return (
		<View style={{ flexDirection: "row", gap: 24, marginTop: 18 }} wrap={false}>
			<View style={{ flex: 1 }}>
				{d.notes ? (
					<View style={{ marginBottom: 10 }}>
						<Text style={S.eyebrow}>Catatan</Text>
						<Text style={S.body}>{d.notes}</Text>
					</View>
				) : null}
				{lines.length ? (
					<View>
						<Text style={S.eyebrow}>Syarat & ketentuan</Text>
						<PdfBullets lines={lines} />
					</View>
				) : null}
			</View>
			<PdfSignature signer={d.signer} label={label} />
		</View>
	);
}

function ClosingSignature({ d, label }: { d: PdfDocData; label?: string }) {
	return (
		<View style={S.signRow}>
			<PdfSignature signer={d.signer} label={label} />
		</View>
	);
}

// ---------------------------------------------------------------------------

function BillingPage({ d }: { d: PdfDocData }) {
	const paid = d.payment
		? d.payment.remaining <= 0 && d.payment.totalPaid > 0
		: false;
	const stamp =
		d.docType === "nota_lunas" || paid
			? { text: "LUNAS", tone: "lime" as const }
			: d.docType === "invoice" && d.payment && d.payment.totalPaid > 0
				? { text: "DP DITERIMA", tone: "orange" as const }
				: null;
	return (
		<Page size="A4" style={S.page}>
			<PdfHeader
				title={DOC_TITLE[d.docType]}
				docNumber={d.docNumber}
				small={d.docType === "nota_lunas"}
			/>
			{stamp ? <PdfStamp text={stamp.text} tone={stamp.tone} /> : null}
			<View style={S.twoCol}>
				<ClientBlock d={d} />
				<DetailBlock d={d} />
			</View>
			{d.docType === "nota_lunas" ? (
				<Text style={[S.body, { marginBottom: 10 }]}>
					Dengan ini kami menyatakan bahwa tagihan untuk layanan di bawah ini
					telah dibayar{" "}
					<Text style={{ fontFamily: "Helvetica-Bold" }}>LUNAS</Text> oleh{" "}
					{d.client.name}. Terima kasih atas kepercayaannya.
				</Text>
			) : null}
			<ItemsTable d={d} />
			<Totals d={d} />
			{d.docType === "invoice" || d.docType === "nota_lunas" ? (
				<View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
					{d.docType === "invoice" && !paid ? <BankBox d={d} /> : null}
					<PaymentHistory d={d} />
				</View>
			) : null}
			<TermsAndSignature d={d} />
			<PdfFooter />
		</Page>
	);
}

function ReceiptPage({ d }: { d: PdfDocData }) {
	const r = d.receipt;
	if (!r) return null;
	const eventLine = [
		d.event.date ? formatDateLongForPdf(d.event.date) : null,
		d.event.venue,
	]
		.filter(Boolean)
		.join(" · ");
	const itemsLine = d.items.map((i) => i.name).join(", ");
	return (
		<Page size="A4" style={S.page}>
			<PdfHeader title={DOC_TITLE.receipt} docNumber={d.docNumber} />
			{r.remainingAfter <= 0 ? <PdfStamp text="LUNAS" tone="lime" /> : null}
			<View style={{ gap: 10, marginTop: 4 }}>
				<Meta
					k="Telah terima dari"
					v={
						d.client.org ? `${d.client.name} — ${d.client.org}` : d.client.name
					}
				/>
				<View>
					<Text style={S.eyebrow}>Uang sejumlah</Text>
					<Text
						style={{
							fontSize: 22,
							lineHeight: 1.1,
							fontFamily: "Helvetica-Bold",
						}}
					>
						{rp(r.amount)}
					</Text>
					<View
						style={[
							S.box,
							{ marginTop: 8, backgroundColor: PDF_COLORS.bandSoft },
						]}
					>
						<Text style={[S.body, { fontStyle: "italic" }]}>
							{terbilangRupiah(r.amount)}
						</Text>
					</View>
				</View>
				<Meta
					k="Untuk pembayaran"
					v={`${r.paymentType}${itemsLine ? ` — ${itemsLine}` : ""}`}
				/>
				{eventLine ? <Meta k="Acara" v={eventLine} /> : null}
				<Meta k="Tanggal bayar" v={formatDateForPdf(r.date)} />
				{r.bank ? <Meta k="Diterima via" v={r.bank} /> : null}
			</View>

			<View style={[S.totals, { marginTop: 22 }]}>
				<View style={S.totalRow}>
					<Text style={S.totalKey}>Total tagihan</Text>
					<Text style={S.totalVal}>{rp(r.billable)}</Text>
				</View>
				{r.paidBefore > 0 ? (
					<View style={S.totalRow}>
						<Text style={S.totalKey}>Dibayar sebelumnya</Text>
						<Text style={S.totalVal}>{rp(r.paidBefore)}</Text>
					</View>
				) : null}
				<View style={S.totalRow}>
					<Text style={S.totalKey}>Pembayaran ini</Text>
					<Text style={S.totalVal}>{rp(r.amount)}</Text>
				</View>
				<View style={S.totalGrand}>
					<Text style={S.totalGrandKey}>SISA TAGIHAN</Text>
					<Text
						style={[
							S.totalGrandVal,
							r.remainingAfter <= 0 ? { color: PDF_COLORS.limeText } : {},
						]}
					>
						{r.remainingAfter <= 0 ? "LUNAS" : rp(r.remainingAfter)}
					</Text>
				</View>
			</View>

			<ClosingSignature d={d} label="Penerima," />
			<PdfFooter />
		</Page>
	);
}

function BastPage({ d }: { d: PdfDocData }) {
	const b = d.bast;
	const picName = b?.picName ?? d.client.name;
	return (
		<Page size="A4" style={S.page}>
			<PdfHeader title="BAST" docNumber={d.docNumber} />
			<Text style={[S.bodyMuted, { marginBottom: 10 }]}>
				Berita Acara Serah Terima Layanan
			</Text>
			<Text style={[S.body, { lineHeight: 1.6, marginBottom: 14 }]}>
				Pada hari ini, {formatDateLongForPdf(d.issuedAt)}, {COMPANY.name} (Pihak
				Pertama) telah melaksanakan dan menyerahkan hasil layanan kepada{" "}
				<Text style={{ fontFamily: "Helvetica-Bold" }}>{d.client.name}</Text>
				{d.client.org ? ` (${d.client.org})` : ""} (Pihak Kedua) untuk acara
				pada {d.event.date ? formatDateLongForPdf(d.event.date) : "—"}
				{d.event.venue ? ` di ${d.event.venue}` : ""}
				{d.event.city ? `, ${d.event.city}` : ""}. Pihak Kedua menyatakan telah
				menerima layanan dalam kondisi baik dan sesuai kesepakatan.
			</Text>

			<View style={S.th}>
				<Text style={[S.thText, { flex: 6 }]}>
					Layanan / hasil yang diserahkan
				</Text>
				<Text style={[S.thText, { width: 34, textAlign: "right" }]}>Qty</Text>
				<Text style={[S.thText, { flex: 3 }]}>Keterangan</Text>
			</View>
			{(
				b?.deliverables ??
				d.items.map((i) => ({
					label: i.name,
					quantity: i.qty,
					notes: i.includes[0],
				}))
			).map((row, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
				<View key={i} style={S.tr} wrap={false}>
					<Text style={[S.body, { flex: 6 }]}>{row.label}</Text>
					<Text style={[S.body, { width: 34, textAlign: "right" }]}>
						{row.quantity}
					</Text>
					<Text style={[S.bodyMuted, { flex: 3 }]}>{row.notes ?? ""}</Text>
				</View>
			))}

			<View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
				<View style={[S.box, { flex: 1 }]}>
					<Text style={S.eyebrow}>Pihak Pertama</Text>
					<Text style={S.bodyBold}>{COMPANY.name}</Text>
					{b?.crewLead ? (
						<Text style={S.bodyMuted}>Crew lead: {b.crewLead}</Text>
					) : null}
				</View>
				<View style={[S.box, { flex: 1 }]}>
					<Text style={S.eyebrow}>Pihak Kedua</Text>
					<Text style={S.bodyBold}>{d.client.name}</Text>
					{d.client.org ? (
						<Text style={S.bodyMuted}>{d.client.org}</Text>
					) : null}
				</View>
			</View>

			{d.notes ? (
				<View style={{ marginTop: 12 }}>
					<Text style={S.eyebrow}>Catatan</Text>
					<Text style={S.body}>{d.notes}</Text>
				</View>
			) : null}

			<View style={[S.signRow, { justifyContent: "space-between" }]}>
				<PdfSignature signer={d.signer} label="Pihak Pertama," />
				<PdfSignatureBlank name={picName} label="Pihak Kedua," />
			</View>
			<PdfFooter />
		</Page>
	);
}

export function TetraDocument({ data }: { data: PdfDocData }) {
	const title = `${DOC_TITLE[data.docType]} ${data.docNumber} — ${data.client.name}`;
	return (
		<Document title={title} author={COMPANY.name} creator="Tetra Ops">
			{data.docType === "receipt" ? (
				<ReceiptPage d={data} />
			) : data.docType === "bast" ? (
				<BastPage d={data} />
			) : (
				<BillingPage d={data} />
			)}
		</Document>
	);
}
