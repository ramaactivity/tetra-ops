/**
 * Unit tests untuk helper "acara dengan jeda" (multi-sesi). Semua pure.
 * Jalankan: `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	activeMinutes,
	describeSchedule,
	formatDuration,
	formatScheduleInline,
	hasBreak,
	parseSegments,
	segmentGaps,
	segmentsEnvelope,
	validateSegments,
} from "@/lib/schedule/segments";

test("parseSegments menerima array JSONB maupun string JSON", () => {
	const arr = [
		{ start: "17:30", end: "18:30" },
		{ start: "19:00", end: "23:00" },
	];
	assert.deepEqual(parseSegments(arr), arr);
	assert.deepEqual(parseSegments(JSON.stringify(arr)), arr);
});

test("parseSegments memotong detik & membuang entri invalid", () => {
	assert.deepEqual(
		parseSegments([
			{ start: "17:30:00", end: "18:30:00" },
			{ start: "", end: "20:00" }, // dibuang
		]),
		[{ start: "17:30", end: "18:30" }],
	);
	assert.equal(parseSegments(null), null);
	assert.equal(parseSegments(""), null);
	assert.equal(parseSegments("bukan json"), null);
	assert.equal(parseSegments([]), null);
});

test("hasBreak hanya true kalau ≥2 sesi", () => {
	assert.equal(hasBreak([{ start: "10:00", end: "11:00" }]), false);
	assert.equal(
		hasBreak([
			{ start: "10:00", end: "11:00" },
			{ start: "12:00", end: "13:00" },
		]),
		true,
	);
	assert.equal(hasBreak(null), false);
});

test("validateSegments menolak overlap & urutan salah, mengurut hasil", () => {
	// tumpang tindih
	const overlap = validateSegments([
		{ start: "17:30", end: "19:30" },
		{ start: "19:00", end: "23:00" },
	]);
	assert.equal(overlap.ok, false);

	// end <= start
	const bad = validateSegments([{ start: "20:00", end: "20:00" }]);
	assert.equal(bad.ok, false);

	// valid tapi tak urut → di-sort
	const ok = validateSegments([
		{ start: "19:00", end: "23:00" },
		{ start: "17:30", end: "18:30" },
	]);
	assert.equal(ok.ok, true);
	if (ok.ok) assert.equal(ok.segments[0].start, "17:30");
});

test("envelope, active minutes, gaps sesuai contoh chat (1 jam + jeda 30 + 4 jam)", () => {
	const segs = [
		{ start: "17:30", end: "18:30" },
		{ start: "19:00", end: "23:00" },
	];
	assert.deepEqual(segmentsEnvelope(segs), { start: "17:30", end: "23:00" });
	assert.equal(activeMinutes(segs), 5 * 60); // 1 jam + 4 jam = 5 jam aktif
	assert.deepEqual(segmentGaps(segs), [30]); // jeda 30 menit
});

test("formatDuration", () => {
	assert.equal(formatDuration(30), "30 menit");
	assert.equal(formatDuration(60), "1 jam");
	assert.equal(formatDuration(90), "1 jam 30 menit");
	assert.equal(formatDuration(300), "5 jam");
});

test("formatScheduleInline: satu blok vs ada jeda", () => {
	assert.equal(formatScheduleInline("17:30", "22:30", null), "17:30–22:30");
	assert.equal(
		formatScheduleInline("17:30", "23:00", [
			{ start: "17:30", end: "18:30" },
			{ start: "19:00", end: "23:00" },
		]),
		"17:30–18:30 · jeda 30 menit · 19:00–23:00",
	);
});

test("describeSchedule menandai gapBeforeMin & activeMin", () => {
	const v = describeSchedule("17:30", "23:00", [
		{ start: "17:30", end: "18:30" },
		{ start: "19:00", end: "23:00" },
	]);
	assert.equal(v.hasBreak, true);
	assert.deepEqual(v.envelope, { start: "17:30", end: "23:00" });
	assert.equal(v.activeMin, 300);
	assert.equal(v.sessions[0].gapBeforeMin, 0);
	assert.equal(v.sessions[1].gapBeforeMin, 30);
	assert.equal(v.sessions[1].durationMin, 240);

	// tanpa segmen → satu blok
	const single = describeSchedule("10:00", "16:00", null);
	assert.equal(single.hasBreak, false);
	assert.equal(single.sessions.length, 1);
	assert.equal(single.activeMin, 360);
});
