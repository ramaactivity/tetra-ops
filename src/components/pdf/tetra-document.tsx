/**
 * Satu komponen PDF untuk semua dokumen klien. Varian per `docType`:
 *   quotation / invoice / nota_lunas → tabel item + total (+ pembayaran)
 *   receipt                          → kuitansi satu pembayaran (terbilang)
 *   bast                             → berita acara + serah terima + 2 ttd
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PdfDocData } from "@/lib/documents/pdf-data";
import { COMPANY, DOC_TITLE } from "@/lib/documents/types";
import { formatPhoneLocal } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";
import {
	formatDateForPdf,
	formatDateLongForPdf,
	formatRupiahForPdf,
	Kv,
	PDF_COLORS,
	PDF_STYLES,
	PdfCompanyBlock,
	PdfFooter,
	PdfHeader,
	PdfPageNo,
	PdfSignature,
	PdfSignatureBlank,
	PdfTerms,
} from "./document-base";

const S = PDF_STYLES;
const rp = formatRupiahForPdf;

function labelType(t: string) {
	return t === "dp"
		? "DP"
		: t === "partial"
			? "Cicilan"
			: t === "pelunasan"
				? "Pelunasan"
				: t;
}

function isPaid(d: PdfDocData) {
	return Boolean(
		d.payment && d.payment.totalPaid > 0 && d.payment.remaining <= 0,
	);
}

function termLines(d: PdfDocData) {
	return (d.terms ?? "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
}

function formatRate(r: number) {
	return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

/* ───────────────────────── blok bersama ───────────────────────── */

/** Blok "Kepada" di kanan: klien + acara (tanpa jam & kode event). */
function ToBlock({ d }: { d: PdfDocData }) {
	const c = d.client;
	const venue = [d.event.venue, d.event.city].filter(Boolean).join(", ");
	return (
		<View style={S.toCol}>
			<Text style={S.toLabel}>Kepada :</Text>
			<Text style={S.toName}>{c.name}</Text>
			{c.org ? <Text style={S.toLine}>{c.org}</Text> : null}
			{c.address ? <Text style={S.toMuted}>{c.address}</Text> : null}
			{c.phone ? (
				<Text style={S.toMuted}>WA {formatPhoneLocal(c.phone)}</Text>
			) : null}
			{c.email ? <Text style={S.toMuted}>{c.email}</Text> : null}
			{d.event.date || venue ? (
				<View style={{ marginTop: 8 }}>
					<Text style={S.toLabel}>Acara :</Text>
					{d.event.date ? (
						<Text style={S.toLine}>{formatDateLongForPdf(d.event.date)}</Text>
					) : null}
					{venue ? <Text style={S.toMuted}>{venue}</Text> : null}
				</View>
			) : null}
		</View>
	);
}

function ItemsTable({ d }: { d: PdfDocData }) {
	return (
		<View>
			<View style={S.th} fixed>
				<Text style={[S.thText, S.cName]}>Deskripsi item</Text>
				<Text style={[S.thText, S.cPrice, { fontWeight: 700 }]}>
					Harga satuan
				</Text>
				<Text style={[S.thText, S.cQty]}>Qty</Text>
				<Text style={[S.thText, S.cTotal, { fontWeight: 700 }]}>Jumlah</Text>
			</View>
			{d.items.map((it, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: urutan item stabil saat render
				<View key={i} style={S.tr} wrap={false}>
					<View style={S.cName}>
						<Text style={S.itemName}>{it.name}</Text>
						{it.includes.filter(Boolean).map((inc, j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
							<Text key={j} style={S.include}>
								{inc}
							</Text>
						))}
					</View>
					<Text style={[S.body, S.cPrice]}>{rp(it.unit_price)}</Text>
					<Text style={[S.body, S.cQty]}>{it.qty}</Text>
					<Text style={[S.body, S.cTotal]}>{rp(it.qty * it.unit_price)}</Text>
				</View>
			))}
		</View>
	);
}

function TotalLine({ k, v }: { k: string; v: string }) {
	return (
		<View style={S.totalRow}>
			<Text style={S.totalK}>{k}</Text>
			<Text style={S.totalSep}>:</Text>
			<Text style={S.totalV}>{v}</Text>
		</View>
	);
}

