/** State machine booking v4. Jalankan: `pnpm test`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	bar,
	blankDraft,
	type Draft,
	dig,
	isMaps,
	nextScreen,
	prevScreen,
	seq,
	waFmt,
} from "./logic";

const base = (o: Partial<Draft> = {}): Draft => ({
	...blankDraft({ y: 2026, m: 9, d: 7 }),
	...o,
});
const ctx = {
	editing: false,
	offline: false,
	busy: false,
	durPrice: null,
	addSum: 0,
	sending: false,
	otpOk: false,
};

test("nomor WA: semua bentuk dinormalisasi, tampil 812 3456 7890", () => {
	for (const v of [
		"081234567890",
		"+62 812-3456-7890",
		"6281234567890",
		"81234567890",
	])
		assert.equal(dig(v), "81234567890");
	assert.equal(waFmt("81234567890"), "812 3456 7890");
});

test("link Maps: hanya link Google Maps yang diterima", () => {
	assert.ok(isMaps("https://maps.app.goo.gl/Xy7k"));
	assert.ok(isMaps("https://www.google.co.id/maps/place/x"));
	assert.ok(!isMaps("Gedung Kirana Bogor"));
});

test("urutan: paket bercetak lewat format, tanpa cetak lewat backdrop, OTP dilewati kalau sudah terverifikasi", () => {
	const s = base({ wa: "812 3456 7890", waVerified: "81234567890" });
	assert.ok(seq(s, true).includes("fmt") && !seq(s, true).includes("backdrop"));
	assert.ok(
		seq(s, false).includes("backdrop") && !seq(s, false).includes("fmt"),
	);
	assert.ok(!seq(s, true).includes("otp"));
	assert.ok(seq(base({ wa: "812 3456 7890" }), true).includes("otp"));
	assert.equal(
		nextScreen({ ...s, screen: "contact" }, true, false).screen,
		"dash",
	);
	assert.equal(prevScreen({ ...s, screen: "type" }, true, false), "intro");
});

test("mode edit: ganti paket lanjut ke durasi lalu format, sisanya balik ke ringkasan", () => {
	const s = base({ screen: "pkg", pkg: "photobooth_classic" });
	assert.equal(nextScreen(s, true, true).screen, "dur");
	assert.equal(
		nextScreen({ ...s, screen: "dur", dur: 2 }, true, true).screen,
		"fmt",
	);
	assert.deepEqual(nextScreen({ ...s, screen: "title" }, true, true), {
		screen: "review",
		editing: false,
	});
	assert.equal(prevScreen({ ...s, screen: "title" }, true, true), "review");
});

test("tombol nonaktif menyebut alasan", () => {
	const lbl = (s: Draft, c = {}) => {
		const b = bar(s, { ...ctx, ...c });
		return b.show ? `${b.on ? "on" : "off"}:${b.label}` : "hide";
	};
	assert.equal(lbl(base({ screen: "date" })), "off:Pilih tanggal dulu");
	const date = { y: 2026, m: 11, d: 12, full: false };
	assert.equal(lbl(base({ screen: "date", date })), "off:Pilih jam mulai");
	assert.equal(
		lbl(base({ screen: "date", date, time: "18:00" }), { busy: true }),
		"off:Jam ini penuh, pilih yang lain",
	);
	assert.equal(
		lbl(base({ screen: "contact", name: "Rina" })),
		"off:Isi nomor WhatsApp dulu",
	);
	assert.equal(
		lbl(base({ screen: "contact", name: "Rina", wa: "812 3456 7890" })),
		"on:Kirim kode verifikasi",
	);
	assert.equal(
		lbl(base({ screen: "add" }), { addSum: 200000 }),
		"on:Lanjut · +Rp200.000",
	);
	assert.equal(
		lbl(base({ screen: "city" }), { offline: true }),
		"off:Menunggu koneksi…",
	);
	assert.equal(lbl(base({ screen: "review" })), "off:Centang persetujuan dulu");
});

test("Guest Cam saja: lewati durasi/format/backdrop, tombol paket & add-on sesuai", () => {
	const s = {
		...blankDraft({ y: 2026, m: 11, d: 1 }),
		pkg: "guest_cam",
		screen: "pkg" as const,
	};
	const q = seq(s, false);
	assert.ok(
		!q.includes("dur") && !q.includes("fmt") && !q.includes("backdrop"),
	);
	assert.equal(nextScreen(s, false, false).screen, "add");
	const ctx = {
		editing: false,
		offline: false,
		busy: false,
		durPrice: 0,
		addSum: 0,
		sending: false,
		otpOk: false,
	};
	assert.deepEqual(
		bar(
			{ ...s, screen: "add" },
			{ ...ctx, addErr: "Pilih jumlah tamu Guest Cam dulu." },
		),
		{
			show: true,
			on: false,
			label: "Pilih jumlah tamu Guest Cam dulu.",
		},
	);
});
