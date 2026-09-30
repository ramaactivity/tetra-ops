import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSpots, frameSizesOf, spotsWithoutLead } from "./spots";
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
