import assert from "node:assert/strict";
import { test } from "node:test";
import {
	composeKlien,
	composeWo,
	doaFor,
	galleryWindow,
	penerima,
} from "./gallery-thanks";

const wib = (iso: string) => Date.parse(`${iso}+07:00`);
const at = (ms: number) =>
	new Date(ms + 7 * 3600_000).toISOString().slice(11, 16);

test("jam kirim: max(17.00, selesai+60'); malam tetap malam itu", () => {
	assert.equal(
		at(galleryWindow("2026-10-10", wib("2026-10-10T13:00:00")).sendAt),
		"17:00",
	);
	assert.equal(
		at(galleryWindow("2026-10-10", wib("2026-10-10T19:00:00")).sendAt),
		"20:00",
	);
	const malam = galleryWindow("2026-10-10", wib("2026-10-10T22:00:00"));
	assert.equal(at(malam.sendAt), "23:00");
	assert.equal(at(malam.deadline), "02:00"); // selesai + 4 jam
	// acara pagi: batas coba ulang minimal 2 jam setelah jam kirim
	assert.equal(
		at(galleryWindow("2026-10-10", wib("2026-10-10T11:00:00")).deadline),
		"19:00",
	);
});

test("doa sesuai jenis acara", () => {
	assert.match(doaFor("wedding", null), /hidup baru/);
	assert.match(doaFor("engagement", null), /pertunangannya/);
	assert.match(doaFor("birthday", "Nadia"), /ulang tahun untuk Nadia/);
	assert.match(doaFor("gathering", "PT Maju"), /seluruh tim .* PT Maju/);
	assert.match(doaFor("instansi", null), /seluruh tim/);
	assert.match(doaFor("wisuda", null), /kelulusannya/);
	assert.match(doaFor(null, null), /kenangan yang indah/);
});

test("teks klien vs WO; kedaluwarsa opsional", () => {
	const k = composeKlien({
		panggilan: "Rafi & Dinda",
		category: "wedding",
		nama: null,
		galleryUrl: "https://g/1",
		expiresAt: "2027-01-10T00:00:00+07:00",
	});
	assert.match(k, /^Halo Kak Rafi & Dinda 👋/);
	assert.match(k, /hari bahagia kalian hari ini\. Selamat menempuh hidup baru/);
	assert.match(k, /https:\/\/g\/1/);
	assert.match(k, /aktif sampai 10 Januari 2027/);
	const tanpa = composeKlien({
		panggilan: null,
		category: "corporate",
		nama: "PT Maju",
		galleryUrl: "https://g/1",
		expiresAt: null,
	});
	assert.match(tanpa, /^Halo Kak 👋/);
	assert.match(tanpa, /untuk acaranya hari ini/);
	assert.match(tanpa, /Jangan lupa disimpan ya 😊$/);
	const w = composeWo({
		nama: "Puput",
		judul: "Rafi & Dinda",
		galleryUrl: "https://g/1",
	});
	assert.match(
		w,
		/^Halo Kak Puput 👋 terima kasih sudah kerja bareng Tetra di acara Rafi & Dinda/,
	);
	assert.match(w, /boleh diteruskan ke klien/);
	assert.notEqual(w, k);
});

test("penerima: dedupe nomor, nomor WO selalu dapat teks WO, nomor kantor dibuang", () => {
	const l = penerima([
		{ phone: "085791995465", nama: "Teh Puput", jenis: "wo" },
		{ phone: "08123456789", nama: "Rafi & Dinda", jenis: "klien" },
		{ phone: "+62 812-3456-789", nama: "Rafi", jenis: "klien" },
		{ phone: "6285791995465", nama: "Puput (PIC)", jenis: "klien" },
		{ phone: "0251-123456", nama: "Kantor", jenis: "klien" },
		{ phone: null, nama: "x", jenis: "klien" },
	]);
	assert.deepEqual(
		l.map((p) => [p.phone, p.jenis, p.nama]),
		[
			["6285791995465", "wo", "Teh Puput"],
			["628123456789", "klien", "Rafi & Dinda"],
		],
	);
});

test("sapaan tidak dobel", async () => {
	const { sapa } = await import("./gallery-thanks");
	assert.equal(sapa("Teh Puput"), "Teh Puput");
	assert.equal(sapa("Bu Rina"), "Bu Rina");
	assert.equal(sapa("Firda"), "Kak Firda");
	assert.equal(sapa(null), "Kak");
	assert.match(
		composeWo({ nama: "Teh Puput", judul: "X", galleryUrl: "u" }),
		/^Halo Teh Puput 👋/,
	);
});
