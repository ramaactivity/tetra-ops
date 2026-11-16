import assert from "node:assert/strict";
import { test } from "node:test";
import {
	roundingJournalLines,
	splitInventoryDrift,
} from "./inventory-rounding";

test("pembulatan kecil dikoreksi, selisih besar & akun tanpa HPP jadi alarm", () => {
	const { rounding, alert } = splitInventoryDrift([
		{ coa: "1-200", drift: -6 },
		{ coa: "1-201", drift: 0 },
		{ coa: "1-202", drift: 100 },
		{ coa: "1-203", drift: -101 },
		{ coa: "1-999", drift: 5 },
	]);
	assert.deepEqual(rounding, [
		{ coa: "1-200", drift: -6 },
		{ coa: "1-202", drift: 100 },
	]);
	assert.deepEqual(alert, [
		{ coa: "1-203", drift: -101 },
		{ coa: "1-999", drift: 5 },
	]);
});

test("jurnal koreksi seimbang & arahnya benar", () => {
	const lines = roundingJournalLines([
		{ coa: "1-200", drift: -6 }, // GL < stok → Dr persediaan
		{ coa: "1-205", drift: 3 }, // GL > stok → Cr persediaan
	]);
	const by = (code: string) => lines.find((l) => l.account_code === code);
	assert.deepEqual(
		[by("1-200")?.debit_amount, by("5-100")?.credit_amount],
		[6, 6],
	);
	assert.deepEqual(
		[by("5-105")?.debit_amount, by("1-205")?.credit_amount],
		[3, 3],
	);
	const dr = lines.reduce((t, l) => t + l.debit_amount, 0);
	const cr = lines.reduce((t, l) => t + l.credit_amount, 0);
	assert.equal(dr, cr);
	assert.deepEqual(
		lines.map((l) => l.line_order),
		[1, 2, 3, 4],
	);
});
