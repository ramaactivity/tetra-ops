import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cocokkanKontak,
	KontakUsulanSchema,
	kunciKontak,
	tanggalDiNama,
	tokens,
} from "./core";

const shella = {
	id: "e1",
	project_id: "PRJ-20261226-3246",
	client_name: "Shella Indah & Alfian Fauzi",
	event_date: "2026-12-05",
	booker: "Ariyo",
};
const lain = {
	id: "e2",
	project_id: "PRJ-20261226-0001",
	client_name: "Natal PT Framas Indonesia",
	event_date: "2026-12-26",
	vendor_name: "Siska Rivera WO",
};

test("Shella: nama cocok walau tanggal di kontak sudah basi", () => {
	const k = cocokkanKontak(
		{ nama_kontak: "Shella & Alfian 26 Des 2026", nama_wa: "shellaindah" },
		[lain, shella],
	);
	assert.equal(k.length, 1);
	assert.equal(k[0].project_id, "PRJ-20261226-3246");
	assert.ok(k[0].alasan.some((a) => a.startsWith("nama klien")));
});

test("tanggal cocok menambah skor; tanggal saja bukan kandidat", () => {
	const k = cocokkanKontak({ nama_kontak: "Budi 26 Des 2026", nama_wa: null }, [
		lain,
	]);
	assert.equal(k.length, 0);
	const w = cocokkanKontak(
		{ nama_kontak: "Siska Rivera 26 Des 2026", nama_wa: null },
		[lain],
	);
	assert.equal(w[0].skor, 2 + 2);
	assert.ok(w[0].alasan.includes("tanggal di nama kontak sama"));
});

test("pemesan mirip satu huruf (Ario ↔ Ariyo); kata umum diabaikan", () => {
	const k = cocokkanKontak(
		{ nama_kontak: "Seles wedding Service Ario", nama_wa: null },
		[shella],
	);
	assert.equal(k[0]?.project_id, "PRJ-20261226-3246");
	assert.deepEqual(tokens("Kak Wedding Service WO"), []);
});

test("tanggal di nama kontak", () => {
	assert.deepEqual(tanggalDiNama("Shella 26 Des 2026"), {
		d: 26,
		m: 12,
		y: 2026,
	});
	assert.deepEqual(tanggalDiNama("Rina 5/12"), { d: 5, m: 12, y: null });
	assert.equal(tanggalDiNama("Rina"), null);
});

test("kunci & body: nomor atau wa_jid wajib", () => {
	assert.equal(
		kunciKontak({ nomor: "6281216764696", wa_jid: null }),
		"216764696",
	);
	assert.equal(kunciKontak({ nomor: null, wa_jid: "1@lid" }), "jid:1@lid");
	assert.equal(
		KontakUsulanSchema.safeParse({ alasan: "mengaku_booking" }).success,
		false,
	);
	const ok = KontakUsulanSchema.parse({
		nomor: "+62 812-1676-4696",
		alasan: "nama_kontak_cocok",
	});
	assert.equal(ok.nomor, "6281216764696");
});