function Totals({ d }: { d: PdfDocData }) {
	const t = d.totals;
	const paid = isPaid(d);
	return (
		<View style={S.totals} wrap={false}>
			<TotalLine k="Subtotal" v={rp(t.subtotal)} />
			{t.grossUp > 0 ? (
				<TotalLine
					k={`Gross-up PPh ${formatRate(d.grossUpRate)}%`}
					v={rp(t.grossUp)}
				/>
			) : null}
			{t.discount > 0 ? (
				<TotalLine k="Diskon" v={`− ${rp(t.discount)}`} />
			) : null}
			<View style={S.totalBand}>
				<Text style={S.totalBandK}>
					{d.docType === "invoice" &&
					d.payment &&
					d.payment.totalPaid > 0 &&
					!paid
						? "Total tagihan"
						: "Total"}
				</Text>
				<Text style={S.totalBandV}>{rp(t.total)}</Text>
			</View>
			{d.payment ? (
				<View style={{ marginTop: 4 }}>
					<TotalLine k="Sudah dibayar" v={rp(d.payment.totalPaid)} />
					<View style={S.paidRow}>
						<Text style={S.totalK}>Sisa tagihan</Text>
						<Text style={S.totalSep}>:</Text>
						<Text
							style={[
								S.totalV,
								{ fontWeight: 700 },
								paid ? { color: PDF_COLORS.limeText } : {},
							]}
						>
							{paid ? "LUNAS" : rp(d.payment.remaining)}
						</Text>
					</View>
				</View>
			) : null}
		</View>
	);
}

/** Kolom kiri bawah tabel: catatan + pembayaran diterima. */
function NoteColumn({ d }: { d: PdfDocData }) {
	const history = d.payment?.history ?? [];
	return (
		<View style={S.noteCol}>
			{d.notes ? (
				<View style={{ marginBottom: 10 }}>
					<Text style={S.noteLabel}>Catatan :</Text>
					<Text style={S.noteText}>{d.notes}</Text>
				</View>
			) : null}
			{history.length > 0 ? (
				<View>
					<Text style={S.noteLabel}>Pembayaran diterima :</Text>
					{history.map((p) => (
						<View key={p.ref} style={S.miniRow}>
							<Text style={S.noteText}>
								{labelType(p.type)} · {formatDateForPdf(p.date)}
								{p.bank ? ` · ${p.bank}` : ""}
							</Text>
							<Text
								style={[S.noteText, { fontWeight: 600, color: PDF_COLORS.ink }]}
							>
								{rp(p.amount)}
							</Text>
						</View>
					))}
				</View>
			) : null}
		</View>
	);
}

function ThanksAndSignature({
	d,
	thanks,
	label,
}: {
	d: PdfDocData;
	thanks: string;
	label?: string;
}) {
	return (
		<View style={S.thanksRow} wrap={false}>
			<Text style={S.thanks}>{thanks}</Text>
			<PdfSignature signer={d.signer} label={label} />
		</View>
	);
}

/* ───────────────────────── halaman ───────────────────────── */

function BillingPage({ d }: { d: PdfDocData }) {
	const paid = isPaid(d);
	const meta: string[] = [];
	if (d.docType === "quotation" && d.validUntil)
		meta.push(`Berlaku sampai ${formatDateForPdf(d.validUntil)}`);
	if (d.docType === "invoice" && d.dueDate && !paid)
		meta.push(`Jatuh tempo ${formatDateForPdf(d.dueDate)}`);
	const showBank = d.docType === "invoice" && !paid;
	const terms = termLines(d);
	return (
		<Page size="A4" style={S.page}>
			<PdfHeader
				title={DOC_TITLE[d.docType]}
				docNumber={d.docNumber}
				date={d.issuedAt}
				meta={meta}
				small={d.docType === "nota_lunas"}
				stamp={paid}
			/>
			<View style={S.toRow}>
				<PdfCompanyBlock />
				<ToBlock d={d} />
			</View>
			{d.docType === "nota_lunas" ? (
				<Text style={[S.body, { lineHeight: 1.5, marginBottom: 12 }]}>
					Dengan ini kami menyatakan tagihan untuk layanan di bawah ini telah
					dibayar <Text style={{ fontWeight: 700 }}>lunas</Text>. Terima kasih
					atas kepercayaannya.
				</Text>
			) : null}
			<ItemsTable d={d} />
			<View style={S.afterTable}>
				<NoteColumn d={d} />
				<Totals d={d} />
			</View>
			<ThanksAndSignature
				d={d}
				thanks={
					d.docType === "quotation"
						? "Terima kasih atas kesempatannya."
						: "Terima kasih atas kepercayaannya."
				}
			/>
			<PdfTerms terms={terms} />
			<PdfFooter bank={showBank ? d.bank : null} />
			<PdfPageNo />
		</Page>
	);
}

