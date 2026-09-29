/** Invoice otomatis dari event tidak pernah menulis "null". */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildLineItems,
	type EventForPdf,
	frameFormatLabel,
} from "./event-data";

test("label format cetak", () => {
	assert.equal(frameFormatLabel("4R"), "Format 4R");
	assert.equal(frameFormatLabel("polaroid"), "Format Polaroid");
	assert.equal(frameFormatLabel("none"), null);
	assert.equal(
		frameFormatLabel(null),
		"Format cetak menyusul (2R/4R/Polaroid)",
	);
});

test("event ukuran menyusul: detail tanpa 'null'", () => {
	const ev = {
		package_name: null,
		custom_package_name: "Photobooth Classic 3 Jam · ukuran menyusul",
		custom_package_price: 2_500_000,
		base_price: 2_500_000,
		package_duration_hours: null,
		frame_size: null,
		addons: [],
		backdrop_rental_total: 0,
	} as unknown as EventForPdf;
	const [item] = buildLineItems(ev);
	assert.equal(item.label, "Photobooth Classic 3 Jam · ukuran menyusul");
	assert.equal(item.detail, "Format cetak menyusul (2R/4R/Polaroid)");
	assert.ok(!JSON.stringify(buildLineItems(ev)).includes("null"));
	const named = buildLineItems({
		...ev,
		package_name: "4R Unlimited 3 Jam",
		package_duration_hours: 3,
		frame_size: "4R",
	} as EventForPdf);
	assert.equal(named[0].label, "4R Unlimited 3 Jam");
	assert.equal(named[0].detail, "Durasi 3 jam · Format 4R");
});

test("event 2 unit: qty 2 × harga per unit, format per spot", () => {
	const ev = {
		package_name: "4R Unlimited 3 Jam",
		package_duration_hours: 3,
		base_price: 5_000_000,
		frame_size: "4R",
		unit_count: 2,
		spots: [{ spot: 2, frame_size: "2R", backdrop_id: null }],
		addons: [],
		backdrop_rental_total: 0,
	} as unknown as EventForPdf;
	const [item] = buildLineItems(ev);
	assert.equal(item.quantity, 2);
	assert.equal(item.unitPrice, 2_500_000);
	assert.equal(item.total, 5_000_000);
	assert.equal(
		item.detail,
		"Durasi 3 jam · 2 unit photobooth (2 spot) · Spot 1: Format 4R · Spot 2: Format 2R",
	);
	const same = buildLineItems({ ...ev, spots: [] } as EventForPdf)[0];
	assert.equal(
		same.detail,
		"Durasi 3 jam · 2 unit photobooth (2 spot) · Format 4R",
	);
});
