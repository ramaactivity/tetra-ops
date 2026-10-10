import assert from "node:assert/strict";
import { test } from "node:test";
import { potongFee, ringkasUangJalan, saldoUangJalan } from "./uang-jalan";

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
