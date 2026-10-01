/**
 * Satu komponen PDF untuk semua dokumen klien — gaya Swiss. Varian per
 * `docType`:
 *   quotation / invoice / nota_lunas → tabel harga + total + angka besar
 *   receipt                          → kwitansi satu pembayaran (terbilang)
 *   bast                             → paragraf serah terima + tabel + 2 ttd
 *
 * Susunan tiap halaman (atas → bawah): letterhead + judul raksasa · meta row ·
 * pihak & acara · isi · angka besar merah · blok bawah menempel di dasar ·
 * footer tetap.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PdfDocData } from "@/lib/documents/pdf-data";
import { COMPANY, DOC_TITLE, type DocType } from "@/lib/documents/types";
import { formatPhoneLocal } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";
import {
	BigFigure,
	Col,
	FS,
	formatDateDots,
	formatDateForPdf,
	formatDateLongForPdf,
	formatNumberForPdf,
	formatRupiahForPdf,
	GRID,
	type HeaderVariant,
	LabelBlock,
	MetaRow,
	Numbered,
	PDF_COLORS,
	PDF_STYLES,
	PdfBottom,
	PdfFooter,
	PdfHeader,
	PdfPageNumber,
	PdfSignature,
	PinnedBottom,
	Row,
} from "./document-base";

const S = PDF_STYLES;
const C = PDF_COLORS;
const n = formatNumberForPdf;

/** Judul raksasa per dokumen (bukan DOC_TITLE — itu untuk nama file & UI). */
const SWISS_TITLE: Record<DocType, string> = {
	invoice: "Invoice",
	quotation: "Quotation",
	nota_lunas: "Nota",
	receipt: "Kwitansi",
	bast: "BAST",
};

const THANKS: Record<DocType, string> = {
	invoice: "Terima kasih atas kepercayaannya.",
	quotation: "Terima kasih atas kesempatannya.",
	nota_lunas: "Terima kasih atas kepercayaannya.",
	receipt: "Terima kasih atas pembayarannya.",
	bast: "Terima kasih atas kepercayaannya.",
};

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

/** "Transfer BCA" / "Tunai" dari nama bank pembayaran. */
function methodLabel(bank: string | null) {
	if (!bank) return "—";
	return /cash|tunai|kas/i.test(bank) ? "Tunai" : `Transfer ${bank}`;
}

/* ───────────────────────── blok bersama ───────────────────────── */

/** Pihak (kiri) & Acara (kanan), dua kolom span 3. */
function PartyRow({ d, label }: { d: PdfDocData; label: string }) {
	const c = d.client;
	const venue = [d.event.venue, d.event.city].filter(Boolean).join(", ");
	const title =
		d.event.title && d.event.title !== c.name ? d.event.title : null;
	const hasEvent = Boolean(title || d.event.date || venue);
	return (
		<Row style={[S.ruleThin, { marginTop: 13.5, paddingTop: 7.5 }]}>
			<Col span={3}>
				<LabelBlock
					label={label}
					lines={[
						c.name,
						c.org && c.org !== c.name ? c.org : null,
						c.attn ? `u.p. ${c.attn}` : null,
						c.address,
						c.phone ? `WA ${formatPhoneLocal(c.phone)}` : null,
						c.email,
					]}
				/>
			</Col>
			<Col span={3}>
				{hasEvent ? (
					<LabelBlock
						label="Acara"
						lines={[
							title,
							d.event.date ? formatDateLongForPdf(d.event.date) : null,
							venue,
						]}
					/>
				) : null}
			</Col>
		</Row>
	);
}

/** Header tabel: garis bawah tipis, tebal. */
function TableHead({
	cells,
}: {
	cells: Array<{ t: string; span: 1 | 2 | 3; right?: boolean }>;
}) {
	return (
		<Row
			style={[
				S.bold,
				{
					paddingBottom: 6,
					borderBottomWidth: 0.75,
					borderBottomColor: C.ink,
				},
			]}
		>
			{cells.map((c) => (
				<Col key={c.t} span={c.span}>
					<Text style={c.right ? S.num : undefined}>{c.t}</Text>
				</Col>
			))}
		</Row>
	);
}

