import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePeriod, shiftYm } from "./report-period";

test("shiftYm melewati batas tahun", () => {
	assert.equal(shiftYm("2027-01", -1), "2026-12");
	assert.equal(shiftYm("2026-11", -2), "2026-09");
	assert.equal(shiftYm("2026-12", 1), "2027-01");
});

test("pintasan periode dipotong ke awal pembukuan", () => {
	const r = (periode?: string, bulan?: string) =>
		resolvePeriod({ periode, bulan }, "2026-11", "2026-06");
	assert.deepEqual(
		[r().from, r().to, r().months, r().preset, r().label],
		["2026-11", "2026-11", 1, "bulan-ini", "November 2026"],
	);
	assert.deepEqual(
		[r("bulan-lalu").from, r("bulan-lalu").to],
		["2026-10", "2026-10"],
	);
	assert.deepEqual([r("3-bulan").from, r("3-bulan").months], ["2026-09", 3]);
	const y = r("tahun-ini");
	assert.deepEqual(
		[y.from, y.to, y.months, y.label],
		["2026-06", "2026-11", 6, "Tahun ini · Jun–Nov 2026"],
	);
	assert.equal(r("semua").from, "2026-06");
	assert.deepEqual(
		[r(undefined, "2026-08").from, r(undefined, "2026-08").preset],
		["2026-08", null],
	);
	// bulan di masa depan / format rusak → bulan berjalan
	assert.equal(r(undefined, "2027-02").from, "2026-11");
	assert.equal(r("ngawur").from, "2026-11");
});

test("Januari: bulan lalu = Desember tahun sebelumnya", () => {
	const p = resolvePeriod({ periode: "bulan-lalu" }, "2027-01", "2026-06");
	assert.deepEqual(
		[p.from, p.to, p.label],
		["2026-12", "2026-12", "Desember 2026"],
	);
});
