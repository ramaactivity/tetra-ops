import assert from "node:assert/strict";
import { test } from "node:test";
import {
	listPurchaseUnits,
	normalizeConversion,
	toBase,
} from "@/lib/inventory/unit-conversion";

/**
 * Pilihan satuan di dialog Catat Pembelian.
 *
 * Bug yang ditutup: dialog memakai `Object.keys(item.unit_conversion)`. Pada
 * bentuk konversi v2 — `{ units: {...}, base_unit: "roll" }` — itu mengembalikan
 * "units" dan "base_unit", yaitu nama kunci pembungkusnya, BUKAN satuan. 13 item
 * aktif memakai bentuk ini, jadi pemilihnya menawarkan dua pilihan yang tidak
 * ada artinya dan apa pun yang dipilih ditolak server ("Unit tidak dikenal").
 */

// Bentuk asli MEDIA-BASIC di produksi.
const MEDIA_BASIC = {
	base_unit: "roll",
	units: {
		box: {
			kind: "purchase",
			label: "Box (2 Roll)",
			multiplier: 2,
			denominator: null,
		},
		roll: { kind: "base", label: "Roll", multiplier: 1, denominator: 1 },
		lembar: {
			kind: "consumption",
			label: "Lembar",
			multiplier: null,
			denominator: 1400,
		},
	},
};

test("bentuk v2 menghasilkan satuan asli, bukan kunci pembungkus", () => {
	const map = normalizeConversion(MEDIA_BASIC, "roll");
	const codes = listPurchaseUnits(map).map((u) => u.code);

	assert.ok(!codes.includes("units"), "'units' bocor sebagai pilihan satuan");
	assert.ok(
		!codes.includes("base_unit"),
		"'base_unit' bocor sebagai pilihan satuan",
	);
	assert.deepEqual([...codes].sort(), ["box", "roll"]);
});

test("setiap satuan yang ditawarkan bisa dikonversi server", () => {
	const map = normalizeConversion(MEDIA_BASIC, "roll");
	for (const u of listPurchaseUnits(map)) {
		// toBase() melempar untuk satuan tak dikenal — inilah yang dulu terjadi
		// begitu owner memilih "units"/"base_unit".
		assert.doesNotThrow(() => toBase(1, u.code, map), `satuan ${u.code}`);
	}
	assert.equal(toBase(1, "box", map), 2, "1 box harus jadi 2 roll");
	assert.equal(toBase(1, "roll", map), 1);
});

test("satuan pemakaian tidak ditawarkan saat membeli", () => {
	const map = normalizeConversion(MEDIA_BASIC, "roll");
	const codes = listPurchaseUnits(map).map((u) => u.code);
	// Harga "per lembar" di form pembelian bikin biaya per satuan dasar ngawur
	// (1 lembar = 1/1400 roll).
	assert.ok(!codes.includes("lembar"));
});

test("label yang dipakai layar adalah label manusia", () => {
	const map = normalizeConversion(MEDIA_BASIC, "roll");
	const labels = listPurchaseUnits(map).map((u) => u.def.label);
	// sanitizeLabel sengaja membuang keterangan dalam kurung, jadi "Box
	// (2 Roll)" tampil sebagai "Box". Rasionya ditampilkan terpisah sebagai
	// sublabel di dialog, bukan lewat label ini.
	assert.deepEqual([...labels].sort(), ["Box", "Roll"]);
});

test("item tanpa konversi tetap dapat satu satuan dasarnya", () => {
	const map = normalizeConversion(null, "pcs");
	const codes = listPurchaseUnits(map).map((u) => u.code);
	assert.deepEqual(codes, ["pcs"]);
});

test("item yang hanya punya satuan pemakaian tidak berakhir kosong", () => {
	// Salah konfigurasi: tak ada satuan beli maupun dasar bertanda 'base'.
	// Pemilih tidak boleh kosong total — owner jadi tak bisa menyimpan apa pun.
	const odd = {
		base_unit: "pcs",
		units: {
			lembar: {
				kind: "consumption",
				label: "Lembar",
				multiplier: null,
				denominator: 10,
			},
		},
	};
	const map = normalizeConversion(odd, "pcs");
	assert.ok(listPurchaseUnits(map).length > 0);
});