const rowLine = {
	paddingTop: 6,
	paddingBottom: 6.75,
	borderBottomWidth: 0.75,
	borderBottomColor: C.hairline,
};

/** Nama item + include (muted) dengan nomor urut. */
function ItemDesc({
	i,
	name,
	desc,
}: {
	i: number;
	name: string;
	desc: string | null;
}) {
	return (
		<Numbered n={i + 1}>
			<Text>{name}</Text>
			{desc ? <Text style={S.muted}>{desc}</Text> : null}
		</Numbered>
	);
}

function PriceTable({ d }: { d: PdfDocData }) {
	return (
		<View style={{ marginTop: 21 }}>
			<TableHead
				cells={[
					{ t: "Deskripsi", span: 3 },
					{ t: "Harga (Rp)", span: 1 },
					{ t: "Qty", span: 1 },
					{ t: "Jumlah (Rp)", span: 1, right: true },
				]}
			/>
			{d.items.map((it, i) => {
				const noPrice = it.needs_admin_price && !(it.unit_price > 0);
				const desc = it.includes.filter((x) => x.trim()).join(" · ");
				return (
					<Row
						// biome-ignore lint/suspicious/noArrayIndexKey: urutan item stabil saat render
						key={i}
						style={rowLine}
						wrap={false}
					>
						<Col span={3}>
							<ItemDesc i={i} name={it.name} desc={desc || null} />
						</Col>
						<Col span={1}>
							{/* Draft: harga belum diisi admin — dokumen tak bisa dikirim. */}
							<Text style={noPrice ? { color: C.warn } : undefined}>
								{noPrice ? "Diisi admin" : n(it.unit_price)}
							</Text>
						</Col>
						<Col span={1}>
							<Text>{it.qty}</Text>
						</Col>
						<Col span={1}>
							<Text style={[S.num, noPrice ? { color: C.warn } : {}]}>
								{noPrice ? "—" : n(it.qty * it.unit_price)}
							</Text>
						</Col>
					</Row>
				);
			})}
		</View>
	);
}

type TotalLine = {
	k: string;
	v: string;
	bold?: boolean;
	/** Hairline di atas baris — memisahkan kelompok pembayaran dari Total. */
	rule?: boolean;
};

/** Totals: label mulai kolom 4 (span 2), nilai kolom 6 rata kanan. */
function Totals({ lines }: { lines: TotalLine[] }) {
	return (
		<View style={{ paddingTop: 6 }} wrap={false}>
			{lines.map((l, i) => (
				// Ritme baris ≈ lineHeight 1.85 handoff (padding, bukan lineHeight:
				// react-pdf melipatgandakan tinggi baris multi-View).
				<Row
					// Indeks: dua pembayaran sejenis di tanggal sama = label kembar.
					// biome-ignore lint/suspicious/noArrayIndexKey: urutan baris stabil
					key={i}
					style={[
						{ paddingVertical: 1.7 },
						l.bold ? S.bold : {},
						// Garis hanya selebar kolom 4–6 (area total), bukan selebar halaman.
						l.rule
							? {
									marginLeft: GRID.span[3] + GRID.gap,
									marginTop: 4,
									paddingTop: 5.7,
									borderTopWidth: 0.75,
									borderTopColor: C.hairline,
								}
							: {},
					]}
				>
					<Col span={2} start={l.rule ? undefined : 4}>
						<Text>{l.k}</Text>
					</Col>
					<Col span={1}>
						<Text style={S.num}>{l.v}</Text>
					</Col>
				</Row>
			))}
		</View>
	);
}

