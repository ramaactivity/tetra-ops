import assert from "node:assert/strict";
import { test } from "node:test";
import {
	filterEmoneyAccounts,
	isEmoneyCoa,
	isTransportCoa,
} from "@/lib/finance/emoney";
import { findCategory } from "@/lib/finance/quick-record-categories";

/**
 * Batas pemakaian kartu e-toll: hanya untuk kebutuhan transportasi.
 *
 * Keputusan owner, 2026-08-28. Menawarkan kartu sebagai alat bayar supplier,
 * fee crew, hutang, atau komisi cuma memperbesar peluang salah pilih — dan
 * sekali tercatat, saldo kartu di buku langsung meleset dari kartu fisiknya.
 */

const ACCOUNTS = [
	{ code: "1-100", name: "Kas Tunai" },
	{ code: "1-110", name: "Bank BCA" },
	{ code: "1-140", name: "E-toll Flazz BCA" },
	{ code: "1-159", name: "E-money batas atas" },
];

test("kartu dikenali dari blok kodenya, bank tidak ikut terjaring", () => {
	assert.equal(isEmoneyCoa("1-140"), true);
	assert.equal(isEmoneyCoa("1-159"), true);
	// Batas blok: 1-139 masih bank, 1-160 di luar rentang kartu.
	assert.equal(isEmoneyCoa("1-139"), false);
	assert.equal(isEmoneyCoa("1-160"), false);
	assert.equal(isEmoneyCoa("1-110"), false);
	assert.equal(isEmoneyCoa("1-100"), false);
	assert.equal(isEmoneyCoa(null), false);
});

test("alur non-transportasi tidak pernah menawarkan kartu", () => {
	const codes = filterEmoneyAccounts(ACCOUNTS, false).map((a) => a.code);
	assert.deepEqual(codes, ["1-100", "1-110"]);
});

test("alur transportasi tetap dapat kartunya", () => {
	const codes = filterEmoneyAccounts(ACCOUNTS, true).map((a) => a.code);
	assert.deepEqual(codes, ["1-100", "1-110", "1-140", "1-159"]);
});

test("kelima akun beban transportasi dikenali", () => {
	for (const coa of ["5-210", "5-211", "5-212", "5-213", "5-214"]) {
		assert.equal(isTransportCoa(coa), true, coa);
	}
});

test("beban lain bukan transportasi", () => {
	for (const coa of ["5-240", "5-250", "5-200", "5-215", "5-600", "1-140"]) {
		assert.equal(isTransportCoa(coa), false, coa);
	}
});

test("kategori Catat memetakan ke izin yang benar", () => {
	// Yang boleh pakai kartu.
	for (const id of ["toll", "parkir", "transport-online", "sewa-mobil"]) {
		const cat = findCategory(id);
		assert.ok(cat, `kategori ${id} hilang`);
		assert.equal(isTransportCoa(cat.coa), true, `${id} → ${cat.coa}`);
	}
	// Yang tidak boleh.
	for (const id of ["konsumsi", "operasional-lain"]) {
		const cat = findCategory(id);
		assert.ok(cat, `kategori ${id} hilang`);
		assert.equal(isTransportCoa(cat.coa), false, `${id} → ${cat.coa}`);
	}
});
