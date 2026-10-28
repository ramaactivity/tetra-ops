import assert from "node:assert/strict";
import { test } from "node:test";
import { type BillToSource, billTo } from "./types";

const ev: BillToSource = {
	client_name: "High Five — Gathering",
	client_org: "PT. BIPO",
	booker_name: "Rakha Dava",
	event_category: "corporate",
	bill_to_mode: null,
	bill_to_name: null,
	bill_to_attn: null,
	client_wa: "0896",
	vendor_name: "High Five",
	vendor_pic_name: "Nisa",
	vendor_contact: "0812",
};

test("default: klien + u.p. pembooking, WA klien", () => {
	assert.deepEqual(billTo(ev), {
		name: "PT. BIPO",
		attn: "Rakha Dava",
		phone: "0896",
	});
});

test("vendor: KEPADA vendor, u.p. PIC vendor, WA vendor", () => {
	assert.deepEqual(billTo({ ...ev, bill_to_mode: "vendor" }), {
		name: "High Five",
		attn: "Nisa",
		phone: "0812",
	});
});

test("vendor tanpa data vendor → jatuh ke klien", () => {
	assert.deepEqual(
		billTo({ ...ev, bill_to_mode: "vendor", vendor_name: null }),
		{ name: "PT. BIPO", attn: null, phone: "0896" },
	);
});