function ReceiptPage({ d }: { d: PdfDocData }) {
	const r = d.receipt;
	if (!r) return null;
	const lunas = r.remainingAfter <= 0;
	const eventLine = [
		d.event.date ? formatDateLongForPdf(d.event.date) : null,
		d.event.venue,
	]
		.filter(Boolean)
		.join(" · ");
	const itemsLine = d.items.map((i) => i.name).join(", ");
	return (
		<Page size="A4" style={S.page}>
			<PdfHeader
				title={DOC_TITLE.receipt}
				docNumber={d.docNumber}
				date={d.issuedAt}
				stamp={lunas}
			/>
			<View style={S.toRow}>
				<PdfCompanyBlock />
				<View style={S.toCol}>
					<Text style={S.toLabel}>Telah terima dari :</Text>
					<Text style={S.toName}>{d.client.name}</Text>
					{d.client.org ? <Text style={S.toLine}>{d.client.org}</Text> : null}
					{d.client.phone ? (
						<Text style={S.toMuted}>WA {formatPhoneLocal(d.client.phone)}</Text>
					) : null}
				</View>
			</View>
			<View style={{ gap: 12 }}>
				<View>
					<Text style={S.label}>Uang sejumlah</Text>
					<Text style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 700 }}>
						{rp(r.amount)}
					</Text>
					<View style={[S.boxBand, { marginTop: 8 }]}>
						<Text style={[S.body, { fontWeight: 500 }]}>
							{terbilangRupiah(r.amount)}
						</Text>
					</View>
				</View>
				<View>
					<Kv
						k="Untuk pembayaran"
						v={`${r.paymentType}${itemsLine ? ` — ${itemsLine}` : ""}`}
					/>
					{eventLine ? <Kv k="Acara" v={eventLine} /> : null}
					<Kv k="Tanggal bayar" v={formatDateForPdf(r.date)} />
					{r.bank ? <Kv k="Diterima via" v={r.bank} /> : null}
				</View>
			</View>

			<View
				style={[S.totals, { marginTop: 24, alignSelf: "flex-end" }]}
				wrap={false}
			>
				<TotalLine k="Total tagihan" v={rp(r.billable)} />
				{r.paidBefore > 0 ? (
					<TotalLine k="Dibayar sebelumnya" v={rp(r.paidBefore)} />
				) : null}
				<TotalLine k="Pembayaran ini" v={rp(r.amount)} />
				<View style={S.totalBand}>
					<Text style={S.totalBandK}>Sisa tagihan</Text>
					<Text style={S.totalBandV}>
						{lunas ? "LUNAS" : rp(r.remainingAfter)}
					</Text>
				</View>
			</View>

			<ThanksAndSignature
				d={d}
				thanks="Terima kasih atas pembayarannya."
				label="Penerima,"
			/>
			<PdfFooter />
			<PdfPageNo />
		</Page>
	);
}

function BastPage({ d }: { d: PdfDocData }) {
	const b = d.bast;
	const picName = b?.picName ?? d.client.name;
	const rows =
		b?.deliverables ??
		d.items.map((i) => ({
			label: i.name,
			quantity: i.qty,
			notes: i.includes[0],
		}));
	return (
		<Page size="A4" style={S.page}>
			<PdfHeader title="BAST" docNumber={d.docNumber} date={d.issuedAt} />
			<Text style={[S.toLabel, { marginBottom: 6 }]}>
				Berita Acara Serah Terima Layanan
			</Text>
			<Text style={[S.body, { lineHeight: 1.6, marginBottom: 16 }]}>
				Pada hari ini, {formatDateLongForPdf(d.issuedAt)}, {COMPANY.name} (Pihak
				Pertama) telah melaksanakan dan menyerahkan hasil layanan kepada{" "}
				<Text style={{ fontWeight: 700 }}>{d.client.name}</Text>
				{d.client.org ? ` (${d.client.org})` : ""} (Pihak Kedua) untuk acara
				pada {d.event.date ? formatDateLongForPdf(d.event.date) : "—"}
				{d.event.venue ? ` di ${d.event.venue}` : ""}
				{d.event.city ? `, ${d.event.city}` : ""}. Pihak Kedua menyatakan telah
				menerima layanan dalam kondisi baik dan sesuai kesepakatan.
			</Text>

			<View style={S.th}>
				<Text style={[S.thText, { flex: 1 }]}>
					Layanan / hasil yang diserahkan
				</Text>
				<Text style={[S.thText, S.cQty]}>Qty</Text>
				<Text style={[S.thText, { width: 150 }]}>Keterangan</Text>
			</View>
			{rows.map((row, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
				<View key={i} style={S.tr} wrap={false}>
					<Text style={[S.itemName, { flex: 1 }]}>{row.label}</Text>
					<Text style={[S.body, S.cQty]}>{row.quantity}</Text>
					<Text style={[S.muted, { width: 150 }]}>{row.notes ?? ""}</Text>
				</View>
			))}

			{d.notes ? (
				<View style={{ marginTop: 14 }}>
					<Text style={S.noteLabel}>Catatan :</Text>
					<Text style={S.noteText}>{d.notes}</Text>
				</View>
			) : null}

			<View
				style={{
					flexDirection: "row",
					justifyContent: "space-between",
					marginTop: 30,
				}}
			>
				<PdfSignature signer={d.signer} label="Pihak Pertama," />
				<PdfSignatureBlank name={picName} label="Pihak Kedua," />
			</View>
			<PdfFooter />
			<PdfPageNo />
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
