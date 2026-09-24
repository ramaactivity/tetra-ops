import "server-only";

import {
	buildLineItems,
	type EventForPdf,
	fetchEventForPdf,
} from "@/lib/pdf/event-data";
import { createClient } from "@/lib/supabase/server";
import {
	buildPdfData,
	type PdfBuildContext,
	type PdfDocData,
	type PdfPaymentLine,
} from "./pdf-data";
import type { DocItem, DocumentRow, DocumentSigner } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadDocument(
	id: string,
	client?: Supabase,
): Promise<DocumentRow | null> {
	const supabase = client ?? (await createClient());
	const { data } = await supabase
		.from("documents")
		.select("*")
		.eq("id", id)
		.maybeSingle();
	return (data as DocumentRow | null) ?? null;
}

export async function loadSigners(): Promise<DocumentSigner[]> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("document_signers")
		.select(
			"id, name, position, signature_data, is_default, sort_order, is_active",
		)
		.eq("is_active", true)
		.order("sort_order")
		.order("name");
	return (data ?? []) as DocumentSigner[];
}

export async function loadDefaultBank(supabase: Supabase) {
	const { data } = await supabase
		.from("bank_accounts")
		.select("bank_name, account_name, account_number, account_holder")
		.eq("is_active", true)
		.eq("is_default_receive", true)
		.maybeSingle();
	return data ?? null;
}

/** Pembayaran sah (tidak di-reverse) sebuah event, terlama dulu. */
export async function loadPaymentLines(
	supabase: Supabase,
	eventId: string,
): Promise<PdfPaymentLine[]> {
	const { data } = await supabase
		.from("payments")
		.select(
			"id, ref_id, amount, payment_date, payment_type, is_reversed, bank:bank_accounts(bank_name)",
		)
		.eq("event_id", eventId)
		.eq("is_reversed", false)
		.order("payment_date", { ascending: true })
		.order("created_at", { ascending: true });
	return (data ?? []).map((p) => {
		const bank = Array.isArray(p.bank) ? p.bank[0] : p.bank;
		return {
			date: p.payment_date as string,
			type: p.payment_type as string,
			amount: p.amount as number,
			ref: p.ref_id as string,
			bank: (bank as { bank_name: string } | null)?.bank_name ?? null,
		};
	});
}

/** Event by uuid → bentuk EventForPdf (fetchEventForPdf memakai project_id). */
export async function loadEventForPdfById(
	supabase: Supabase,
	eventId: string,
): Promise<EventForPdf | null> {
	const { data } = await supabase
		.from("events")
		.select("project_id")
		.eq("id", eventId)
		.maybeSingle();
	if (!data?.project_id) return null;
	return fetchEventForPdf(data.project_id as string, supabase);
}

/**
 * Diskon dokumen dari event. Potongan langsung vendor (upfront_cut) dipotong di
 * muka dari tagihan, jadi di dokumen ia tampil sebagai diskon — dengan begitu
 * total dokumen = tagihan yang benar-benar ditunggu Tetra (billable_total).
 */
export function discountFromEvent(ev: EventForPdf): number {
	const cut =
		ev.vendor_commission_mode === "upfront_cut"
			? ev.vendor_commission_amount
			: 0;
	return ev.discount_amount + Math.max(0, cut);
}

/** Baris item dokumen dari event (paket + add-on + backdrop), harga snapshot event. */
export function itemsFromEvent(ev: EventForPdf): DocItem[] {
	return buildLineItems(ev).map((li) => ({
		name: li.label,
		includes: li.detail ? [li.detail] : [],
		qty: li.quantity,
		unit_price: li.unitPrice,
	}));
}

/**
 * Konteks lengkap untuk render PDF. Dipakai route unduh (doc tersimpan) dan
 * preview (doc draft dari editor — sama bentuknya, hanya belum punya id).
 */
export async function buildPdfContext(
	doc: Pick<DocumentRow, "doc_type" | "event_id" | "payment_id" | "signer_id">,
	client?: Supabase,
): Promise<PdfBuildContext> {
	const supabase = client ?? (await createClient());
	const [event, bank, signerRow] = await Promise.all([
		doc.event_id ? loadEventForPdfById(supabase, doc.event_id) : null,
		loadDefaultBank(supabase),
		doc.signer_id
			? supabase
					.from("document_signers")
					.select("name, position, signature_data")
					.eq("id", doc.signer_id)
					.maybeSingle()
					.then((r) => r.data)
			: supabase
					.from("document_signers")
					.select("name, position, signature_data")
					.eq("is_default", true)
					.maybeSingle()
					.then((r) => r.data),
	]);

	const payments =
		event && doc.event_id ? await loadPaymentLines(supabase, doc.event_id) : [];

	let receiptPayment: PdfBuildContext["receiptPayment"] = null;
	if (doc.doc_type === "receipt" && doc.payment_id) {
		const { data: p } = await supabase
			.from("payments")
			.select(
				"amount, payment_type, payment_date, created_at, bank:bank_accounts(bank_name)",
			)
			.eq("id", doc.payment_id)
			.maybeSingle();
		if (p) {
			const bank = Array.isArray(p.bank) ? p.bank[0] : p.bank;
			// Terbayar s/d pembayaran ini: jumlahkan yang tanggalnya ≤ dan
			// (bila sama) dibuat lebih dulu — ini yang membuat "sisa setelah
			// pembayaran ini" di kuitansi DP lama tetap benar meski ada
			// cicilan berikutnya.
			const { data: all } = await supabase
				.from("payments")
				.select("amount, payment_date, created_at")
				.eq("event_id", doc.event_id ?? "")
				.eq("is_reversed", false);
			const paidThrough = (all ?? [])
				.filter(
					(x) =>
						x.payment_date < p.payment_date ||
						(x.payment_date === p.payment_date && x.created_at <= p.created_at),
				)
				.reduce((s, x) => s + (x.amount as number), 0);
			receiptPayment = {
				amount: p.amount as number,
				payment_type: p.payment_type as string,
				payment_date: p.payment_date as string,
				bank: (bank as { bank_name: string } | null)?.bank_name ?? null,
				paidThrough,
			};
		}
	}

	return {
		event,
		payments,
		receiptPayment,
		signer: (signerRow as PdfBuildContext["signer"]) ?? null,
		bank,
	};
}

/** `client` diisi admin hanya untuk jalur tanpa sesi (link PDF bertanda tangan). */
export async function loadPdfData(
	id: string,
	client?: Supabase,
): Promise<PdfDocData | null> {
	const doc = await loadDocument(id, client);
	if (!doc) return null;
	const ctx = await buildPdfContext(doc, client);
	return buildPdfData(doc, ctx);
}
