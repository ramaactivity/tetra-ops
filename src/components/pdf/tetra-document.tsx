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
	PdfBullets,
	PdfFooter,
	PdfHeader,
	PdfSignature,
	PdfSignatureBlank,
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

/* ───────────────────────── blok bersama ───────────────────────── */

function ClientBlock({ d }: { d: PdfDocData }) {
	const c = d.client;
	return (
		<View style={S.metaCol}>
			<Text style={S.label}>Ditujukan kepada</Text>
			<Text style={[S.strong, { fontSize: 11 }]}>{c.name}</Text>
			{c.org ? <Text style={[S.body, { marginTop: 1 }]}>{c.org}</Text> : null}
			{c.address ? (
				<Text style={[S.muted, { marginTop: 1 }]}>{c.address}</Text>
			) : null}
			{c.phone ? (
				<Text style={[S.muted, { marginTop: 1 }]}>
					WA {formatPhoneLocal(c.phone)}
				</Text>
			) : null}
			{c.email ? <Text style={S.muted}>{c.email}</Text> : null}
		</View>
	);
}

function DetailBlock({ d }: { d: PdfDocData }) {
	const venue = [d.event.venue, d.event.city].filter(Boolean).join(", ");
	// Alamat sering diisi sama dengan nama venue — jangan dicetak dua kali.
	const address =
		d.event.address &&
		d.event.address.trim().toLowerCase() !==
			(d.event.venue ?? "").trim().toLowerCase()
			? d.event.address
			: null;
	const status =
		d.docType === "invoice" && d.payment
			? isPaid(d)
				? "Lunas"
				: d.payment.totalPaid > 0
					? "DP diterima"
					: "Belum dibayar"
			: null;
	return (
		<View style={S.metaCol}>
			<Text style={S.label}>Detail</Text>
			<Kv k="Tanggal terbit" v={formatDateForPdf(d.issuedAt)} />
			{d.docType === "quotation" ? (
				<Kv
					k="Berlaku sampai"
					v={d.validUntil ? formatDateForPdf(d.validUntil) : null}
				/>
			) : null}
			{d.docType === "invoice" ? (
				<Kv
					k="Jatuh tempo"
					v={d.dueDate ? formatDateForPdf(d.dueDate) : null}
				/>
			) : null}
			{status ? <Kv k="Status" v={status} /> : null}
			<Kv
				k="Acara"
				v={d.event.date ? formatDateLongForPdf(d.event.date) : null}
			/>
			<Kv k="Jam" v={d.event.time} />
			<Kv k="Lokasi" v={[venue, address].filter(Boolean).join("\n") || null} />
			<Kv k="Kode event" v={d.event.projectId} />
		</View>
	);
}

function ItemsTable({ d }: { d: PdfDocData }) {
	return (
		<View>
			<View style={S.th} fixed>
				<Text style={[S.thText, S.cName]}>Item</Text>
				<Text style={[S.thText, S.cQty]}>Qty</Text>
				<Text style={[S.thText, S.cPrice]}>Harga</Text>
				<Text style={[S.thText, S.cTotal, { fontWeight: 600 }]}>Jumlah</Text>
			</View>
			{d.items.map((it, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: urutan item stabil saat render
				<View key={i} style={S.tr} wrap={false}>
					<View style={S.cName}>
						<Text style={S.strong}>{it.name}</Text>
						{it.includes.filter(Boolean).map((inc, j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
							<Text key={j} style={S.include}>
								• {inc}
							</Text>
						))}
					</View>
					<Text style={[S.body, S.cQty]}>{it.qty}</Text>
					<Text style={[S.body, S.cPrice]}>{rp(it.unit_price)}</Text>
					<Text style={[S.body, S.cTotal]}>{rp(it.qty * it.unit_price)}</Text>
				</View>
			))}
		</View>
	);
}

