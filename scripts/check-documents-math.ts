/**
 * Self-check terbilang + computeTotals.
 *   npx tsx scripts/check-documents-math.ts
 */
import assert from "node:assert/strict";
import { computeTotals } from "../src/lib/documents/totals";
import { terbilang, terbilangRupiah } from "../src/lib/terbilang";

assert.equal(terbilang(0), "nol");
assert.equal(terbilang(11), "sebelas");
assert.equal(terbilang(19), "sembilan belas");
assert.equal(terbilang(21), "dua puluh satu");
assert.equal(terbilang(100), "seratus");
assert.equal(terbilang(1000), "seribu");
assert.equal(terbilang(1500), "seribu lima ratus");
assert.equal(terbilang(2_000_000), "dua juta");
assert.equal(
	terbilang(2_040_816),
	"dua juta empat puluh ribu delapan ratus enam belas",
);
assert.equal(terbilang(111_111), "seratus sebelas ribu seratus sebelas");
assert.equal(terbilangRupiah(500_000), "Lima ratus ribu rupiah");

const items = [{ qty: 1, unit_price: 2_000_000 }];
const plain = computeTotals(items, 0, { enabled: false, ratePct: 2 });
assert.deepEqual(plain, {
	subtotal: 2_000_000,
	discount: 0,
	net: 2_000_000,
	grossUp: 0,
	total: 2_000_000,
});

// Gross-up 2%: klien potong 2% dari total → Tetra tetap terima 2.000.000
const gu = computeTotals(items, 0, { enabled: true, ratePct: 2 });
assert.equal(gu.total, 2_040_816);
assert.equal(gu.grossUp, 40_816);
assert.equal(Math.round(gu.total * 0.98), 2_000_000);

// Diskon tidak boleh melebihi subtotal; qty × harga dijumlah
const d = computeTotals(
	[
		{ qty: 2, unit_price: 100_000 },
		{ qty: 1, unit_price: 50_000 },
	],
	999_999,
	{ enabled: false, ratePct: 2 },
);
assert.equal(d.subtotal, 250_000);
assert.equal(d.discount, 250_000);
assert.equal(d.total, 0);

console.log("documents math OK");
