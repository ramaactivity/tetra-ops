import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRupiah, formatSignedRupiah } from "./format";

test("rupiah negatif pakai tanda di depan, tidak ganda", () => {
	assert.equal(formatRupiah(1750000), "Rp 1.750.000");
	assert.equal(formatRupiah(-63841), "−Rp 63.841");
	assert.equal(formatSignedRupiah(-63841), "−Rp 63.841");
	assert.equal(formatRupiah(0), "Rp 0");
});
