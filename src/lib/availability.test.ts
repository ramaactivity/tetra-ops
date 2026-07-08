/**
 * Unit tests untuk availability engine — fokus perilaku "acara dengan jeda".
 * Yang paling kritikal: satu event TIDAK boleh dihitung >1 unit, dan jeda yang
 * cukup panjang (di luar buffer) tidak menahan unit. Jalankan: `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type AvailabilityEvent,
	computeAvailability,
} from "@/lib/availability";

const HHMM = (h: number, m = 0) => h * 60 + m;

function ev(overrides: Partial<AvailabilityEvent>): AvailabilityEvent {
	return {
		client_name: "Test",
		start_time: null,
		end_time: null,
		venue_city: null,
		package_duration_hours: null,
		session_segments: null,
		...overrides,
	};
}

test("event dengan jeda dihitung MAKS 1 unit meski request overlap 2 sesi", () => {
	// Sesi 10:00-11:00 & 14:00-15:00. Buffer 180 mnt melebarkan keduanya sampai
	// saling tumpang tindih → tanpa merge, request di celah bisa terhitung 2 unit.
	const events = [
		ev({
			session_segments: [
				{ start: "10:00", end: "11:00" },
				{ start: "14:00", end: "15:00" },
			],
		}),
	];
	const res = computeAvailability({
		reqStart: HHMM(12),
		reqEnd: HHMM(13),
		reqCity: null,
		events,
	});
	// 3 unit total − 1 event = 2 bebas. (Bukan 1 — itu bug double-count.)
	assert.equal(res.units_free, 2);
});

test("jeda panjang (di luar buffer) tidak menahan unit di celahnya", () => {
	// Pagi 08:00-10:00, malam 18:00-22:00. Buffer 180: buffered pagi berakhir
	// 13:00, buffered malam mulai 15:00 → celah 13:00-15:00 benar-benar bebas.
	const events = [
		ev({
			session_segments: [
				{ start: "08:00", end: "10:00" },
				{ start: "18:00", end: "22:00" },
			],
		}),
	];
	const res = computeAvailability({
		reqStart: HHMM(13, 30),
		reqEnd: HHMM(14, 30),
		reqCity: null,
		events,
	});
	assert.equal(res.units_free, 3); // tak ada yang mengunci di celah
	assert.equal(res.conflicts.length, 0);
});

test("event satu blok tetap berperilaku seperti sebelumnya (regresi)", () => {
	const events = [ev({ start_time: "10:00", end_time: "13:00" })];
	const res = computeAvailability({
		reqStart: HHMM(12),
		reqEnd: HHMM(12, 30),
		reqCity: null,
		events,
	});
	assert.equal(res.units_free, 2);
	assert.equal(res.conflicts.length, 1);
});

test("tiga event bersamaan → penuh (units_free 0)", () => {
	const events = [
		ev({ start_time: "10:00", end_time: "12:00", venue_city: "Jakarta" }),
		ev({ start_time: "10:00", end_time: "12:00", venue_city: "Jakarta" }),
		ev({
			venue_city: "Jakarta",
			session_segments: [
				{ start: "09:00", end: "10:00" },
				{ start: "11:00", end: "12:00" },
			],
		}),
	];
	const res = computeAvailability({
		reqStart: HHMM(11),
		reqEnd: HHMM(11, 30),
		reqCity: "Jakarta",
		events,
	});
	assert.equal(res.units_free, 0);
});
