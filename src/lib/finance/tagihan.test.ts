import assert from "node:assert/strict";
import { test } from "node:test";
import { tagihanEvent } from "./tagihan";

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
