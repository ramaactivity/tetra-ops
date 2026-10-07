/** Tahap papan pipeline owner. Jalankan: `pnpm test`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventStage, leadExpiringSoon } from "./pipeline";

const today = "2026-10-07";
const ev = (o: Partial<Parameters<typeof eventStage>[0]>) => ({
	status: "upcoming",
	event_date: "2026-11-01",
	design_status: "belum",
	...o,
});

test("tahap event: desain → siap → hari H → selesai, batal disembunyikan", () => {
	assert.equal(eventStage(ev({}), today), "desain");
	assert.equal(eventStage(ev({ design_status: "proses" }), today), "desain");
	assert.equal(eventStage(ev({ design_status: "approved" }), today), "siap");
	assert.equal(eventStage(ev({ event_date: today }), today), "hari_h");
	assert.equal(eventStage(ev({ status: "in_progress" }), today), "hari_h");
	assert.equal(
		eventStage(
			ev({ status: "awaiting_settlement", event_date: "2026-10-01" }),
			today,
		),
		"selesai",
	);
	assert.equal(eventStage(ev({ status: "completed" }), today), "selesai");
	assert.equal(eventStage(ev({ status: "cancelled" }), today), null);
});

test("lead hampir kedaluwarsa ≤ 5 hari", () => {
	const now = new Date("2026-10-07T00:00:00Z");
	assert.equal(leadExpiringSoon("2026-10-11T00:00:00Z", now), true);
	assert.equal(leadExpiringSoon("2026-10-20T00:00:00Z", now), false);
});
