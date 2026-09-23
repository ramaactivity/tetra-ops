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
	bottomReserve,
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
	PdfSignOff,
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

/** "Kepada" (kanan): klien + acara — tanpa jam & kode event. */
function ToBlock({ d }: { d: PdfDocData }) {
	const c = d.client;
	const venue = [d.event.venue, d.event.city].filter(Boolean).join(", ");
	return (
		<View style={S.colR}>
			<Text style={S.blockLabel}>Kepada</Text>
			<Text style={S.blockName}>{c.name}</Text>
			{c.org ? <Text style={S.blockLine}>{c.org}</Text> : null}
			{c.address ? <Text style={S.blockMuted}>{c.address}</Text> : null}
			{c.phone ? (
				<Text style={S.blockMuted}>WA {formatPhoneLocal(c.phone)}</Text>
			) : null}
			{c.email ? <Text style={S.blockMuted}>{c.email}</Text> : null}
			{d.event.date || venue ? (
				<View style={{ marginTop: 8 }}>
					<Text style={S.blockLabel}>Acara</Text>
					{d.event.date ? (
						<Text style={S.blockLine}>
							{formatDateLongForPdf(d.event.date)}
						</Text>
					) : null}
					{venue ? <Text style={S.blockMuted}>{venue}</Text> : null}
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

function TotalLine({
	k,
	v,
	strong,
	color,
}: {
	k: string;
	v: string;
	strong?: boolean;
	color?: string;
}) {
	return (
		<View style={S.totalRow}>
			<Text style={S.totalK}>{k}</Text>
			<Text style={S.totalSep}>:</Text>
			<Text
				style={[
					S.totalV,
					strong ? { fontWeight: 700 } : {},
					color ? { color } : {},
				]}
			>
				{v}
			</Text>
		</View>
	);
}

function Totals({ d }: { d: PdfDocData }) {
	const t = d.totals;
	const paid = isPaid(d);
	const hasAdjust = t.discount > 0 || t.grossUp > 0;
	const partial =
		d.docType === "invoice" && d.payment && d.payment.totalPaid > 0 && !paid;
	return (
		<View style={S.rightCol}>
			{hasAdjust ? <TotalLine k="Subtotal" v={rp(t.subtotal)} /> : null}
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
				<Text style={S.totalBandK}>{partial ? "Total tagihan" : "Total"}</Text>
				<Text style={S.totalBandV}>{rp(t.total)}</Text>
			</View>
			{d.payment ? (
				<>
					<TotalLine k="Sudah dibayar" v={rp(d.payment.totalPaid)} />
					<TotalLine
						k="Sisa tagihan"
						v={paid ? "LUNAS" : rp(d.payment.remaining)}
						strong
						color={paid ? PDF_COLORS.limeText : undefined}
					/>
				</>
			) : null}
		</View>
	);
}

/** Kolom kiri bawah tabel: catatan + pembayaran diterima. */
function LeftColumn({ d }: { d: PdfDocData }) {
	const history = d.payment?.history ?? [];
	return (
		<View style={S.leftCol}>
			{d.notes ? (
				<View style={{ marginBottom: 10 }}>
					<Text style={S.sideLabel}>Catatan</Text>
					<Text style={S.sideText}>{d.notes}</Text>
				</View>
			) : null}
			{history.length > 0 ? (
				<View>
					<Text style={S.sideLabel}>Pembayaran diterima</Text>
					{history.map((p, i) => (
						<View
							key={p.ref}
							style={[
								S.payRow,
								i === history.length - 1 ? { borderBottomWidth: 0 } : {},
							]}
						>
							<View>
								<Text style={S.payK}>{labelType(p.type)}</Text>
								<Text style={S.payMeta}>
									{formatDateForPdf(p.date)}
									{p.bank ? ` · ${p.bank}` : ""}
								</Text>
							</View>
							<Text style={S.payV}>{rp(p.amount)}</Text>
						</View>
					))}
				</View>
			) : null}
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
	const thanks =
		d.docType === "quotation"
			? "Terima kasih atas kesempatannya."
			: "Terima kasih atas kepercayaannya.";
	return (
		<Page
			size="A4"
			style={[S.page, { paddingBottom: bottomReserve(terms, true) }]}
		>
			<PdfHeader
				title={DOC_TITLE[d.docType]}
				docNumber={d.docNumber}
				date={d.issuedAt}
				meta={meta}
				small={d.docType === "nota_lunas"}
				stamp={paid}
			/>
			<View style={S.twoCol}>
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
			<View style={S.afterTable} wrap={false}>
				<LeftColumn d={d} />
				<Totals d={d} />
			</View>
			<PdfSignOff
				thanks={thanks}
				terms={terms}
				right={<PdfSignature signer={d.signer} />}
			/>
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
		<Page
			size="A4"
			style={[S.page, { paddingBottom: bottomReserve([], true) }]}
		>
			<PdfHeader
				title={DOC_TITLE.receipt}
				docNumber={d.docNumber}
				date={d.issuedAt}
				stamp={lunas}
			/>
			<View style={S.twoCol}>
				<PdfCompanyBlock />
				<View style={S.colR}>
					<Text style={S.blockLabel}>Telah terima dari</Text>
					<Text style={S.blockName}>{d.client.name}</Text>
					{d.client.org ? (
						<Text style={S.blockLine}>{d.client.org}</Text>
					) : null}
					{d.client.phone ? (
						<Text style={S.blockMuted}>
							WA {formatPhoneLocal(d.client.phone)}
						</Text>
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

			<View style={S.afterTable} wrap={false}>
				<View style={S.leftCol} />
				<View style={S.rightCol}>
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
			</View>

			<PdfSignOff
				thanks="Terima kasih atas pembayarannya."
				right={<PdfSignature signer={d.signer} label="Penerima," />}
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
		<Page
			size="A4"
			style={[S.page, { paddingBottom: bottomReserve([], false) }]}
		>
			<PdfHeader title="BAST" docNumber={d.docNumber} date={d.issuedAt} />
			<Text style={[S.blockLabel, { marginBottom: 6 }]}>
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
					<Text style={[S.blockMuted, { width: 150 }]}>{row.notes ?? ""}</Text>
				</View>
			))}

			{d.notes ? (
				<View style={{ marginTop: 14 }}>
					<Text style={S.sideLabel}>Catatan</Text>
					<Text style={S.sideText}>{d.notes}</Text>
				</View>
			) : null}

			{/* Dua tanda tangan di pojok bawah: Pihak Pertama kiri, Pihak Kedua kanan */}
			<View style={S.signOff}>
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
