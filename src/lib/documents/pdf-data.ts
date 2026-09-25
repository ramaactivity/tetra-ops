/**
 * View-model PDF: satu bentuk data untuk semua jenis dokumen. Dibangun dari
 * baris `documents` + konteks (event, pembayaran, penanda tangan, rekening).
 * Murni (tanpa I/O) supaya bisa dipakai route unduh DAN preview draft.
 */

import type { EventForPdf } from "@/lib/pdf/event-data";
import { buildDeliverables } from "@/lib/pdf/event-data";
import {
	formatScheduleInline,
	hasBreak,
	parseSegments,
} from "@/lib/schedule/segments";
import { computeTotals, type DocTotals } from "./totals";
import type {
	DocClient,
	DocItem,
	DocType,
	DocumentRow,
	DocumentSigner,
} from "./types";
import { defaultTerms } from "./types";

export type PdfPaymentLine = {
	date: string;
	type: string;
	amount: number;
	ref: string;
	bank: string | null;
};

export type PdfDocData = {
	docType: DocType;
	docNumber: string;
	issuedAt: string;
	dueDate: string | null;
	validUntil: string | null;
	client: DocClient;
	event: {
		projectId: string | null;
		title: string | null;
		date: string | null;
		time: string | null;
		venue: string | null;
		address: string | null;
		city: string | null;
	};
	items: DocItem[];
	totals: DocTotals;
	grossUpRate: number;
	/** Invoice & Nota Lunas: angka bayar live dari event. */
	payment: {
		totalPaid: number;
		remaining: number;
		history: PdfPaymentLine[];
	} | null;
	/** Kuitansi: satu pembayaran. */
	receipt: {
		amount: number;
		paymentType: string;
		date: string;
		bank: string | null;
		paidBefore: number;
		remainingAfter: number;
		billable: number;
	} | null;
	/** BAST */
	bast: {
		deliverables: Array<{ label: string; quantity: number; notes?: string }>;
		crewLead: string | null;
		picName: string | null;
	} | null;
	bank: {
		bankName: string;
		accountHolder: string;
		accountNumber: string | null;
	} | null;
	notes: string | null;
	terms: string | null;
	signer: { name: string; position: string; signatureData: string | null };
};

export type PdfBuildContext = {
	event: EventForPdf | null;
	payments: PdfPaymentLine[];
	receiptPayment: {
		amount: number;
		payment_type: string;
		payment_date: string;
		bank: string | null;
		/** total terbayar SETELAH pembayaran ini (termasuk) */
		paidThrough: number;
	} | null;
	signer: Pick<DocumentSigner, "name" | "position" | "signature_data"> | null;
	bank: {
		bank_name: string;
		account_holder: string | null;
		account_name: string;
		account_number: string | null;
	} | null;
};

export const PAYMENT_TYPE_LABEL_PDF: Record<string, string> = {
	dp: "DP",
	partial: "Cicilan",
	pelunasan: "Pelunasan",
};

/** Jam acara dari event: "Setup 08:00 · 10:00–14:00" (multi-sesi ikut). */
export function eventTimeLabel(ev: EventForPdf): string | null {
	const segments = parseSegments(ev.session_segments);
	const t = (s: string | null) => (s ? s.slice(0, 5) : null);
	const session = hasBreak(segments)
		? formatScheduleInline(ev.start_time, ev.end_time, segments)
		: t(ev.start_time) && t(ev.end_time)
			? `${t(ev.start_time)}–${t(ev.end_time)}`
			: (t(ev.start_time) ?? null);
	const parts = [
		t(ev.setup_time) ? `Setup ${t(ev.setup_time)}` : null,
		session,
	].filter(Boolean);
	return parts.length ? parts.join(" · ") : null;
}

export function buildPdfData(
	doc: Omit<DocumentRow, "id" | "created_at" | "updated_at">,
	ctx: PdfBuildContext,
): PdfDocData {
	const ev = ctx.event;
	const totals = computeTotals(doc.items, doc.discount, {
		enabled: doc.gross_up_enabled,
		ratePct: doc.gross_up_rate,
	});

	const eventBlock = ev
		? {
				projectId: ev.project_id,
				title: ev.event_title,
				date: ev.event_date,
				time: eventTimeLabel(ev),
				venue: ev.venue_name || null,
				address: ev.venue_address,
				city: ev.venue_city,
			}
		: {
				projectId: null,
				title: doc.event_info.title ?? null,
				date: doc.event_info.date ?? null,
				time: doc.event_info.time ?? null,
				venue: doc.event_info.venue ?? null,
				address: null,
				city: doc.event_info.city ?? null,
			};

	const totalPaid = ev?.total_paid ?? 0;
	const payment =
		ev && (doc.doc_type === "invoice" || doc.doc_type === "nota_lunas")
			? {
					totalPaid,
					// Sisa dihitung terhadap total dokumen supaya PDF konsisten
					// dengan dirinya sendiri; editor memperingatkan bila total
					// dokumen ≠ tagihan event.
					remaining: Math.max(0, totals.total - totalPaid),
					history: ctx.payments,
				}
			: null;

	const rp = ctx.receiptPayment;
	const receipt =
		doc.doc_type === "receipt" && rp
			? {
					amount: rp.amount,
					paymentType:
						PAYMENT_TYPE_LABEL_PDF[rp.payment_type] ?? rp.payment_type,
					date: rp.payment_date,
					bank: rp.bank,
					paidBefore: Math.max(0, rp.paidThrough - rp.amount),
					billable: ev?.billable_total ?? totals.total,
					remainingAfter: Math.max(
						0,
						(ev?.billable_total ?? totals.total) - rp.paidThrough,
					),
				}
			: null;

	const bast =
		doc.doc_type === "bast" && ev
			? {
					deliverables: buildDeliverables(ev),
					crewLead: ev.crew_lead?.full_name ?? null,
					picName: ev.pic_contact?.name ?? ev.pic_name ?? doc.client.name,
				}
			: null;

	return {
		docType: doc.doc_type,
		docNumber: doc.doc_number,
		issuedAt: doc.issued_at,
		dueDate: doc.due_date,
		validUntil: doc.valid_until,
		client: doc.client,
		event: eventBlock,
		items: doc.items,
		totals,
		grossUpRate: doc.gross_up_rate,
		payment,
		receipt,
		bast,
		bank: ctx.bank
			? {
					bankName: ctx.bank.bank_name,
					accountHolder: ctx.bank.account_holder ?? ctx.bank.account_name,
					accountNumber: ctx.bank.account_number,
				}
			: null,
		notes: doc.notes,
		terms: doc.terms ?? defaultTerms(doc.doc_type, doc.gross_up_enabled),
		signer: {
			name: doc.signer_name ?? ctx.signer?.name ?? "Tetra Photobooth",
			position: doc.signer_position ?? ctx.signer?.position ?? "Owner",
			signatureData: ctx.signer?.signature_data ?? null,
		},
	};
}
