/** API baca-saja Tetra Booth: rentang tanggal & bentuk data (tanpa field uang/kontak). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type BoothEventRow,
	parseBoothRange,
	toBoothBooking,
} from "@/lib/booth-api";

test("rentang bawaan hari ini + 60 hari, validasi format & batas", () => {
	assert.deepEqual(parseBoothRange(null, null, "2026-10-04"), {
		from: "2026-10-04",
		to: "2026-12-03",
	});
	assert.deepEqual(parseBoothRange("2026-11-01", "2026-11-30", "2026-10-04"), {
		from: "2026-11-01",
		to: "2026-11-30",
	});
	assert.ok("error" in parseBoothRange("04-10-2026", null, "2026-10-04"));
	assert.ok("error" in parseBoothRange("2026-11-01", "2026-10-01", "x"));
	assert.ok("error" in parseBoothRange("2026-01-01", "2026-12-31", "x"));
});

const row = (o: Partial<BoothEventRow> = {}): BoothEventRow => ({
	project_id: "TP-0101",
	client_name: "Andi & Sari",
	event_title: null,
	event_category: "wedding",
	event_date: "2026-10-12",
	start_time: "14:00:00",
	end_time: "17:00:00",
	venue_name: "Gedung Kirana",
	venue_city: "Bogor",
	service_type: "photobooth_classic",
	frame_size: "2R",
	custom_package_name: null,
	package: { name: "Wedding 3 Jam", duration_hours: 3 },
	event_type: { label: "Wedding" },
	...o,
});

test("paket dari tabel packages, atau nama paket kustom", () => {
	const b = toBoothBooking(row());
	assert.equal(b.package_name, "Wedding 3 Jam");
	assert.equal(b.package_duration_hours, 3);
	assert.equal(b.event_category_label, "Wedding");
	assert.equal(b.start_time, "14:00");
	const c = toBoothBooking(
		row({ package: null, custom_package_name: "Custom 5 jam" }),
	);
	assert.equal(c.package_name, "Custom 5 jam");
	assert.equal(c.package_duration_hours, null);
	// embed to-one kadang array di tipe PostgREST
	const d = toBoothBooking(
		row({ package: [{ name: "Arr", duration_hours: 2 }], event_type: [] }),
	);
	assert.equal(d.package_name, "Arr");
	assert.equal(d.event_category_label, null);
});

test("tidak pernah membawa field uang atau kontak", () => {
	const leaky = {
		...row(),
		grand_total: 5_000_000,
		client_phone: "0812",
	} as BoothEventRow;
	const keys = Object.keys(toBoothBooking(leaky));
	for (const k of keys)
		assert.ok(!/total|price|phone|wa|paid|balance/i.test(k), k);
});
