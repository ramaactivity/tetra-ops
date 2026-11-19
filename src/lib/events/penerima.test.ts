import assert from "node:assert/strict";
import { test } from "node:test";
import { penerimaKelengkapan } from "./penerima";

test("event lewat WO: WO dulu, nomor kembar sekali saja", () => {
	const p = penerimaKelengkapan({
		channel: "vendor",
		client_name: "Sultan & Naadiyah",
		client_wa: "0812-1111-2222",
		vendor_name: "Partner Organizer",
		vendor_pic_name: "Nisa",
		vendor_contact: "081233334444",
		booker_contact: { name: "Nisa", phone: "6281233334444" },
		pic_contact: [{ name: "Nisa", phone: "+62 812-3333-4444" }],
	});
	assert.deepEqual(
		p.map((x) => [x.peran, x.nama, x.nomor]),
		[
			["wo", "Nisa · Partner Organizer", "6281233334444"],
			["klien", "Sultan & Naadiyah", "6281211112222"],
		],
	);
});

test("event langsung: pemesan = klien tampil sebagai Klien; pemesan lain didahulukan", () => {
	const sama = penerimaKelengkapan({
		channel: "direct",
		client_name: "Guntur & Sheila",
		client_wa: "081255556666",
		booker_contact: { name: "Guntur & Sheila", phone: "6281255556666" },
	});
	assert.deepEqual(
		sama.map((x) => x.peran),
		["klien"],
	);
	const beda = penerimaKelengkapan({
		channel: "direct",
		client_name: "Shella & Alfian",
		client_wa: "081277778888",
		booker_contact: { name: "Ariyo", phone: "081299990000" },
		pic_wa: "02112345", // bukan nomor HP → dilewati
	});
	assert.deepEqual(
		beda.map((x) => x.peran),
		["pemesan", "klien"],
	);
});
