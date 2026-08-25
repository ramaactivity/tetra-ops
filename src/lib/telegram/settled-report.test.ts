import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildSettledReport,
	type SettledReportInput,
} from "@/lib/telegram/settled-report";

/**
 * Laporan "EVENT SETTLED" ke grup owner.
 *
 * Fokus test: bagian "Uang keluar saat settle" harus menyebut pengeluarannya
 * APA. Sebelumnya empat baris berturut-turut cuma tertulis "Pengeluaran lain"
 * — owner tidak bisa tahu mana tol, mana konsumsi (kejadian nyata: event BRI —
 * Culture Fest 2026, 22 Agu 2026).
 */

const BASE: SettledReportInput = {
	clientName: "BRI — Culture Fest 2026",
	eventDate: "2026-08-22",
	packageName: "4R Unlimited 4 Jam",
	revenueNet: 3_000_000,
	netProfit: 963_633,
	isLoss: false,
	remainingBalance: 0,
	settlement: {
		hppTotal: 1_576_367,
		opexTotal: 460_000,
		feeCrew: 360_000,
		transportKonsumsi: 0,
		komisi: 100_000,
		sinkingTotal: 196_361,
		ownerPoolTotal: 200_000,
		operatingCash: 567_272,
	},
	manualEntries: [
		{ entryType: "expense", amount: 53_000 },
		{ entryType: "expense", amount: 10_000 },
		{ entryType: "expense", amount: 21_100 },
		{ entryType: "expense", amount: 156_500 },
	],
	postedQueue: [
		{
			kind: "commission_sales",
			amount: 100_000,
			categoryId: null,
			note: null,
			direction: null,
			postedRef: "JE-20260825-899A55DB",
			postError: null,
		},
		{
			kind: "crew_fee",
			amount: 360_000,
			categoryId: null,
			note: null,
			direction: null,
			postedRef: "2 transfer",
			postError: null,
		},
		{
			kind: "expense",
			amount: 53_000,
			categoryId: "toll",
			note: "Toll — BRI — Culture Fest 2026",
			direction: "keluar",
			postedRef: "JE-20260825-143BBA3F",
			postError: null,
		},
		{
			kind: "expense",
			amount: 21_100,
			categoryId: "konsumsi",
			note: "Konsumsi — BRI — Culture Fest 2026",
			direction: "keluar",
			postedRef: "JE-20260825-88881519",
			postError: null,
		},
	],
	detailUrl: null,
};

test("pengeluaran lain disebut namanya, bukan 'Pengeluaran lain' berulang", () => {
	const msg = buildSettledReport(BASE);
	assert.match(msg, /• Toll Rp\s?53\.000/);
	assert.match(msg, /• Konsumsi Rp\s?21\.100/);
	// Tidak boleh ada lagi baris anonim di daftar uang keluar.
	assert.ok(
		!/• Pengeluaran lain Rp/.test(msg),
		"masih ada baris 'Pengeluaran lain' tanpa nama",
	);
});

test("nama klien dibuang dari keterangan — sudah ada di judul", () => {
	const msg = buildSettledReport(BASE);
	assert.ok(
		!/• Toll — BRI/.test(msg),
		"nama klien ikut tercetak di baris pengeluaran",
	);
});

test("tanpa keterangan, jatuh ke nama kategori Catat", () => {
	const msg = buildSettledReport({
		...BASE,
		postedQueue: [
			{
				kind: "expense",
				amount: 75_000,
				categoryId: "toll",
				note: null,
				direction: "keluar",
				postedRef: "x",
				postError: null,
			},
		],
	});
	assert.match(msg, /• Toll \/ e-toll Rp\s?75\.000/);
});

test("tanpa keterangan dan tanpa kategori, pakai label umum", () => {
	const msg = buildSettledReport({
		...BASE,
		postedQueue: [
			{
				kind: "expense",
				amount: 5_000,
				categoryId: null,
				note: null,
				direction: "keluar",
				postedRef: "x",
				postError: null,
			},
		],
	});
	assert.match(msg, /• Pengeluaran lain Rp\s?5\.000/);
});

test("uang masuk tidak nongkrong di bawah judul 'Uang keluar'", () => {
	const msg = buildSettledReport({
		...BASE,
		postedQueue: [
			{
				kind: "expense",
				amount: 250_000,
				categoryId: null,
				note: "Ganti rugi backdrop — BRI",
				direction: "masuk",
				postedRef: "x",
				postError: null,
			},
		],
	});
	const keluar = msg.indexOf("Uang keluar saat settle");
	const masuk = msg.indexOf("Uang masuk saat settle");
	assert.ok(masuk > -1, "bagian uang masuk tidak muncul");
	assert.equal(
		keluar,
		-1,
		"judul uang keluar muncul padahal tak ada yang keluar",
	);
	assert.match(msg, /• Ganti rugi backdrop Rp\s?250\.000/);
});

test("antrian yang gagal diposting tidak ikut dilaporkan sebagai terbayar", () => {
	const msg = buildSettledReport({
		...BASE,
		postedQueue: [
			{
				kind: "expense",
				amount: 99_000,
				categoryId: "toll",
				note: "Toll — X",
				direction: "keluar",
				postedRef: null,
				postError: "saldo tidak cukup",
			},
		],
	});
	assert.ok(!/99\.000/.test(msg), "pengeluaran gagal ikut terhitung");
	assert.match(msg, /1 pembayaran gagal diposting/);
});
