import assert from "node:assert/strict";
import { test } from "node:test";
import {
	composeKlien,
	composePic,
	composeWo,
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

test("teks klien vs WO; kedaluwarsa opsional", () => {
	const k = composeKlien({
		panggilan: "Rafi & Dinda",
		category: "wedding",
		nama: null,
		galleryUrl: "https://g/1",
		expiresAt: "2027-01-10T00:00:00+07:00",
	});
	assert.match(k, /^Halo Kak Rafi & Dinda 👋/);
	assert.match(k, /untuk hari bahagia kalian hari ini\./);
	// Tanpa doa/penutup kaku dan emoji maks 1 (usulan CS Mintet #47, Rama 11 Nov).
	assert.doesNotMatch(k + "\n", /semoga|selamat|sukses selalu/i);
	assert.equal((k.match(/\p{Extended_Pictographic}/gu) || []).length, 1);
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
	assert.match(tanpa, /Disimpan dulu ya\.$/);
	assert.doesNotMatch(tanpa, /semoga|sukses/i);
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

test("pengingat galeri mau habis: H-7 & H-1 sekali sehari di jam 10–20, teks & penerima", async () => {
	const { expiryKind, composeExpiry, lastActiveDay } = await import(
		"./gallery-thanks"
	);
	// Booth: aktif sampai 2027-01-07T17:00Z = 8 Jan 00.00 WIB → hari terakhir 7 Jan.
	const exp = "2027-01-07T17:00:00+00:00";
	assert.equal(lastActiveDay(exp), "2027-01-07");
	assert.equal(expiryKind(exp, wib("2026-12-31T10:00:00")), "galeri_h7");
	assert.equal(
		expiryKind(exp, wib("2026-12-31T09:59:00")),
		null,
		"sebelum 10.00",
	);
	assert.equal(
		expiryKind(exp, wib("2026-12-31T20:00:00")),
		null,
		"lewat 20.00",
	);
	assert.equal(expiryKind(exp, wib("2027-01-06T15:00:00")), "galeri_h1");
	for (const d of ["2026-12-30", "2027-01-01", "2027-01-05", "2027-01-07"])
		assert.equal(
			expiryKind(exp, wib(`${d}T12:00:00`)),
			null,
			`bukan hari kirim: ${d}`,
		);
	const h7 = composeExpiry({
		kind: "galeri_h7",
		panggilan: "Rafi & Dinda",
		judul: "Rafi & Dinda",
		url: "https://booth/g/x",
		expiresAt: exp,
	});
	assert.equal(
		h7,
		"Halo Kak Rafi & Dinda, mau ngingetin aja, galeri foto photobooth Rafi & Dinda aktif sampai 7 Jan. Kalau belum sempat, download dulu ya biar fotonya aman 🙏\nhttps://booth/g/x",
	);
	const h1 = composeExpiry({
		kind: "galeri_h1",
		panggilan: "Teh Puput",
		judul: "X",
		url: "u",
		expiresAt: exp,
	});
	assert.match(
		h1,
		/^Teh Puput, galeri foto photobooth X tinggal sampai besok ya/,
	);
	assert.doesNotMatch(h7 + h1, /semoga|selamat/i);
	// Penerima pengingat: hanya jenis klien — nomor WO (walau juga PIC/klien) tidak ikut.
	const list = penerima([
		{ phone: "085791995465", nama: "Teh Puput", jenis: "wo" },
		{ phone: "6285791995465", nama: "Puput", jenis: "klien" },
		{ phone: "08123456789", nama: "Rafi", jenis: "klien" },
	]).filter((p) => p.jenis === "klien");
	assert.deepEqual(
		list.map((p) => p.phone),
		["628123456789"],
	);
});

test("pengingat galeri versi WO (event tanpa nomor klien)", async () => {
	const { composeExpiry } = await import("./gallery-thanks");
	const exp = "2027-01-07T17:00:00+00:00";
	assert.equal(
		composeExpiry({
			wo: true,
			kind: "galeri_h7",
			panggilan: "Teh Puput",
			judul: "Rafi & Dinda",
			url: "u",
			expiresAt: exp,
		}),
		"Halo Teh Puput, mau ngingetin aja, galeri foto photobooth Rafi & Dinda aktif sampai 7 Jan. Kalau kliennya belum sempat download, boleh tolong diingetin ya 🙏\nu",
	);
	assert.match(
		composeExpiry({
			wo: true,
			kind: "galeri_h1",
			panggilan: "Firda",
			judul: "X",
			url: "u",
			expiresAt: exp,
		}),
		/^Kak Firda, galeri foto photobooth X tinggal sampai besok ya\. Kalau kliennya belum sempat download, boleh tolong diingetin ya 🙏/,
	);
});

test("PIC hari H (venue/EO) dapat teks PIC, bukan ucapan pengantin; nomor sama dengan klien tetap klien", () => {
	const l = penerima([
		{
			phone: "085173172514",
			nama: "Yusro Iqbal Fathoni & Indri Rahma",
			jenis: "klien",
		},
		{ phone: "081992543208", nama: "Ibu April", jenis: "pic" },
		{ phone: "6285173172514", nama: "Indri", jenis: "pic" },
	]);
	assert.deepEqual(
		l.map((p) => [p.phone, p.jenis]),
		[
			["6285173172514", "klien"],
			["6281992543208", "pic"],
		],
	);
	const w = composePic({
		nama: "Ibu April",
		judul: "Ngunduh Mantu",
		category: "wedding",
		galleryUrl: "https://x/g/a",
	});
	assert.match(
		w,
		/^Halo Ibu April 👋 terima kasih sudah bantu koordinasi di acara Ngunduh Mantu hari ini\./,
	);
	assert.match(w, /diteruskan ke kedua mempelai ya: https:\/\/x\/g\/a$/);
	assert.doesNotMatch(w, /hari bahagia|kalian/);
	const c = composePic({
		nama: "Pak Dimas",
		judul: "Gathering PT BIPO",
		category: "corporate",
		galleryUrl: "https://x/g/b",
	});
	assert.match(c, /dibagikan ke peserta & tim ya/);
	assert.doesNotMatch(c, /mempelai|keluarga/);
	// Teks klien event kantor tidak menyuruh "bagikan ke keluarga".
	const k = composeKlien({
		panggilan: "Bu Ani",
		category: "corporate",
		nama: "PT BIPO",
		galleryUrl: "https://x",
		expiresAt: null,
	});
	assert.match(k, /bagikan ke peserta & tim\./);
	assert.doesNotMatch(k, /hari bahagia|keluarga/);
});