function billingTotals(d: PdfDocData): TotalLine[] {
	const t = d.totals;
	const lines: TotalLine[] = [{ k: "Subtotal", v: n(t.subtotal) }];
	if (t.grossUp > 0)
		lines.push({
			k: `Gross-up PPh ${formatRate(d.grossUpRate)}%`,
			v: n(t.grossUp),
		});
	if (t.discount > 0) lines.push({ k: "Diskon", v: n(-t.discount) });
	lines.push({ k: "Total", v: n(t.total), bold: true });
	// Riwayat pembayaran (urut tanggal): satu baris per pembayaran, pola yang
	// sama dengan nota lunas. Invoice menutupnya dengan jumlah "Sudah dibayar".
	// Kelompok ini diawali hairline supaya tidak terbaca sebagai biaya tambahan.
	const paidStart = lines.length;
	for (const p of d.payment?.history ?? [])
		lines.push({
			k: `${labelType(p.type)} · ${formatDateDots(p.date)}`,
			v: n(p.amount),
		});
	if (d.docType === "invoice" && d.payment)
		lines.push({ k: "Sudah dibayar", v: n(d.payment.totalPaid), bold: true });
	if (lines[paidStart]) lines[paidStart].rule = true;
	return lines;
}

/** Catatan dokumen (opsional) — baris label/isi sebelum angka besar. */
function NotesRow({ notes }: { notes: string | null }) {
	if (!notes?.trim()) return null;
	return (
		<Row style={{ marginTop: 13.5 }} wrap={false}>
			<Col span={2}>
				<Text style={S.bold}>Catatan</Text>
			</Col>
			<Col span={4}>
				<Text>{notes.trim()}</Text>
			</Col>
		</Row>
	);
}

/**
 * Kerangka halaman. `bottom` (blok bawah yang menempel di dasar) sengaja anak
 * langsung <Page>, di luar pembungkus lineHeight — spacer flexGrow-nya hanya
 * bekerja terhadap tinggi halaman, bukan View pembungkus.
 */
function Shell({
	d,
	variant,
	children,
	bottom,
}: {
	d: PdfDocData;
	variant: HeaderVariant;
	children: React.ReactNode;
	bottom: React.ReactNode;
}) {
	return (
		<Page size="A4" style={S.page}>
			<View style={S.content}>
				<PdfHeader title={SWISS_TITLE[d.docType]} variant={variant} />
				{children}
			</View>
			{bottom}
			<PdfFooter thanks={THANKS[d.docType]} />
			<PdfPageNumber docNumber={d.docNumber} />
		</Page>
	);
}

/* ───────────────────────── halaman ───────────────────────── */

function BillingPage({
	d,
	variant,
}: {
	d: PdfDocData;
	variant: HeaderVariant;
}) {
	const paid = isPaid(d);
	const payment = d.payment;
	const status = !payment
		? "Belum dibayar"
		: paid
			? "Lunas"
			: payment.totalPaid > 0
				? "DP diterima"
				: "Belum dibayar";

	const meta: Array<{ k: string; v: string; span: 1 | 2 | 3 | 4 }> =
		d.docType === "quotation"
			? [
					{ k: "No.", v: d.docNumber, span: 2 },
					{ k: "Terbit", v: formatDateDots(d.issuedAt), span: 1 },
					{ k: "Berlaku s.d.", v: formatDateDots(d.validUntil), span: 1 },
					{ k: "Status", v: "Penawaran", span: 2 },
				]
			: d.docType === "nota_lunas"
				? [
						{ k: "No.", v: d.docNumber, span: 2 },
						{ k: "Tanggal", v: formatDateDots(d.issuedAt), span: 1 },
						{ k: "Referensi", v: d.refNumber ?? "—", span: 3 },
					]
				: [
						{ k: "No.", v: d.docNumber, span: 2 },
						{ k: "Terbit", v: formatDateDots(d.issuedAt), span: 1 },
						{ k: "Jatuh tempo", v: formatDateDots(d.dueDate), span: 1 },
						{ k: "Status", v: status, span: 2 },
					];

	const big =
		d.docType === "quotation"
			? {
					label: "Estimasi total (Rp)",
					sub: d.validUntil
						? `Berlaku hingga ${formatDateForPdf(d.validUntil)}`
						: null,
					value: n(d.totals.total),
				}
			: d.docType === "nota_lunas" || paid
				? {
						label: "Status pembayaran",
						sub: `Diterima ${formatRupiahForPdf(payment?.totalPaid ?? d.totals.total)}`,
						value: "Lunas",
					}
				: {
						label: "Sisa tagihan (Rp)",
						sub: d.dueDate
							? `Jatuh tempo ${formatDateForPdf(d.dueDate)}`
							: null,
						value: n(payment?.remaining ?? d.totals.total),
					};

	// Rekening selalu tampil (owner, 30 Sep 2026) — juga saat lunas & di
	// quotation, sama dengan preview Claude Design.

	return (
		<Shell
			d={d}
			variant={variant}
			bottom={
				<PdfBottom bank={d.bank} terms={termLines(d)} signer={d.signer} />
			}
		>
			<MetaRow cells={meta} />
			<PartyRow d={d} label={d.docType === "quotation" ? "Untuk" : "Kepada"} />
			<PriceTable d={d} />
			<Totals lines={billingTotals(d)} />
			<NotesRow notes={d.notes} />
			<BigFigure label={big.label} sub={big.sub} value={big.value} />
		</Shell>
	);
}

