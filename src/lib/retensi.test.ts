import assert from "node:assert/strict";
import { test } from "node:test";
import { type EventRetensi, ringkasRetensi } from "./retensi";

const ev = (
	wa: string,
	tanggal: string,
	extra: Partial<EventRetensi> = {},
): EventRetensi => ({
	client_wa: wa,
	client_name: `Klien ${wa}`,
	event_category: "corporate",
	event_date: tanggal,
	status: "completed",
	channel: "direct",
	...extra,
});

test("retensi: status klien mengikuti jumlah event dan jarak dari event terakhir", () => {
	const hari = "2026-10-06";
	const r = ringkasRetensi(
		[
			ev("081111111111", "2025-01-10"),
			ev("081111111111", "2025-06-10"),
			ev("081111111111", "2026-05-10"), // setia (3 event)
			ev("082222222222", "2026-02-01"),
			ev("082222222222", "2026-12-01", { status: "upcoming" }), // kembali (ada jadwal)
			ev("083333333333", "2026-08-01"), // baru (<6 bulan)
			ev("084444444444", "2026-02-15"), // menunggu (6–12 bulan)
			ev("085555555555", "2025-03-01"),
			ev("085555555555", "2025-04-01"), // hilang walau pernah 2x
		],
		hari,
	);
	const status = Object.fromEntries(r.klien.map((k) => [k.wa, k.status]));
	assert.equal(status["6281111111111"], "setia");
	assert.equal(status["6282222222222"], "kembali");
	assert.equal(status["6283333333333"], "baru");
	assert.equal(status["6284444444444"], "menunggu");
	assert.equal(status["6285555555555"], "hilang");
	assert.equal(r.total, 5);
	assert.equal(r.pernah_kembali, 3);
});

test("retensi: pernikahan, batal, dan klien lewat vendor tidak dihitung", () => {
	const r = ringkasRetensi(
		[
			ev("081111111111", "2026-01-01", { event_category: "wedding" }),
			ev("082222222222", "2026-01-01", { status: "cancelled" }),
			ev("083333333333", "2026-01-01", { channel: "vendor" }),
			ev("084444444444", "2026-01-01"),
		],
		"2026-10-06",
	);
	assert.equal(r.total, 1);
	assert.equal(r.klien[0].wa, "6284444444444");
});
