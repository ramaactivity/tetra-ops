/** Aturan pembagian untung settle (dana cadangan dulu yang dikorbankan). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateProfit, allocationBase } from "./profit-allocation";

// Konfigurasi produksi: 5% + 3% + flat 100rb + 2%; 4 owner × 50rb.
const funds = [
	{
		code: "equipment",
		allocation_type: "percentage",
		allocation_value: 5,
		display_order: 1,
	},
	{
		code: "maintenance",
		allocation_type: "percentage",
		allocation_value: 3,
		display_order: 2,
	},
	{
		code: "crew_reserve",
		allocation_type: "flat",
		allocation_value: 100_000,
		display_order: 3,
	},
	{
		code: "emergency",
		allocation_type: "percentage",
		allocation_value: 2,
		display_order: 4,
	},
];
const run = (available: number) =>
	allocateProfit({ available, funds, ownerCount: 4, perPerson: 50_000 });

test("untung cukup → semua penuh, persen dari untung bersih", () => {
	const a = run(2_000_000);
	assert.equal(a.status, "penuh");
	assert.equal(a.sinkingTotal, 100_000 + 60_000 + 100_000 + 40_000);
	assert.equal(a.ownerPool, 200_000);
	assert.equal(a.sisaKas, 2_000_000 - 300_000 - 200_000);
});

test("kasus PT Mitra: untung 290.151 → bagi hasil penuh, cadangan dikurangi, kas 0", () => {
	const a = run(290_151);
	assert.equal(a.status, "cadangan_dikurangi");
	assert.equal(a.ownerPool, 200_000);
	assert.equal(a.sinkingTotal, 90_151);
	assert.equal(a.sisaKas, 0);
	// Diisi berurutan: equipment (14.507) → maintenance (8.704) → crew_reserve sisa.
	assert.deepEqual(
		a.sinking.map((s) => s.amount),
		[14_507, 8_704, 66_940, 0],
	);
});

test("untung < bagi hasil → bagi hasil dihapus, cadangan 0, semua ke kas", () => {
	const a = run(120_000);
	assert.equal(a.status, "tanpa_pembagian");
	assert.equal(a.ownerPool, 0);
	assert.equal(a.sinkingTotal, 0);
	assert.equal(a.sisaKas, 120_000);
});

test("rugi → tidak ada pembagian", () => {
	const a = run(-50_000);
	assert.equal(a.status, "tanpa_pembagian");
	assert.equal(a.sinkingTotal + a.ownerPool, 0);
});

test("tepat pas bagi hasil → cadangan 0, kas 0", () => {
	const a = run(200_000);
	assert.equal(a.ownerPool, 200_000);
	assert.equal(a.sinkingTotal, 0);
	assert.equal(a.sisaKas, 0);
});

test("dasar pembagian: dikurangi pengeluaran lain, tidak melebihi untung settle", () => {
	assert.equal(allocationBase(723_151, 433_000), 290_151);
	assert.equal(allocationBase(500_000, -100_000), 500_000);
});

test("tunggakan: event kurang mencatat tunggakan penuh", () => {
	const a = run(140_151);
	assert.equal(a.arrearsCreated, 200_000);
	assert.equal(a.arrearsPaid, 0);
	assert.equal(a.sisaKas, 140_151);
});

test("tunggakan dilunasi dari sisa kas event surplus (setelah cadangan)", () => {
	// Essilor: untung 780.847 → cadangan penuh 178.083, bagi hasil 200.000,
	// sisa 402.764 → lunasi tunggakan 200.000, kas 202.764.
	const a = allocateProfit({
		available: 780_847,
		funds,
		ownerCount: 4,
		perPerson: 50_000,
		arrearsOutstanding: 200_000,
	});
	assert.equal(a.sinkingTotal, 178_083);
	assert.equal(a.arrearsPaid, 200_000);
	assert.equal(a.sisaKas, 202_764);
	// Sisa kas tidak cukup → lunasi sebagian saja, kas 0.
	const b = allocateProfit({
		available: 780_847,
		funds,
		ownerCount: 4,
		perPerson: 50_000,
		arrearsOutstanding: 1_000_000,
	});
	assert.equal(b.arrearsPaid, 402_764);
	assert.equal(b.sisaKas, 0);
});

test("event yang dana cadangannya terpotong tidak melunasi tunggakan", () => {
	const a = allocateProfit({
		available: 290_151,
		funds,
		ownerCount: 4,
		perPerson: 50_000,
		arrearsOutstanding: 200_000,
	});
	assert.equal(a.arrearsPaid, 0);
	assert.equal(a.sisaKas, 0);
});
