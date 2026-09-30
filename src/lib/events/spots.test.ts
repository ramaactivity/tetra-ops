import assert from "node:assert/strict";
import { test } from "node:test";
import {
	backdropUsage,
	eventSpots,
	frameSizesOf,
	spotsNeedingOwnDesign,
	spotsWithoutLead,
	windowsOverlap,
} from "./spots";
import { listMissingFields } from "./tbc";

test("spot ≥2 mewarisi frame spot 1, backdrop tidak", () => {
	const ev = {
		unit_count: 2,
		frame_size: "4R",
		backdrop_id: "a",
		spots: [{ spot: 2, frame_size: null, backdrop_id: null }],
	};
	assert.deepEqual(eventSpots(ev), [
		{ spot: 1, frame_size: "4R", backdrop_id: "a" },
		{ spot: 2, frame_size: "4R", backdrop_id: null },
	]);
	assert.deepEqual(
		frameSizesOf({
			...ev,
			spots: [{ spot: 2, frame_size: "2R", backdrop_id: "b" }],
		}),
		["4R", "2R"],
	);
});

test("belum lengkap menyebut backdrop per spot", () => {
	const base = {
		venue_name: "x",
		start_time: "10:00",
		pic_name: "p",
		frame_size: "4R",
	};
	assert.deepEqual(listMissingFields({ ...base, backdrop_id: null }), [
		"backdrop",
	]);
	assert.deepEqual(
		listMissingFields({ ...base, backdrop_id: "a", unit_count: 2, spots: [] }),
		["backdrop spot 2"],
	);
});

test("lead per spot", () => {
	assert.deepEqual(
		spotsWithoutLead(2, [{ role_in_event: "lead", spot_no: 1 }]),
		[2],
	);
	assert.deepEqual(
		spotsWithoutLead(1, [{ role_in_event: "asisten", spot_no: 1 }]),
		[1],
	);
	assert.deepEqual(spotsWithoutLead(1, [{ role_in_event: "lead" }]), []);
});

test("jendela waktu bentrok", () => {
	const pagi = { setup_time: "08:00", start_time: "09:00", end_time: "12:00" };
	const sore = { setup_time: "15:30", start_time: "16:30", end_time: "19:30" };
	assert.equal(windowsOverlap(pagi, sore), false);
	assert.equal(
		windowsOverlap(sore, { setup_time: "18:00", end_time: "22:00" }),
		true,
	);
	assert.equal(
		windowsOverlap(pagi, { start_time: null, end_time: null }),
		true,
	);
});

test("backdropUsage menghitung per spot", () => {
	const u = backdropUsage({
		unit_count: 2,
		backdrop_id: "a",
		spots: [{ spot: 2, frame_size: null, backdrop_id: "a" }],
	});
	assert.equal(u.get("a"), 2);
});

test("spot butuh desain sendiri hanya kalau beda ukuran", () => {
	const ev = {
		unit_count: 3,
		frame_size: "4R",
		spots: [
			{ spot: 2, frame_size: "2R", backdrop_id: null },
			{ spot: 3, frame_size: null, backdrop_id: null },
		],
	};
	assert.deepEqual(spotsNeedingOwnDesign(ev), [{ spot: 2, size: "2R" }]);
	// Spot 1 dikoreksi jadi 2R: spot 2 sama, spot 3 (ikut spot 1) ikut 2R.
	assert.deepEqual(spotsNeedingOwnDesign(ev, "2R"), []);
});
