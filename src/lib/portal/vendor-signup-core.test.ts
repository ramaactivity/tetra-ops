import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cleanInstagram,
	normName,
	SignupSchema,
	samePhone,
} from "./vendor-signup-core";

test("nomor sama walau formatnya beda; nomor pendek tidak pernah cocok", () => {
	assert.equal(samePhone("0812-8815-0041", "6281288150041"), true);
	assert.equal(samePhone("+62 812 8815 0041", "081288150041"), true);
	assert.equal(samePhone("081288150042", "081288150041"), false);
	assert.equal(samePhone("1234", "1234"), false);
	assert.equal(samePhone(null, ""), false);
});

test("instagram dibersihkan, isian ngawur jadi null", () => {
	assert.equal(cleanInstagram("@tetra.photo"), "tetra.photo");
	assert.equal(
		cleanInstagram("https://www.instagram.com/tetra.photo/?hl=id"),
		"tetra.photo",
	);
	assert.equal(cleanInstagram("bukan akun ig!"), null);
	assert.equal(cleanInstagram(""), null);
});

test("nama usaha dicocokkan longgar", () => {
	assert.equal(normName("CV. Partner  Organizer"), "partner organizer");
	assert.equal(normName("PT Bunga-Wedding"), "bunga wedding");
});

test("isian daftar: jenis wajib salah satu pilihan", () => {
	const ok = SignupSchema.safeParse({
		nama_usaha: "Bunga WO",
		jenis: "wo",
		nama_pic: "Sari",
		phone: "081234567890",
	});
	assert.equal(ok.success, true);
	const bad = SignupSchema.safeParse({
		nama_usaha: "Bunga WO",
		jenis: "fotografer",
		nama_pic: "Sari",
		phone: "081234567890",
	});
	assert.equal(bad.success, false);
});