function formatRate(r: number) {
	return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

function Totals({ d }: { d: PdfDocData }) {
	const t = d.totals;
	const paid = isPaid(d);
	return (
		<View style={S.totals} wrap={false}>
			{t.discount > 0 || t.grossUp > 0 ? (
				<View style={S.totalRow}>
					<Text style={S.totalK}>Subtotal</Text>
					<Text style={S.totalV}>{rp(t.subtotal)}</Text>
				</View>
			) : null}
			{t.discount > 0 ? (
				<View style={S.totalRow}>
					<Text style={S.totalK}>Diskon</Text>
					<Text style={S.totalV}>− {rp(t.discount)}</Text>
				</View>
			) : null}
			{t.grossUp > 0 ? (
				<View style={S.totalRow}>
					<Text style={S.totalK}>
						Gross-up PPh {formatRate(d.grossUpRate)}%
					</Text>
					<Text style={S.totalV}>{rp(t.grossUp)}</Text>
				</View>
			) : null}
			<View style={S.totalBand}>
				<Text style={S.totalBandK}>Total</Text>
				<Text style={S.totalBandV}>{rp(t.total)}</Text>
			</View>
			{d.payment ? (
				<>
					<View style={S.totalRow}>
						<Text style={S.totalK}>Sudah dibayar</Text>
						<Text style={S.totalV}>{rp(d.payment.totalPaid)}</Text>
					</View>
					<View
						style={[
							S.totalRow,
							{ borderTopWidth: 0.75, borderTopColor: PDF_COLORS.border },
						]}
					>
						<Text
							style={[S.totalK, { fontWeight: 600, color: PDF_COLORS.ink }]}
						>
							Sisa tagihan
						</Text>
						<Text
							style={[
								S.totalV,
								{ fontWeight: 700 },
								paid ? { color: PDF_COLORS.limeText } : {},
							]}
						>
							{paid ? "Rp 0 — LUNAS" : rp(d.payment.remaining)}
						</Text>
					</View>
				</>
			) : null}
		</View>
	);
}

function BankBox({ d }: { d: PdfDocData }) {
	if (!d.bank) return null;
	return (
		<View style={S.boxBand} wrap={false}>
			<Text style={S.label}>Pembayaran ke</Text>
			<Text style={[S.strong, { fontSize: 11 }]}>
				{d.bank.bankName}
				{d.bank.accountNumber ? `  ${d.bank.accountNumber}` : ""}
			</Text>
			<Text style={S.body}>a.n. {d.bank.accountHolder}</Text>
			<Text style={[S.muted, { marginTop: 4 }]}>
				Kirim bukti transfer ke WA {COMPANY.whatsapp}.
			</Text>
		</View>
	);
}

function PaymentHistory({ d }: { d: PdfDocData }) {
	const history = d.payment?.history ?? [];
	if (history.length === 0) return null;
	return (
		<View style={S.box} wrap={false}>
			<Text style={S.label}>Pembayaran diterima</Text>
			{history.map((p, i) => (
				<View
					key={p.ref}
					style={[
						S.miniRow,
						i === history.length - 1 ? { borderBottomWidth: 0 } : {},
					]}
				>
					<View>
						<Text style={[S.body, { fontWeight: 500 }]}>
							{labelType(p.type)}
						</Text>
						<Text style={S.muted}>
							{formatDateForPdf(p.date)}
							{p.bank ? ` · ${p.bank}` : ""}
						</Text>
					</View>
					<Text style={[S.body, { fontWeight: 600 }]}>{rp(p.amount)}</Text>
				</View>
			))}
		</View>
	);
}

/** Catatan + S&K di kiri, tanda tangan di kanan. */
function TermsAndSignature({ d, label }: { d: PdfDocData; label?: string }) {
	const lines = (d.terms ?? "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	return (
		<View style={{ flexDirection: "row", gap: 28, marginTop: 18 }} wrap={false}>
			<View style={{ flex: 1 }}>
				{d.notes ? (
					<View style={{ marginBottom: 10 }}>
						<Text style={S.label}>Catatan</Text>
						<Text style={S.body}>{d.notes}</Text>
					</View>
				) : null}
				{lines.length ? (
					<View>
						<Text style={S.label}>Syarat & ketentuan</Text>
						<PdfBullets lines={lines} />
					</View>
				) : null}
			</View>
			<PdfSignature signer={d.signer} label={label} />
		</View>
	);
}

/* ───────────────────────── halaman ───────────────────────── */

function BillingPage({ d }: { d: PdfDocData }) {
	const paid = isPaid(d);
	const showBank = d.docType === "invoice" && !paid;
	const showHistory = (d.payment?.history.length ?? 0) > 0;
	return (
		<Page size="A4" style={S.page}>
			<PdfHeader
				title={DOC_TITLE[d.docType]}
				docNumber={d.docNumber}
				small={d.docType === "nota_lunas"}
				stamp={paid}
			/>
			<View style={S.metaRow}>
				<ClientBlock d={d} />
				<DetailBlock d={d} />
			</View>
			{d.docType === "nota_lunas" ? (
				<Text style={[S.body, { marginBottom: 12 }]}>
					Dengan ini kami menyatakan tagihan untuk layanan di bawah ini telah
					dibayar <Text style={{ fontWeight: 700 }}>lunas</Text> oleh{" "}
					{d.client.name}. Terima kasih atas kepercayaannya.
				</Text>
			) : null}
			<ItemsTable d={d} />
			{/* Kiri: rekening + pembayaran diterima (ruang yang biasanya kosong); kanan: total. */}
			<View
				style={{
					flexDirection: "row",
					gap: 16,
					marginTop: 8,
					alignItems: "flex-start",
				}}
			>
				<View style={{ flex: 1, gap: 8, paddingTop: 6 }}>
					{showBank ? <BankBox d={d} /> : null}
					{showHistory ? <PaymentHistory d={d} /> : null}
				</View>
				<Totals d={d} />
			</View>
			<TermsAndSignature d={d} />
			<PdfFooter />
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
				stamp={lunas}
			/>
			<View style={{ gap: 12, marginTop: 2 }}>
				<Kv
					k="Telah terima dari"
					v={
						d.client.org ? `${d.client.name} — ${d.client.org}` : d.client.name
					}
				/>
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
						k="Untuk"
						v={`${r.paymentType}${itemsLine ? ` — ${itemsLine}` : ""}`}
					/>
					{eventLine ? <Kv k="Acara" v={eventLine} /> : null}
					<Kv k="Tanggal bayar" v={formatDateForPdf(r.date)} />
					{r.bank ? <Kv k="Diterima via" v={r.bank} /> : null}
				</View>
			</View>

			<View
				style={[S.totals, { marginTop: 26, alignSelf: "flex-end" }]}
				wrap={false}
			>
				<View style={S.totalRow}>
					<Text style={S.totalK}>Total tagihan</Text>
					<Text style={S.totalV}>{rp(r.billable)}</Text>
				</View>
				{r.paidBefore > 0 ? (
					<View style={S.totalRow}>
						<Text style={S.totalK}>Dibayar sebelumnya</Text>
						<Text style={S.totalV}>{rp(r.paidBefore)}</Text>
					</View>
				) : null}
				<View style={S.totalRow}>
					<Text style={S.totalK}>Pembayaran ini</Text>
					<Text style={S.totalV}>{rp(r.amount)}</Text>
				</View>
				<View style={S.totalBand}>
					<Text style={S.totalBandK}>Sisa tagihan</Text>
					<Text style={S.totalBandV}>
						{lunas ? "Rp 0 — LUNAS" : rp(r.remainingAfter)}
					</Text>
				</View>
			</View>

			<View
				style={{
					flexDirection: "row",
					justifyContent: "flex-end",
					marginTop: 26,
				}}
			>
				<PdfSignature signer={d.signer} label="Penerima," />
			</View>
			<PdfFooter />
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
			<PdfHeader title="BAST" docNumber={d.docNumber} />
			<Text style={[S.label, { marginBottom: 8 }]}>
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
				<Text style={[S.thText, { flex: 6 }]}>
					Layanan / hasil yang diserahkan
				</Text>
				<Text style={[S.thText, { width: 30, textAlign: "right" }]}>Qty</Text>
				<Text style={[S.thText, { flex: 3 }]}>Keterangan</Text>
			</View>
			{rows.map((row, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
				<View key={i} style={S.tr} wrap={false}>
					<Text style={[S.body, { flex: 6, fontWeight: 500 }]}>
						{row.label}
					</Text>
					<Text style={[S.body, { width: 30, textAlign: "right" }]}>
						{row.quantity}
					</Text>
					<Text style={[S.muted, { flex: 3 }]}>{row.notes ?? ""}</Text>
				</View>
			))}

			<View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
				<View style={[S.boxBand, { flex: 1 }]}>
					<Text style={S.label}>Pihak Pertama</Text>
					<Text style={S.strong}>{COMPANY.name}</Text>
					{b?.crewLead ? (
						<Text style={S.muted}>Crew lead: {b.crewLead}</Text>
					) : null}
				</View>
				<View style={[S.boxBand, { flex: 1 }]}>
					<Text style={S.label}>Pihak Kedua</Text>
					<Text style={S.strong}>{d.client.name}</Text>
					{d.client.org ? <Text style={S.muted}>{d.client.org}</Text> : null}
				</View>
			</View>

			{d.notes ? (
				<View style={{ marginTop: 14 }}>
					<Text style={S.label}>Catatan</Text>
					<Text style={S.body}>{d.notes}</Text>
				</View>
			) : null}

			<View
				style={{
					flexDirection: "row",
					justifyContent: "space-between",
					marginTop: 26,
				}}
			>
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
