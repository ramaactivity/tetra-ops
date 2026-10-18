import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isiSisa,
	potongFee,
	rincianTerbuka,
	ringkasUangJalan,
	saldoTalanganOwner,
	saldoUangJalan,
	type TalanganRow,
	uraiPelunasan,
} from "./uang-jalan";

test("contoh owner: uang jalan 200, terpakai 150, fee 150 → transfer 100", () => {
	const saldo = saldoUangJalan([{ kind: "beri", amount: 200_000 }]);
	const total = 150_000 /* fee */ + 150_000; /* reimbursement */
	const potong = potongFee({
		saldo,
		total,
		reimbursement: 150_000,
		sisa: "potong_fee",
	});
	assert.equal(potong, 200_000);
	assert.equal(total - potong, 100_000);
	assert.deepEqual(ringkasUangJalan(200_000, 150_000), {
		terima: 200_000,
		dipakai: 150_000,
		sisa: 50_000,
		kurang: 0,
	});
});

test("sisa dikembalikan: hanya bagian terpakai yang dipotong", () => {
	const p = potongFee({
		saldo: 200_000,
		total: 300_000,
		reimbursement: 150_000,
		sisa: "kembalikan",
	});
	assert.equal(p, 150_000); // 50rb sisa ditunggu dikembalikan
	// setelah sisa diterima owner, saldo tinggal 150rb → sama saja
	const saldo = saldoUangJalan([
		{ kind: "beri", amount: 200_000 },
		{ kind: "kembali", amount: 50_000 },
	]);
	assert.equal(
		potongFee({
			saldo,
			total: 300_000,
			reimbursement: 150_000,
			sisa: "kembalikan",
		}),
		150_000,
	);
});

test("pengeluaran lebih besar dari uang jalan: kekurangan ikut dibayar", () => {
	// uang jalan 200, terpakai 250, fee 150 → total 400, potong 200, transfer 200
	assert.equal(
		potongFee({
			saldo: 200_000,
			total: 400_000,
			reimbursement: 250_000,
			sisa: null,
		}),
		200_000,
	);
	assert.equal(ringkasUangJalan(200_000, 250_000).kurang, 50_000);
});

test("uang jalan lebih besar dari fee + reimbursement: potong maksimal sebesar yang dibayar", () => {
	assert.equal(
		potongFee({
			saldo: 500_000,
			total: 300_000,
			reimbursement: 50_000,
			sisa: "potong_fee",
		}),
		300_000,
	);
});

test("saldo: pembatalan diabaikan, potong_fee mengurangi", () => {
	assert.equal(
		saldoUangJalan([
			{ kind: "beri", amount: 200_000 },
			{ kind: "beri", amount: 100_000, is_reversed: true },
			{ kind: "potong_fee", amount: 120_000 },
		]),
		80_000,
	);
	assert.equal(
		potongFee({ saldo: 0, total: 300_000, reimbursement: 0, sisa: null }),
		0,
	);
});

test("pakai (pengeluaran dibayar uang jalan) mengurangi saldo yang dipegang crew", () => {
	// Kasus Rafi & Dinda: diberi 150, transport 82 + konsumsi 15 dari uang jalan, sisa 53 dikembalikan.
	assert.equal(
		saldoUangJalan([
			{ kind: "beri", amount: 150_000 },
			{ kind: "pakai", amount: 82_000 },
			{ kind: "pakai", amount: 15_000 },
			{ kind: "kembali", amount: 53_000 },
		]),
		0,
	);
});

test("talangan owner: transfer berkali-kali, dicicil, sisa balik ke owner, batal tidak dihitung", () => {
	const t = (o: Partial<TalanganRow>): TalanganRow => ({
		kind: "beri",
		amount: 100_000,
		account_code: "2-310",
		owner_id: "adit",
		...o,
	});
	const m = saldoTalanganOwner(
		[
			t({}),
			t({ amount: 50_000, admin_fee: 2_500 }), // minta lagi di jalan, beda bank
			t({ kind: "kembali", amount: 30_000 }),
			t({ owner_id: "fahmi", amount: 75_000 }),
			t({ owner_id: "fahmi", is_reversed: true }),
			t({ account_code: "1-110", owner_id: "rama" }), // rekening Tetra
			t({ owner_id: "iqbal", kind: "kembali", amount: 40_000 }), // sisa dipegang Iqbal
		],
		[
			{ owner_id: "adit", direction: "bayar", amount: 20_000 }, // cicil
			{ owner_id: "fahmi", direction: "bayar", amount: 75_000 },
			{ owner_id: "iqbal", direction: "terima", amount: 10_000 },
			{ owner_id: "fahmi", direction: "talangan", amount: 88_000 }, // konsumsi dibayar Fahmi
			{ owner_id: "iqbal", direction: "piutang", amount: 5_000 }, // Iqbal pinjam uang Tetra
			{
				owner_id: "adit",
				direction: "bayar",
				amount: 99_000,
				is_reversed: true,
			},
		],
	);
	assert.equal(m.get("adit"), 102_500);
	assert.equal(m.get("fahmi"), 88_000);
	assert.equal(m.get("iqbal"), -35_000); // Iqbal masih berutang ke Tetra
	assert.equal(m.has("rama"), false);
});

test("bagi uang jalan: baris yang belum diketik otomatis terisi sisa laporan crew", () => {
	const r = (amount: string, touched: boolean) => ({ amount, touched });
	assert.deepEqual(
		isiSisa([r("75000", true), r("", false)], 105_000)[1],
		r("30000", false),
	);
	// sudah pas/lebih → kosong; tanpa laporan atau 2 baris otomatis → tidak diubah
	assert.equal(
		isiSisa([r("110000", true), r("9", false)], 105_000)[1].amount,
		"",
	);
	assert.equal(isiSisa([r("1", true), r("9", false)], 0)[1].amount, "9");
	assert.equal(isiSisa([r("1", false), r("9", false)], 100)[1].amount, "9");
});

test("rincian hutang owner: dilunasi yang paling lama dulu, keterangan pelunasan menyebut itemnya", () => {
	const items = [
		{ label: "Konsumsi — CIMB", date: "2026-10-16", amount: 88_000 },
		{
			label: "Uang jalan Fahmi — Kak Echi",
			date: "2026-10-15",
			amount: 75_000,
		},
		{ label: "Bensin — CIMB", date: "2026-10-16", amount: 100_000 },
	];
	const open = rincianTerbuka(items, 80_000);
	assert.deepEqual(
		open.map((o) => [o.label, o.sisa]),
		[
			["Konsumsi — CIMB", 83_000],
			["Bensin — CIMB", 100_000],
		],
	);
	const urai = uraiPelunasan(open, 120_000);
	assert.equal(
		urai,
		"16 Okt · Konsumsi — CIMB 83.000; 16 Okt · Bensin — CIMB 37.000 sebagian",
	);
	assert.equal(rincianTerbuka(items, 999_999).length, 0);
});