function ReceiptPage({
	d,
	variant,
}: {
	d: PdfDocData;
	variant: HeaderVariant;
}) {
	const r = d.receipt;
	if (!r) return null;
	const lunas = r.remainingAfter <= 0;
	const purpose = [
		`${r.paymentType}${d.refNumber ? ` Invoice ${d.refNumber}` : ""}`,
		d.event.title && d.event.title !== d.client.name ? d.event.title : null,
	]
		.filter(Boolean)
		.join(" · ");
	const rows: Array<{ k: string; v: string; fs: number }> = [
		{ k: "Telah terima dari", v: d.client.name, fs: FS.para },
		{ k: "Uang sejumlah", v: terbilangRupiah(r.amount), fs: 13.5 },
		{ k: "Untuk pembayaran", v: purpose, fs: FS.para },
		{
			k: "Sisa tagihan",
			v: lunas
				? "Lunas"
				: `${formatRupiahForPdf(r.remainingAfter)}${d.dueDate ? `, jatuh tempo ${formatDateForPdf(d.dueDate)}` : ""}`,
			fs: FS.para,
		},
	];
	return (
		<Shell
			d={d}
			variant={variant}
			bottom={
				<PdfBottom bank={d.bank} terms={termLines(d)} signer={d.signer} />
			}
		>
			<MetaRow
				cells={[
					{ k: "No.", v: d.docNumber, span: 2 },
					{ k: "Tanggal", v: formatDateDots(r.date), span: 1 },
					{ k: "Metode", v: methodLabel(r.bank), span: 1 },
					{ k: "Referensi", v: d.refNumber ?? "—", span: 2 },
				]}
			/>
			<PartyRow d={d} label="Diterima dari" />
			<View style={{ marginTop: 21 }}>
				{rows.map((row) => (
					<Row
						key={row.k}
						style={{
							paddingTop: 9,
							paddingBottom: 10.5,
							borderBottomWidth: 0.75,
							borderBottomColor: C.hairline,
						}}
						wrap={false}
					>
						<Col span={2}>
							<Text style={S.bold}>{row.k}</Text>
						</Col>
						<Col span={4}>
							<Text style={{ fontSize: row.fs, lineHeight: 1.3 }}>{row.v}</Text>
						</Col>
					</Row>
				))}
			</View>
			<NotesRow notes={d.notes} />
			<BigFigure
				label="Jumlah diterima (Rp)"
				sub={`Pembayaran ${r.paymentType}`}
				value={n(r.amount)}
			/>
		</Shell>
	);
}

