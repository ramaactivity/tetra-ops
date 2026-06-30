/**
 * Unit tests untuk math finance kritikal yang menentukan benar/tidaknya HPP,
 * deduksi stok, dan KESEIMBANGAN jurnal settlement. Semua fungsi di sini PURE
 * (tanpa DB), jadi cocok di-test cepat. Jalankan: `npm test`.
 *
 * Kenapa ada test ini: bug "Invalid UUID" lolos ke produksi karena verifikasi
 * cuma manual. Math di bawah ini yang paling mahal kalau salah (uang & buku).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketForSku, inventoryCoaForSku } from "@/lib/inventory/cogs-buckets";
import {
	computeRekapCost,
	deriveRekapRatio,
	type MappedItem,
	type RekapQuantities,
	sumBuckets,
	ZERO_BUCKETS,
} from "@/lib/rekap/cost";
import { bucketHpp, type CostedLine, roundQty } from "@/lib/rekap/recipe";

const ZERO_Q: RekapQuantities = {
	cetak_total: 0,
	media_set_used: 0,
	sleeve_used: 0,
	flashdisk_used: 0,
	pouch_used: 0,
	photomagnet_used: 0,
	keychain_used: 0,
};

test("roundQty — presisi 4 desimal (cocok dgn stock_movements NUMERIC(12,4))", () => {
	assert.equal(roundQty(108 / 1400), 0.0771);
	assert.equal(roundQty(0.07714285), 0.0771);
	assert.equal(roundQty(1), 1);
	assert.equal(roundQty(0), 0);
	// guards
	assert.equal(roundQty(Number.NaN), 0);
	assert.equal(roundQty(null as unknown as number), 0);
});

test("bucketHpp — total == jumlah bucket yang sudah dibulatkan", () => {
	const lines: CostedLine[] = [
		{ qty: 0.0771, unit_cost: 1_345_000, bucket: "mediaset" }, // 103.699,5 → 103.700
		{ qty: 108, unit_cost: 350, bucket: "sleeve" }, //              37.800
		{ qty: 1, unit_cost: 85_000, bucket: "flashdisk" }, //          85.000
		{ qty: 1, unit_cost: 10_000, bucket: "flashdisk" }, // FD-BOX → 10.000
		{ qty: 1, unit_cost: 1_000, bucket: "pouch" }, //                1.000
	];
	const hpp = bucketHpp(lines);
	assert.equal(hpp.mediaset, 103_700); // Math.round(103699.5)
	assert.equal(hpp.sleeve, 37_800);
	assert.equal(hpp.flashdisk, 95_000); // 85.000 + 10.000 (satu bucket)
	assert.equal(hpp.pouch, 1_000);
	assert.equal(hpp.total, 237_500);
	// invariant: total == jumlah semua bucket (yang menjamin Dr=Cr di jurnal)
	const sum =
		hpp.mediaset +
		hpp.sleeve +
		hpp.flashdisk +
		hpp.pouch +
		hpp.photomagnet +
		hpp.keychain +
		hpp.bonus +
		hpp.other;
	assert.equal(hpp.total, sum);
});

test("bucketHpp — jurnal settlement SELALU balance (Dr HPP per-bucket == Cr persediaan per-bucket)", () => {
	// Acak-acakan beberapa skenario: berapa pun lines-nya, sisi debit (beban HPP
	// per bucket) == sisi kredit (persediaan per bucket) karena pakai angka yang
	// sama → Dr total == Cr total.
	const scenarios: CostedLine[][] = [
		[],
		[{ qty: 1, unit_cost: 999, bucket: "other" }],
		[
			{ qty: 7, unit_cost: 1234, bucket: "mediaset" },
			{ qty: 7, unit_cost: 1234, bucket: "keychain" },
			{ qty: 0.3333, unit_cost: 90000, bucket: "mediaset" },
		],
	];
	for (const lines of scenarios) {
		const hpp = bucketHpp(lines);
		const debit = // beban HPP didebit per bucket
			hpp.mediaset +
			hpp.sleeve +
			hpp.flashdisk +
			hpp.pouch +
			hpp.photomagnet +
			hpp.keychain +
			hpp.bonus +
			hpp.other;
		const credit = debit; // persediaan dikredit dgn angka bucket yang sama
		assert.equal(debit, credit);
		assert.equal(hpp.total, debit);
	}
});

test("bucketHpp — lines kosong → semua nol", () => {
	const hpp = bucketHpp([]);
	assert.equal(hpp.total, 0);
	assert.equal(hpp.mediaset, 0);
});

test("deriveRekapRatio — sleeve 1:1; tanpa unit_conversion pakai qty_per_unit", () => {
	const m = (over: Partial<MappedItem> = {}): MappedItem => ({
		rekap_field: "media_set_used",
		frame_size: "",
		item_id: "x",
		qty_per_unit: 5,
		purchase_price_avg: 0,
		...over,
	});
	// sleeve selalu 1 (1:1 dgn cetak), berapa pun qty_per_unit
	assert.equal(
		deriveRekapRatio("sleeve_used", "2R", m({ qty_per_unit: 9 })),
		1,
	);
	// media TANPA base_unit/unit_conversion → pakai qty_per_unit apa adanya
	// (ratio hardcoded 1/1400 hanya dipakai kalau unit_conversion ADA tapi gagal)
	assert.equal(
		deriveRekapRatio("media_set_used", "2R", m({ qty_per_unit: 1 / 1400 })),
		1 / 1400,
	);
	// field non-derived → qty_per_unit apa adanya
	assert.equal(
		deriveRekapRatio("flashdisk_used", "2R", m({ qty_per_unit: 3 })),
		3,
	);
});

test("computeRekapCost + sumBuckets — skenario 2R (108 cetak, 1 flashdisk)", () => {
	const mappings: MappedItem[] = [
		{
			rekap_field: "media_set_used",
			frame_size: "",
			item_id: "media",
			// per-print ratio (2R: 1/1400). Tanpa unit_conversion, deriveRekapRatio
			// pakai qty_per_unit ini langsung.
			qty_per_unit: 1 / 1400,
			purchase_price_avg: 1_345_000,
		},
		{
			rekap_field: "sleeve_used",
			frame_size: "",
			item_id: "sleeve",
			qty_per_unit: 1,
			purchase_price_avg: 350,
		},
		{
			rekap_field: "flashdisk_used",
			frame_size: "",
			item_id: "fd",
			qty_per_unit: 1,
			purchase_price_avg: 85_000,
		},
	];
	const q: RekapQuantities = {
		...ZERO_Q,
		cetak_total: 108,
		media_set_used: 108,
		sleeve_used: 108,
		flashdisk_used: 1,
	};
	const buckets = computeRekapCost(q, mappings, [], [], "2R");
	// media: 108 * (1/1400) * 1.345.000 = 103.757,1 → round 103.757
	assert.equal(buckets.mediaset, 103_757);
	assert.equal(buckets.sleeve, 37_800); // 108 * 1 * 350
	assert.equal(buckets.flashdisk, 85_000); // 1 * 1 * 85.000
	assert.equal(sumBuckets(buckets), 103_757 + 37_800 + 85_000);
});

test("computeRekapCost — qty nol → bucket nol", () => {
	const buckets = computeRekapCost(ZERO_Q, [], [], [], "2R");
	assert.deepEqual(buckets, ZERO_BUCKETS);
	assert.equal(sumBuckets(buckets), 0);
});

test("bucketForSku / inventoryCoaForSku — SKU → bucket → COA persediaan", () => {
	const cases: Array<[string, string, string]> = [
		["MEDIA-BASIC", "mediaset", "1-200"],
		["MEDIA-PERF", "mediaset", "1-200"],
		["SLEEVE-2R", "sleeve", "1-201"],
		["FLASHDISK", "flashdisk", "1-202"],
		["FD-BOX", "flashdisk", "1-202"], // box flashdisk → bucket flashdisk
		["POUCH", "pouch", "1-203"],
		["PHOTOMAGNET", "photomagnet", "1-204"],
		["KEY-FRAME", "keychain", "1-205"],
		["KEY-STRAP", "keychain", "1-205"],
		["RANDOM-SKU", "other", "1-209"],
	];
	for (const [sku, bucket, coa] of cases) {
		assert.equal(bucketForSku(sku), bucket, `bucket ${sku}`);
		assert.equal(inventoryCoaForSku(sku), coa, `coa ${sku}`);
	}
});
