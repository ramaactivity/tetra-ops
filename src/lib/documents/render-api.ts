/**
 * Mesin cetak dokumen (DR-067) — bagian murni: kontrak body API dan
 * penerjemahan ke baris dokumen + konteks PDF. Tetra Ops TIDAK menyimpan
 * apa pun dari sini: data, nomor, dan pembukuan milik pemanggil (dashboard
 * Tetra Visual). Kontrak: docs/06_API_SPEC.md §24.
 */
import { z } from "zod";
import { BRAND_KEYS } from "./brand";
import type { PdfBuildContext } from "./pdf-data";
import type { DocumentRow } from "./types";

const tanggal = z.iso.date();
const teks = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null);
const rupiah = z.number().int().min(0).max(10_000_000_000);

export const RenderDocSchema = z
	.object({
		brand: z.enum(BRAND_KEYS),
		doc_type: z.enum(["quotation", "invoice", "receipt"]),
		doc_number: z.string().trim().min(3).max(60),
		issued_at: tanggal,
		due_date: tanggal.nullish(),
		valid_until: tanggal.nullish(),
		client: z.object({
			name: z.string().trim().min(1).max(160),
			attn: teks(160),
			phone: teks(40),
			email: teks(160),
			address: teks(400),
		}),
		event: z
			.object({
				title: teks(160),
				date: tanggal.nullish(),
				time: teks(80),
				venue: teks(160),
				city: teks(80),
			})
			.default({
				title: null,
				date: null,
				time: null,
				venue: null,
				city: null,
			}),
		items: z
			.array(
				z.object({
					name: z.string().trim().min(1).max(200),
					includes: z
						.array(z.string().trim().min(1).max(200))
						.max(30)
						.default([]),
					qty: z.number().positive().max(10_000),
					unit_price: rupiah,
				}),
			)
			.min(1)
			.max(50),
		discount: rupiah.default(0),
		gross_up: z
			.object({ enabled: z.boolean(), rate_pct: z.number().min(0).max(20) })
			.default({ enabled: false, rate_pct: 0 }),
		notes: teks(2000),
		terms: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
		/** Pembayaran yang sudah masuk (invoice: "sudah dibayar"). */
		payments: z
			.array(
				z.object({
					date: tanggal,
					amount: rupiah,
					type: z.enum(["dp", "partial", "pelunasan"]).default("partial"),
					bank: teks(80),
					ref: teks(60),
				}),
			)
			.max(50)
			.default([]),
		/** Wajib untuk kuitansi: pembayaran yang dikuitansikan. */
		receipt: z
			.object({
				date: tanggal,
				amount: rupiah,
				type: z.enum(["dp", "partial", "pelunasan"]),
				bank: teks(80),
				sender: teks(160),
				/** Total terbayar SETELAH pembayaran ini (termasuk). */
				paid_through: rupiah,
			})
			.nullish(),
		/** Kosong = penanda tangan bawaan Tetra Ops (beserta tanda tangannya). */
		signer: z
			.object({ name: z.string().trim().min(1).max(120), position: teks(120) })
			.nullish(),
		/** Kosong = rekening penerima bawaan Tetra Ops. */
		bank: z
			.object({
				bank_name: z.string().trim().min(1).max(80),
				account_number: z.string().trim().min(3).max(40),
				account_name: z.string().trim().min(1).max(160),
			})
			.nullish(),
	})
	.refine((b) => b.doc_type !== "receipt" || b.receipt, {
		message: "receipt wajib diisi untuk doc_type receipt",
		path: ["receipt"],
	});
export type RenderDocInput = z.output<typeof RenderDocSchema>;

type Defaults = {
	signer: PdfBuildContext["signer"];
	bank: PdfBuildContext["bank"];
};

/** Body API → baris dokumen + konteks PDF (tanpa I/O). */
export function toRenderable(
	b: RenderDocInput,
	defaults: Defaults,
): {
	doc: Omit<DocumentRow, "id" | "created_at" | "updated_at">;
	ctx: PdfBuildContext;
} {
	const signer = b.signer
		? {
				name: b.signer.name,
				position: b.signer.position ?? "",
				signature_data: null,
			}
		: defaults.signer;
	return {
		doc: {
			doc_type: b.doc_type,
			doc_number: b.doc_number,
			event_id: null,
			payment_id: null,
			source_document_id: null,
			client: {
				name: b.client.name,
				attn: b.client.attn,
				phone: b.client.phone,
				email: b.client.email,
				address: b.client.address,
			},
			event_info: {
				title: b.event.title ?? null,
				date: b.event.date ?? null,
				time: b.event.time ?? null,
				venue: b.event.venue ?? null,
				city: b.event.city ?? null,
			},
			items: b.items.map((i) => ({
				name: i.name,
				includes: i.includes,
				qty: i.qty,
				unit_price: i.unit_price,
			})),
			discount: b.discount,
			gross_up_enabled: b.gross_up.enabled,
			gross_up_rate: b.gross_up.rate_pct,
			notes: b.notes,
			terms: b.terms.length ? b.terms.join("\n") : null,
			signer_id: null,
			signer_name: signer?.name ?? null,
			signer_position: signer?.position ?? null,
			issued_at: b.issued_at,
			due_date: b.due_date ?? null,
			valid_until: b.valid_until ?? null,
			status: "draft",
		},
		ctx: {
			event: null,
			payments: b.payments.map((p) => ({
				date: p.date,
				type: p.type,
				amount: p.amount,
				ref: p.ref ?? "",
				bank: p.bank,
			})),
			receiptPayment: b.receipt
				? {
						amount: b.receipt.amount,
						payment_type: b.receipt.type,
						payment_date: b.receipt.date,
						bank: b.receipt.bank,
						paidThrough: b.receipt.paid_through,
						sender: b.receipt.sender,
					}
				: null,
			signer,
			invoiceNumber: null,
			bank: b.bank
				? {
						bank_name: b.bank.bank_name,
						account_number: b.bank.account_number,
						account_name: b.bank.account_name,
						account_holder: b.bank.account_name,
					}
				: defaults.bank,
		},
	};
}