function BastPage({ d, variant }: { d: PdfDocData; variant: HeaderVariant }) {
	const b = d.bast;
	const picName = b?.picName ?? d.client.name;
	// Jam sesi saja ("16.30–19.30"), tanpa "Setup …" — gaya referensi.
	const session = (d.event.time ?? "")
		.split(" · ")
		.filter((p) => !p.startsWith("Setup"))
		.join(" · ")
		.replaceAll(":", ".");
	// Baris layanan = item dokumen (nama + include, sama dengan invoice);
	// deliverables event hanya cadangan bila dokumen tanpa item.
	const rows: Array<{
		name: string;
		desc: string | null;
		qty: string;
		note: string;
	}> =
		d.items.length > 0
			? d.items.map((it, i) => ({
					name: it.name,
					desc: it.includes.filter((x) => x.trim()).join(" · ") || null,
					qty: i === 0 && it.qty > 1 ? `${it.qty} unit` : String(it.qty),
					note:
						i === 0
							? `Terlaksana${session ? `, ${session}` : ""}`
							: "Diserahkan",
				}))
			: (b?.deliverables ?? []).map((x) => ({
					name: x.label,
					desc: null,
					qty: String(x.quantity),
					note: x.notes ?? "",
				}));
	return (
		<Shell
			d={d}
			variant={variant}
			bottom={
				<>
					{/* Dua tanda tangan: Pihak Kedua kiri (kosong), Pihak Pertama kanan. */}
					<PinnedBottom>
						<Row style={[S.ruleThin, S.small, { paddingTop: 9 }]}>
							<Col span={2}>
								<Text style={S.blockTitle}>Pihak Kedua, penerima</Text>
								<View style={{ height: 46.5 }} />
								<View style={[S.ruleThin, { paddingTop: 4.5 }]}>
									<Text style={S.blockTitle}>{picName}</Text>
								</View>
								<Text>{d.client.name}</Text>
							</Col>
							<Col span={2} />
							<Col span={2}>
								<PdfSignature
									signer={d.signer}
									label="Pihak Pertama, penyedia"
									rule
								/>
							</Col>
						</Row>
					</PinnedBottom>
				</>
			}
		>
			<MetaRow
				cells={[
					{ k: "No.", v: d.docNumber, span: 2 },
					{ k: "Tanggal", v: formatDateDots(d.issuedAt), span: 1 },
					{ k: "Referensi", v: d.refNumber ?? "—", span: 3 },
				]}
			/>
			<PartyRow d={d} label="Pihak Kedua" />
			<Row style={{ marginTop: 21, marginBottom: 21 }}>
				<Col span={5}>
					<Text style={{ fontSize: FS.para, lineHeight: 1.45 }}>
						{/* Kalimat persis referensi Swiss; detail acara ada di blok Acara. */}
						Pada hari ini, {formatDateLongForPdf(d.issuedAt)}, {COMPANY.name}{" "}
						(Pihak Pertama) telah menyerahkan layanan berikut kepada{" "}
						{d.client.name} (Pihak Kedua), dan layanan telah diterima dalam
						keadaan baik dan sesuai kesepakatan.
					</Text>
				</Col>
			</Row>
			<TableHead
				cells={[
					{ t: "Layanan", span: 3 },
					{ t: "Qty", span: 1 },
					{ t: "Keterangan", span: 2 },
				]}
			/>
			{rows.map((row, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: daftar statis
				<Row key={i} style={rowLine} wrap={false}>
					<Col span={3}>
						<ItemDesc i={i} name={row.name} desc={row.desc} />
					</Col>
					<Col span={1}>
						<Text>{row.qty}</Text>
					</Col>
					<Col span={2}>
						<Text>{row.note}</Text>
					</Col>
				</Row>
			))}
			<NotesRow notes={d.notes} />
			<BigFigure
				label="Berita Acara Serah Terima"
				sub="Layanan telah diterima baik"
				value="Selesai"
			/>
		</Shell>
	);
}

export function TetraDocument({
	data,
	variant = "a",
}: {
	data: PdfDocData;
	/** Varian header: a putih (default) · b hitam · c merah. */
	variant?: HeaderVariant;
}) {
	const title = `${DOC_TITLE[data.docType]} ${data.docNumber} — ${data.client.name}`;
	return (
		<Document title={title} author={COMPANY.name} creator="Tetra Ops">
			{data.docType === "receipt" ? (
				<ReceiptPage d={data} variant={variant} />
			) : data.docType === "bast" ? (
				<BastPage d={data} variant={variant} />
			) : (
				<BillingPage d={data} variant={variant} />
			)}
		</Document>
	);
}
