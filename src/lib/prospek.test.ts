import assert from "node:assert/strict";
import { test } from "node:test";
import {
	alasanTolakDmIg,
	kunciProspek,
	labelMerek,
	type Prospek,
	periksaDraf,
	ringkasStatistik,
	sapaHref,
	sapaLinks,
} from "./prospek";

const p: Prospek = {
	id: "11111111-1111-1111-1111-111111111111",
	nama: "PT Contoh",
	email: "hr@contoh.co.id",
	telepon: "0812-3456-7890",
	draf_subjek: "Photobooth gathering akhir tahun",
	draf_pesan: "Halo Tim HR & GA,\nSalam dari Tetra & kawan-kawan?",
};

test("mailto: subjek & isi ter-encode, spasi %20 bukan +", () => {
	const href = sapaHref(p, "email") as string;
	assert.ok(href.startsWith("mailto:hr@contoh.co.id?"));
	assert.ok(!href.includes("+"));
	const q = new URLSearchParams(href.split("?")[1]);
	assert.equal(q.get("subject"), p.draf_subjek);
	assert.equal(q.get("body"), p.draf_pesan);
});

test("wa.me: nomor dinormalkan, teks utuh", () => {
	const href = sapaHref(p, "wa") as string;
	const u = new URL(href);
	assert.equal(u.pathname, "/6281234567890");
	assert.equal(u.searchParams.get("text"), p.draf_pesan);
});

test("tanpa kontak valid → tanpa link", () => {
	const kosong = { ...p, email: "bukan-email", telepon: "92908" };
	assert.equal(sapaHref(kosong, "email"), null);
	assert.deepEqual(sapaLinks(kosong, "https://x.app/"), {
		link_email: null,
		link_wa: null,
	});
	assert.equal(
		sapaLinks(p, "https://x.app/").link_wa,
		`https://x.app/api/s/${p.id}?ke=wa`,
	);
});

test("kunci anti-duplikat: badan hukum & www diabaikan", () => {
	assert.deepEqual(
		kunciProspek("PT Astra International Tbk", "https://www.astra.co.id/about"),
		["n:astrainternational", "d:astra.co.id"],
	);
	assert.deepEqual(kunciProspek("Astra International", null), [
		"n:astrainternational",
	]);
	assert.deepEqual(kunciProspek(null, "astra.co.id"), ["d:astra.co.id"]);
	assert.deepEqual(kunciProspek("PT", "bukan url ::"), []);
});

test("telepon kantor (021) bukan WA", () => {
	assert.equal(sapaHref({ ...p, telepon: "+62 21 29035123" }, "wa"), null);
	assert.equal(sapaHref({ ...p, telepon: "(021) 2903-5123" }, "wa"), null);
	assert.ok(sapaHref({ ...p, telepon: "0812 3456 7890" }, "wa"));
});

test("statistik: per kueri dari catatan, kontak & status dihitung", () => {
	const r = ringkasStatistik([
		{
			segmen: "venue",
			status: "disapa",
			sumber: "web",
			email: "sales@a.id",
			telepon: null,
			catatan:
				"kueri: Gedung Bogor; musim: nikah\nWA dititipkan ke CS Mintet (cmd 1)",
		},
		{
			segmen: "venue",
			status: "kandidat",
			sumber: "web",
			email: null,
			telepon: "021 555",
			catatan: "kueri: gedung bogor",
		},
		{
			segmen: "corporate",
			status: "membalas",
			sumber: "web",
			email: null,
			telepon: "0812 3456 7890",
			catatan: null,
		},
	]);
	assert.equal(r.total, 3);
	assert.equal(r.berkontak, 2);
	assert.equal(r.wa_dititipkan, 1);
	assert.deepEqual(r.per_segmen, { venue: 2, corporate: 1 });
	assert.deepEqual(r.per_kueri["gedung bogor"], {
		total: 2,
		berkontak: 1,
		disapa: 1,
		membalas: 0,
	});
	assert.equal(r.per_kueri["(tanpa kueri)"].membalas, 1);
});

