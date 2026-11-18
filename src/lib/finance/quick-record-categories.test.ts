import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestCategory } from "./quick-record-categories";

const cat = (t: string) => {
	const s = suggestCategory(t);
	return s?.kind === "category" ? s.categoryId : (s?.kind ?? null);
};

test("Beli apa: barang pakai sendiri → Beli alat; alat mahal ditandai aset", () => {
	assert.equal(cat("Gunting Joyko ×3 (Shopee)"), "beli-alat");
	assert.equal(cat("guntingnya 3"), "beli-alat");
	assert.deepEqual(suggestCategory("printer DNP"), {
		kind: "category",
		categoryId: "beli-alat",
		aset: true,
	});
});

test("Beli apa: langganan isi chip layanan; token listrik bukan token AI", () => {
	assert.deepEqual(suggestCategory("topup token AI sumopod"), {
		kind: "category",
		categoryId: "platform",
		preset: "Token AI",
	});
	assert.deepEqual(suggestCategory("perpanjang VPS"), {
		kind: "category",
		categoryId: "platform",
		preset: "VPS Sumopod",
	});
	assert.equal(cat("token listrik kost"), "operasional-lain");
	assert.equal(cat("bayar wifi"), "bayar-internet");
	assert.equal(cat("kosan desember"), "bayar-kost");
});

test("Beli apa: bahan jual diarahkan ke Pembelian", () => {
	assert.deepEqual(suggestCategory("flashdisk 32gb"), {
		kind: "pembelian",
		keyword: "flashdisk",
	});
	assert.equal(cat("media set 4R"), "pembelian");
});

test("Beli apa: kata kunci pendek harus kata utuh", () => {
	assert.equal(cat("tolong catat"), null);
	assert.equal(cat("kosmetik"), null);
	assert.equal(cat("tol cikampek"), "toll");
	assert.equal(cat("makan rapat owner"), "konsumsi-rapat");
	assert.equal(cat("x"), null);
});
