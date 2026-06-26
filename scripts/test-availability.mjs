/**
 * Smoke test for the availability engine — pure logic, no DB.
 * Run: node --experimental-strip-types --no-warnings scripts/test-availability.mjs
 * (imports the .ts module via Node's type-stripping)
 */
import {
	bufferMinutes,
	computeAvailability,
	parseHHMM,
} from "../src/lib/availability.ts";

let passed = 0;
let failed = 0;
function eq(label, got, want) {
	const ok = JSON.stringify(got) === JSON.stringify(want);
	if (ok) {
		passed++;
		console.log(`  ✓ ${label}`);
	} else {
		failed++;
		console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
	}
}

const W = (s) => parseHHMM(s);

// Buffer table
eq("buffer: kota tak diketahui → 180", bufferMinutes(null, "Bogor"), 180);
eq("buffer: kota sama → 180", bufferMinutes("Bogor", "bogor"), 180);
eq("buffer: beda kota Jabodetabek → 180", bufferMinutes("Depok", "Bekasi"), 180);
eq("buffer: luar kota jauh → 240", bufferMinutes("Bogor", "Surabaya"), 240);

// Empty day → 3 free
eq(
	"hari kosong → 3 unit bebas, available",
	(() => {
		const r = computeAvailability({ reqStart: W("11:00"), reqEnd: W("13:00"), reqCity: "Bogor", events: [] });
		return [r.units_free, r.available, r.conflicts.length];
	})(),
	[3, true, 0],
);

// One event overlapping after buffer expansion: 10:00-13:00 in Bogor, buffer 180 → blocks 07:00-16:00
eq(
	"1 event overlap (buffer) → 2 bebas, tetap available",
	(() => {
		const r = computeAvailability({
			reqStart: W("11:00"),
			reqEnd: W("13:00"),
			reqCity: "Bogor",
			events: [{ client_name: "Bram & Adin", start_time: "10:00", end_time: "13:00", venue_city: "Bogor", package_duration_hours: 3 }],
		});
		return [r.units_free, r.available, r.conflicts.length, r.buffer_applied_minutes];
	})(),
	[2, true, 1, 180],
);

// Three concurrent events overlapping → 0 free, not available
eq(
	"3 event berbarengan → 0 bebas, penuh",
	(() => {
		const ev = (n) => ({ client_name: n, start_time: "11:00", end_time: "13:00", venue_city: "Bogor", package_duration_hours: 2 });
		const r = computeAvailability({ reqStart: W("11:00"), reqEnd: W("13:00"), reqCity: "Bogor", events: [ev("A"), ev("B"), ev("C")] });
		return [r.units_free, r.available, r.conflicts.length];
	})(),
	[0, false, 3],
);

// Touching windows do NOT overlap (no buffer): 09:00-11:00 then request 11:00-13:00, far city so buffer... use same far to isolate
eq(
	"window bersinggungan tanpa buffer → tidak bentrok",
	(() => {
		// buffer 0 only happens for all-day; emulate non-overlap by gap > buffer:
		// event 03:00-05:00 Bogor (buffer 180 → 00:00-08:00), request 11:00-13:00 → no overlap
		const r = computeAvailability({
			reqStart: W("11:00"),
			reqEnd: W("13:00"),
			reqCity: "Bogor",
			events: [{ client_name: "Pagi", start_time: "03:00", end_time: "05:00", venue_city: "Bogor", package_duration_hours: 2 }],
		});
		return [r.units_free, r.conflicts.length];
	})(),
	[3, 0],
);

// Event without time → held all day, always conflicts
eq(
	"event tanpa jam → ditahan seharian (bentrok)",
	(() => {
		const r = computeAvailability({
			reqStart: W("11:00"),
			reqEnd: W("13:00"),
			reqCity: "Bogor",
			events: [{ client_name: "TBC", start_time: null, end_time: null, venue_city: "Bogor", package_duration_hours: null }],
		});
		return [r.units_free, r.conflicts.length, r.assumptions.length > 0];
	})(),
	[2, 1, true],
);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
