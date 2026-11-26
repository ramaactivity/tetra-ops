import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPdfData } from "./pdf-data";
import { RenderDocSchema, toRenderable } from "./render-api";

const base = {
	brand: "tetra_visual",
	doc_type: "invoice",
	doc_number: "INV-TV-01-26112026",
	issued_at: "2026-11-26",
	due_date: "2026-11-26",
	client: { name: "Panorama JTB", phone: "081585246032" },
	event: { title: "Panorama JTB", date: "2026-11-26", time: "17.00 – selesai" },
	items: [
		{
			name: "Dokumentasi Foto & Video",
			includes: ["1 Fotografer", "1 Videografer"],
			qty: 1,
			unit_price: 2_000_000,
		},
	],
	terms: ["Pembayaran penuh sebelum acara dimulai."],
};
const defaults = {
	signer: { name: "Ramadan Saputra", position: "Owner", signature_data: null },
	bank: {
		bank_name: "BCA",
		account_number: "0954965224",
		account_name: "Muhamad Ramadan Saputra",
		account_holder: "Muhamad Ramadan Saputra",
	},
};

test("invoice Tetra Visual: total, sisa, rekening & penanda tangan bawaan", () => {
	const b = RenderDocSchema.parse(base);
	const { doc, ctx } = toRenderable(b, defaults);
	const d = buildPdfData(doc, ctx);
	assert.equal(d.totals.total, 2_000_000);
	assert.equal(d.docNumber, "INV-TV-01-26112026");
	assert.equal(ctx.bank?.account_number, "0954965224");
	assert.equal(ctx.signer?.name, "Ramadan Saputra");
	assert.equal(doc.terms, "Pembayaran penuh sebelum acara dimulai.");
});

test("diskon & pembayaran masuk hitungan; rekening/penanda tangan bisa diganti", () => {
	const b = RenderDocSchema.parse({
		...base,
		discount: 100_000,
		payments: [
			{ date: "2026-11-20", amount: 500_000, type: "dp", bank: "BCA" },
		],
		signer: { name: "Admin TV" },
		bank: {
			bank_name: "Mandiri",
			account_number: "123456",
			account_name: "Tetra Visual",
		},
	});
	const { doc, ctx } = toRenderable(b, defaults);
	const d = buildPdfData(doc, ctx);
	assert.equal(d.totals.total, 1_900_000);
	assert.equal(ctx.payments[0].amount, 500_000);
	assert.equal(ctx.bank?.bank_name, "Mandiri");
	assert.equal(ctx.signer?.name, "Admin TV");
	assert.equal(ctx.signer?.signature_data, null);
});

test("ditolak: merek asing, item kosong, kuitansi tanpa data pembayaran", () => {
	assert.equal(
		RenderDocSchema.safeParse({ ...base, brand: "lain" }).success,
		false,
	);
	assert.equal(
		RenderDocSchema.safeParse({ ...base, items: [] }).success,
		false,
	);
	assert.equal(
		RenderDocSchema.safeParse({ ...base, doc_type: "receipt" }).success,
		false,
	);
	assert.equal(
		RenderDocSchema.safeParse({
			...base,
			doc_type: "receipt",
			receipt: {
				date: "2026-11-26",
				amount: 2_000_000,
				type: "pelunasan",
				paid_through: 2_000_000,
			},
		}).success,
		true,
	);
});
