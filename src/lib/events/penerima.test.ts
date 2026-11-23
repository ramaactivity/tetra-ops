import assert from "node:assert/strict";
import { test } from "node:test";
import { cocokNomor, penerimaKelengkapan } from "./penerima";

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

test("cocokNomor: WO didahulukan di event vendor; pemesan & PIC cadangan ikut", () => {
	const wo = {
		channel: "vendor",
		client_wa: "081211112222",
		vendor_contact: "081233334444",
		booker_contact: { phone: "6281233334444" },
		pic_wa: "081233334444",
	};
	assert.equal(cocokNomor(wo, "233334444"), "vendor");
	assert.equal(cocokNomor(wo, "211112222"), "client_wa");
	const langsung = {
		channel: "direct",
		client_wa: "8131313944",
		booker_contact: [{ phone: "08131313944" }],
		extra_pics: [{ name: "Shella", wa: "0812-1676-4696" }],
	};
	assert.equal(cocokNomor(langsung, "216764696"), "extra_pic");
	assert.equal(
		cocokNomor({ ...langsung, client_wa: null }, "131313944"),
		"pemesan",
	);
	assert.equal(cocokNomor(langsung, "999999999"), null);
	assert.equal(cocokNomor(langsung, "12"), null);
});
