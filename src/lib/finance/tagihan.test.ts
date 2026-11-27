import assert from "node:assert/strict";
import { test } from "node:test";
import { rincianInvoice, tagihanEvent } from "./tagihan";

test("sisa = tagihan - terbayar, potongan vendor di muka mengurangi tagihan", () => {
	assert.deepEqual(tagihanEvent({ grand_total: 2000000, total_paid: 500000 }), {
		billable: 2000000,
		terbayar: 500000,
		sisa: 1500000,
	});
	assert.deepEqual(
		tagihanEvent({
			grand_total: "3000000",
			total_paid: 0,
			vendor_commission_mode: "upfront_cut",
			vendor_commission_amount: 300000,
		}).billable,
		2700000,
	);
	// komisi biasa tidak memotong tagihan; kelebihan bayar tidak bikin sisa minus
	assert.equal(
		tagihanEvent({
			grand_total: 1000000,
			total_paid: 1200000,
			vendor_commission_mode: "commission",
			vendor_commission_amount: 100000,
		}).sisa,
		0,
	);
});

test("rincian invoice: nama + keterangan, subtotal = harga x qty; tanpa invoice = null", () => {
	assert.deepEqual(
		rincianInvoice({
			doc_number: "INV-TP-34-18112026",
			issued_at: "2026-11-26",
			discount: 0,
			items: [
				{
					name: "2R Unlimited 2 Jam",
					includes: [],
					qty: 1,
					unit_price: 2000000,
				},
				{ name: "Break Time", includes: ["1 Jam"], qty: 2, unit_price: 150000 },
			],
		}),
		{
			invoice: "INV-TP-34-18112026",
			tanggal: "2026-11-26",
			item: [
				{ nama: "2R Unlimited 2 Jam", qty: 1, subtotal: 2000000 },
				{ nama: "Break Time · 1 Jam", qty: 2, subtotal: 300000 },
			],
			diskon: 0,
		},
	);
	assert.equal(rincianInvoice(null), null);
});