test("periksaDraf: gerbang terakhir sebelum antre", () => {
	const isi = `Halo Bapak/Ibu,\n\n${"Hotel X punya ballroom 1.200 tamu di Kuningan. ".repeat(6)}\n\nSalam,`;
	assert.deepEqual(
		periksaDraf({
			email: "sales@hotelkristal.co.id",
			website: "https://hotelkristal.com",
			subjek: "Vendor photobooth rekanan",
			isi,
		}),
		[],
	);
	assert.deepEqual(
		periksaDraf({
			email: "weddings@ayanajakarta.com",
			website: "https://ayana.com/jakarta",
			subjek: "Kerja sama photobooth",
			isi,
		}),
		[],
	);
	assert.deepEqual(
		periksaDraf({
			email: "x@gmail.com",
			website: "jevahrewedding.com",
			subjek: "Kerja sama",
			isi,
		}),
		[],
	);
	const s = periksaDraf({
		email: "corsec@bankmaspion.co.id",
		website: "ccb.com",
		subjek: "Uji",
		isi: isi.replace("punya", "ternama punya"),
	});
	assert.ok(
		s.some((x) => x.includes("pujian")) &&
			s.some((x) => x.includes("bukan domain")),
	);
	assert.ok(
		periksaDraf({
			email: "helpdesk@a.co.id",
			website: "a.co.id",
			subjek: "Uji",
			isi,
		}).includes("email layanan pelanggan"),
	);
	assert.ok(
		periksaDraf({
			email: "hr@a.co.id",
			website: "a.co.id",
			subjek: "Uji",
			isi: `${isi}\nRama`,
		}).some((x) => x.includes("Salam")),
	);
	assert.deepEqual(
		periksaDraf({
			isi: "Halo Bapak/Ibu, saya Rama dari Tetra Photobooth, ingin berkenalan.",
		}),
		[],
	);
	assert.equal(labelMerek("a@mail.daikin.co.id"), "daikin");
	assert.ok(
		periksaDraf({
			email: "hukum@katedraljakarta.or.id",
			website: "katedraljakarta.or.id",
			subjek: "Uji",
			isi,
		}).some((x) => x.includes("salah sasaran")),
	);
	assert.deepEqual(
		periksaDraf({
			email: "hr@a.co.id",
			website: "a.co.id",
			subjek: "Uji",
			isi,
		}),
		[],
	);
});

test("rem DM IG: jam WIB, Minggu, kuota, blokir 48 jam, sekali per orang", () => {
	// 2026-10-02 Jumat 10.00 WIB = 03.00 UTC
	const jumatPagi = new Date("2026-10-02T03:00:00Z");
	const dasar = {
		sekarang: jumatPagi,
		status: "kandidat",
		terkirimHariIni: 0,
		blokirTerakhir: null,
	};
	assert.equal(alasanTolakDmIg(dasar), null);
	assert.match(
		alasanTolakDmIg({ ...dasar, status: "disapa" }) ?? "",
		/bukan kandidat/,
	);
	assert.match(
		alasanTolakDmIg({ ...dasar, terkirimHariIni: 10 }) ?? "",
		/kuota/,
	);
	assert.equal(alasanTolakDmIg({ ...dasar, terkirimHariIni: 9 }), null);
	// 19.30 WIB dan 08.30 WIB ditolak
	assert.match(
		alasanTolakDmIg({ ...dasar, sekarang: new Date("2026-10-02T12:30:00Z") }) ??
			"",
		/jam kirim/,
	);
	assert.match(
		alasanTolakDmIg({ ...dasar, sekarang: new Date("2026-10-02T01:30:00Z") }) ??
			"",
		/jam kirim/,
	);
	// Minggu 4 Okt 10.00 WIB
	assert.match(
		alasanTolakDmIg({ ...dasar, sekarang: new Date("2026-10-04T03:00:00Z") }) ??
			"",
		/jam kirim/,
	);
	const blokir = new Date(jumatPagi.getTime() - 47 * 3_600_000);
	assert.match(
		alasanTolakDmIg({ ...dasar, blokirTerakhir: blokir }) ?? "",
		/memblokir/,
	);
	assert.equal(
		alasanTolakDmIg({
			...dasar,
			blokirTerakhir: new Date(jumatPagi.getTime() - 49 * 3_600_000),
		}),
		null,
	);
	// vendor maksimal 5/hari; peminat tetap boleh sampai kuota total
	assert.match(
		alasanTolakDmIg({
			...dasar,
			vendor: true,
			terkirimVendorHariIni: 5,
			terkirimHariIni: 5,
		}) ?? "",
		/vendor/,
	);
	assert.equal(
		alasanTolakDmIg({ ...dasar, terkirimVendorHariIni: 5, terkirimHariIni: 5 }),
		null,
	);
	assert.equal(
		alasanTolakDmIg({ ...dasar, vendor: true, terkirimVendorHariIni: 4 }),
		null,
	);
	// mulai 15.00 WIB (08.00 UTC) vendor boleh memakai sisa kuota total
	const sore = new Date("2026-10-02T08:30:00Z");
	assert.equal(
		alasanTolakDmIg({
			...dasar,
			sekarang: sore,
			vendor: true,
			terkirimVendorHariIni: 7,
			terkirimHariIni: 7,
		}),
		null,
	);
	assert.match(
		alasanTolakDmIg({
			...dasar,
			sekarang: sore,
			vendor: true,
			terkirimVendorHariIni: 10,
			terkirimHariIni: 10,
		}) ?? "",
		/kuota DM hari ini habis/,
	);
});
