/**
 * Draft bukti DP (DR-055): syarat ketat konfirmasi otomatis, cocok rekening,
 * kirim ulang idempoten. Kasus nyata Yessi 19 Nov. Jalankan: `pnpm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	autoConfirmGates,
	BotDraftSchema,
	type DraftContext,
	type DraftRow,
	matchBankAccount,
	planDraftUpsert,
} from "./core";

const banks = [
	{ id: "bca", account_number: "0954965224" },
	{ id: "kas", account_number: null },
];
const ctx: DraftContext = {
	banks,
	sisa: 2_700_000,
	duplicate: false,
	target: { booking_inbox_id: "b1", document_id: "inv34", event_id: null },
	now: "2026-11-19T01:34:00Z",
};
const yessi = BotDraftSchema.parse({
	pesan_id_wa: "wamid.ABC",
	client_wa: "+62 812-9811-6793",
	wa_jid: "144439901184133@lid",
	nama_klien: "Yessi",
	nominal: 700000,
	nama_pengirim: "AGRET ANGGRAINI",
	bank_pengirim: "Mandiri",
	bank_tujuan: "BCA 0954965224 a.n. MUHAMAD RAMADAN SAPUTRA",
	waktu_transfer: "2026-11-19T08:29:00+07:00",
	confidence: 0.93,
	sumber: "client_only",
});

test("rekening tujuan: nomor utuh cocok, nomor tersamar tidak", () => {
	assert.equal(matchBankAccount("BCA 0954965224", banks), "bca");
	assert.equal(matchBankAccount("BCA ****5224", banks), null);
	assert.equal(matchBankAccount(null, banks), null);
});

test("syarat ketat: semua lolos = kosong; tiap syarat bisa gagal", () => {
	const ok = {
		nominal: 700000,
		bankMatched: true,
		sisa: 2_700_000,
		confidence: 0.9,
	};
	assert.deepEqual(autoConfirmGates(ok), []);
	assert.equal(autoConfirmGates({ ...ok, nominal: null }).length, 1);
	assert.equal(autoConfirmGates({ ...ok, bankMatched: false }).length, 1);
	assert.match(autoConfirmGates({ ...ok, sisa: 500_000 })[0], /melebihi sisa/);
	assert.match(autoConfirmGates({ ...ok, sisa: null })[0], /tidak ditemukan/);
	assert.match(autoConfirmGates({ ...ok, confidence: 0.6 })[0], /kurang yakin/);
	assert.match(autoConfirmGates({ ...ok, duplicate: true })[0], /dobel/);
});

test("nominal 0 dari bot = tidak terbaca (null), nomor HP jadi digit", () => {
	const b = BotDraftSchema.parse({
		pesan_id_wa: "x1x",
		sumber: "client_only",
		nominal: 0,
	});
	assert.equal(b.nominal, null);
	assert.equal(yessi.client_wa, "6281298116793");
});

test("bukti dari klien saja → menunggu walau semua syarat lolos", () => {
	const p = planDraftUpsert(null, yessi, ctx);
	assert.equal(p.action, "insert");
	assert.equal(p.action === "insert" && p.row.status, "menunggu");
	assert.equal(p.action === "insert" && p.row.bank_account_id, "bca");
	assert.deepEqual(p.gates, []);
});

const row = (over: Partial<DraftRow> = {}): DraftRow =>
	({
		id: "d1",
		pesan_id_wa: "wamid.ABC",
		status: "menunggu",
		sumber: "client_only",
		booking_inbox_id: "b1",
		document_id: "inv34",
		event_id: null,
		payment_id: null,
		bank_account_id: "bca",
		bukti_file_id: null,
		bukti_url: null,
		gerbang: [],
		disetujui_at: null,
		disetujui_via: null,
		catatan_posting: null,
		created_at: "t",
		updated_at: "t",
		client_wa: "6281298116793",
		wa_jid: null,
		nama_klien: "Yessi",
		invoice_no: null,
		nominal: 700000,
		nama_pengirim: "AGRET ANGGRAINI",
		bank_pengirim: null,
		bank_tujuan: "BCA 0954965224",
		waktu_transfer: null,
		waktu_pesan: null,
		confidence: 0.93,
		teks_mentah: null,
		...over,
	}) as DraftRow;

test("admin konfirmasi di WA (kirim ulang, syarat lolos) → disetujui via admin_wa", () => {
	const p = planDraftUpsert(
		row(),
		{ ...yessi, sumber: "admin_wa", auto_confirm: true },
		ctx,
	);
	assert.equal(p.action, "update");
	if (p.action !== "update") return;
	assert.equal(p.patch.status, "disetujui");
	assert.equal(p.patch.disetujui_via, "admin_wa");
	assert.equal(p.patch.sumber, "admin_wa");
});

test("admin konfirmasi tapi syarat gagal → tetap menunggu + alasan tersimpan", () => {
	const p = planDraftUpsert(
		row({ confidence: 0.5 }),
		{ ...yessi, sumber: "admin_wa", auto_confirm: true },
		ctx,
	);
	if (p.action !== "update") throw new Error("harus update");
	assert.equal(p.patch.status, undefined);
	assert.deepEqual(p.patch.gerbang, ["bacaan AI kurang yakin"]);
});

test("koreksi Rama tidak ditimpa kiriman ulang bot", () => {
	const p = planDraftUpsert(
		row({ nominal: 750000, nama_pengirim: "AGRET A." }),
		{ ...yessi, nominal: 700000 },
		ctx,
	);
	if (p.action !== "update") throw new Error("harus update");
	assert.equal(p.patch.nominal, 750000);
	assert.equal(p.patch.nama_pengirim, "AGRET A.");
});

test("tercatat / dibatalkan tidak berubah oleh kiriman ulang", () => {
	for (const status of ["tercatat", "dibatalkan"] as const)
		assert.equal(
			planDraftUpsert(
				row({ status }),
				{ ...yessi, sumber: "admin_wa", auto_confirm: true },
				ctx,
			).action,
			"ignore",
		);
});

test("bukti dobel (nominal sama 24 jam) tidak lolos konfirmasi otomatis", () => {
	const p = planDraftUpsert(
		row(),
		{ ...yessi, sumber: "admin_wa", auto_confirm: true },
		{ ...ctx, duplicate: true },
	);
	if (p.action !== "update") throw new Error("harus update");
	assert.equal(p.patch.status, undefined);
	assert.match(p.patch.gerbang?.[0] ?? "", /dobel/);
});

test("kirim ulang tanpa gambar/isian tidak menghapus yang tersimpan", () => {
	const p = planDraftUpsert(
		row({ bank_pengirim: "Mandiri", teks_mentah: "BI Fast 700.000" }),
		BotDraftSchema.parse({
			pesan_id_wa: "wamid.ABC",
			sumber: "admin_wa",
			auto_confirm: true,
		}),
		ctx,
	);
	if (p.action !== "update") throw new Error("harus update");
	assert.equal(p.patch.nominal, 700000);
	assert.equal(p.patch.bank_pengirim, "Mandiri");
	assert.equal(p.patch.teks_mentah, "BI Fast 700.000");
	assert.equal(p.patch.status, "disetujui");
});
