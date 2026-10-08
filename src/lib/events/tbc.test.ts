import assert from "node:assert/strict";
import { test } from "node:test";
import { listMissingFields } from "./tbc";

test("Guest Cam tanpa booth tidak dituduh kurang backdrop/frame", () => {
	const base = {
		venue_name: "Hall",
		start_time: "10:00",
		pic_name: "A",
		backdrop_id: null,
		frame_size: "none",
		package_frame_size: "none",
	};
	assert.deepEqual(
		listMissingFields({ ...base, package_category: "guest_cam" }),
		[],
	);
	assert.deepEqual(
		listMissingFields({ ...base, package_category: "photostage_only" }),
		["backdrop"],
	);
});
