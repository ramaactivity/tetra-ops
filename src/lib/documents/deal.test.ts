import assert from "node:assert/strict";
import { test } from "node:test";
import { quotationToBookingDefaults } from "./booking-defaults";
import { computeTotals } from "./totals";
import { type DocumentRow, dealVendorCut } from "./types";

const items = [
	{
		name: "4R 3 Jam",
		includes: [],
		qty: 1,
		unit_price: 2_500_000,
		package_id: "p1",
	},
	{ name: "Album", includes: [], qty: 1, unit_price: 100_000, addon_id: "a1" },
];

test("potongan langsung persen = % harga paket (rumus form booking)", () => {
	const deal = {
		channel: "vendor" as const,
		vendor_commission_mode: "upfront_cut" as const,
		vendor_commission_value_type: "percent" as const,
		vendor_commission_value: 10,
	};
	assert.equal(dealVendorCut(deal, items), 250_000);
	assert.equal(
		dealVendorCut({ ...deal, vendor_commission_mode: "commission" }, items),
		0,
	);
	assert.equal(dealVendorCut({ ...deal, channel: "direct" }, items), 0);
});

test("Deal: diskon klien & potongan vendor terpisah lagi, total tetap sama", () => {
	const q = {
		doc_number: "QUO-TP-01-01112026",
		client: { name: "PT. BIPO" },
		event_info: {},
		items,
		// diskon klien 100rb + potongan vendor 250rb
		discount: 350_000,
		gross_up_enabled: false,
		gross_up_rate: 2.5,
		due_date: null,
		deal: {
			channel: "vendor",
			vendor_name: "High Five EO",
			vendor_pic_name: "Ani",
			vendor_contact: "0818",
			vendor_commission_mode: "upfront_cut",
			vendor_commission_value_type: "percent",
			vendor_commission_value: 10,
			vendor_cut: 250_000,
			discount_type: "promo",
		},
	} as unknown as DocumentRow;
	const d = quotationToBookingDefaults(q, []);
	assert.equal(d.channel, "vendor");
	assert.equal(d.vendor_name, "High Five EO");
	assert.equal(d.vendor_commission_mode, "upfront_cut");
	assert.equal(d.discount_amount, 100_000);
	assert.equal(d.discount_type, "promo");
	// tagihan event = base + add-on − diskon klien − potongan vendor = total dokumen
	const docTotal = computeTotals(items, q.discount, {
		enabled: false,
		ratePct: 0,
	}).total;
	const billed = 2_500_000 + 100_000 - 100_000 - 250_000;
	assert.equal(billed, docTotal);
});
