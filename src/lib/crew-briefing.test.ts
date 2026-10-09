import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type BriefingData,
	composeCrewBriefing,
	composeHariH,
	dueKinds,
	MAX_LEN,
} from "./crew-briefing";

const base: BriefingData = {
	judul: "Rafi & Dinda",
	event_date: "2026-10-10",
	setup_time: "14:00:00",
	start_time: "16:00:00",
	end_time: "19:00:00",
	session_segments: null,
	venue_name: "Gedung Serbaguna",
	venue_address: "Jl. Pajajaran 1",
	venue_city: "Bogor",
	maps_url: "https://maps.app.goo.gl/x",
	crew: [
		{ spot: 1, role: "asisten", name: "Rio" },
		{ spot: 1, role: "lead", name: "Adit" },
	],
	units: 1,
	paket: "4R Unlimited 3 Jam",
	sizes: ["4R"],
	backdrop: "Basic Tetra · Emerald Green",
	addons: ["Snapbook (Guest Cam) · 200 tamu"],
	desain: "belum_acc",
	pic: "Bu Rina · 0812",
	wo: null,
	catatan: [
		"Parkir di basement B2",
		"Rundown klien: 16:00 Akad; 18:00 Resepsi",
	],
	stok: ["Stok Kertas 4R menipis: sisa 40 lembar — cek sebelum packing"],
};

test("briefing H-1: format WA, catatan utuh, tanpa info uang", () => {
	const t = composeCrewBriefing(base);
	assert.match(t, /^📸 \*BRIEFING BESOK — Rafi & Dinda\*/);
	assert.match(t, /Crew tiba & setup: \*14:00\*/);
	assert.match(t, /Acara: 16:00–19:00 \(3 jam\)/);
	assert.match(t, /• Lead: Adit\n• Asisten: Rio/);
	assert.match(t, /⚠️ BELUM ACC — cek ke Iqbal/);
	assert.match(t, /⚠️ Stok Kertas 4R menipis/);
	assert.match(
		t,
		/Parkir di basement B2\nRundown klien: 16:00 Akad; 18:00 Resepsi/,
	);
	assert.match(t, /media & frame ukuran 4R cukup untuk 3 jam/);
	assert.doesNotMatch(t, /Rp|tagihan|lunas|bayar|<b>|@/i);
	assert.ok(!t.includes("🤖"), "awalan bot ditambahkan bot sendiri");
});

test("catatan kosong → '-', catatan panjang tetap utuh (yang dibuang baris cek)", () => {
	assert.match(
		composeCrewBriefing({ ...base, catatan: [] }),
		/📝 \*Catatan\*\n-/,
	);
	const panjang = "x".repeat(MAX_LEN - 1200);
	const t = composeCrewBriefing({ ...base, catatan: [panjang] });
	assert.ok(t.length <= MAX_LEN);
	assert.ok(t.includes(panjang));
});

test("multi-unit: crew & format cetak per spot", () => {
	const t = composeCrewBriefing({
		...base,
		units: 2,
		sizes: ["4R", "2R"],
		crew: [
			{ spot: 2, role: "lead", name: "Bima" },
			{ spot: 1, role: "lead", name: "Adit" },
		],
	});
	assert.match(t, /• Spot 1 · Lead: Adit\n• Spot 2 · Lead: Bima/);
	assert.match(t, /Format cetak: spot 1 4R, spot 2 2R/);
});

test("hari H: singkat, lead + catatan terpenting", () => {
	const t = composeHariH(base);
	assert.equal(
		t,
		[
			"☀️ *Hari ini: Rafi & Dinda*",
			"Tiba & setup *14:00* · Gedung Serbaguna",
			"Maps: https://maps.app.goo.gl/x",
			"Lead Adit · Acara 16:00–19:00 (3 jam)",
			"Parkir di basement B2",
			"Semangat dan hati-hati di jalan! 🙌",
		].join("\n"),
	);
});

test("jadwal kirim & idempoten", () => {
	const d = { today: "2026-10-09", tomorrow: "2026-10-10", started: false };
	const at = (h: number, x: Partial<Parameters<typeof dueKinds>[0]> = {}) =>
		dueKinds({
			event_date: "2026-10-10",
			nowMin: h * 60,
			sent: new Set(),
			...d,
			...x,
		});
	assert.deepEqual(at(14.9), [], "sebelum 15.00 belum");
	assert.deepEqual(at(15), ["h1"]);
	assert.deepEqual(
		at(16, { sent: new Set(["h1"]) }),
		[],
		"sudah terkirim → tidak dobel",
	);
	assert.deepEqual(at(22), [], "di luar 06–21 tidak kirim");
	// Hari H
	const h = (min: number, x: Partial<Parameters<typeof dueKinds>[0]> = {}) =>
		dueKinds({
			event_date: "2026-10-09",
			nowMin: min,
			sent: new Set(["h1"]),
			...d,
			...x,
		});
	assert.deepEqual(h(5 * 60), []);
	assert.deepEqual(h(6 * 60), ["hari_h"]);
	assert.deepEqual(h(7 * 60, { sent: new Set(["h1", "hari_h"]) }), []);
	assert.deepEqual(h(7 * 60, { started: true }), [], "acara sudah mulai");
	// Event dibuat setelah 15.00 H-1: dapat briefing lengkap pagi harinya.
	assert.deepEqual(h(6 * 60, { sent: new Set() }), ["h1", "hari_h"]);
});
