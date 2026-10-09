import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type BriefingData,
	composeCrewBriefing,
	composeHariH,
	composeSelesai,
	dueKinds,
	endAt,
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
	pic: { name: "Bu Rina", wa: "0812" },
	wo: null,
	catatan: [
		"Parkir di basement B2",
		"Rundown klien: 16:00 Akad; 18:00 Resepsi",
	],
	stok: ["Stok Kertas 4R menipis: sisa 40 lembar — cek sebelum packing"],
};

test("briefing H-1: santai tapi semua field ada, catatan utuh, tanpa uang & tanpa tanda bot", () => {
	const t = composeCrewBriefing(base);
	assert.match(
		t,
		/^Gaes, besok kita jalan ke Rafi & Dinda ya 🙌\nSabtu 10 Okt/,
	);
	for (const re of [
		/• Loading & setup: 14\.00/,
		/• Acara: 16\.00–19\.00 \(3 jam\)/,
		/• Gedung Serbaguna, Jl\. Pajajaran 1, Bogor\n• Maps: https:\/\/maps\.app\.goo\.gl\/x/,
		/👥 Crew\n• Adit \(lead\)\n• Rio \(asisten\)/,
		/• 4R Unlimited 3 Jam • 1 unit/,
		/• Cetak: 4R/,
		/• Backdrop: Basic Tetra · Emerald Green/,
		/• Add-on: Snapbook \(Guest Cam\) · 200 tamu/,
		/• ⚠️ Stok Kertas 4R menipis/,
		/🎨 Desain: ⚠️ belum ACC nih, tolong cek ke Iqbal ya/,
		/☎️ PIC hari H\n• Bu Rina · 0812/,
		/📝 Catatan penting\n• Parkir di basement B2\n• Rundown klien: 16:00 Akad; 18:00 Resepsi/,
		/cek perlengkapan sebelum berangkat ya: media & frame 4R cukup buat 3 jam/,
	])
		assert.match(t, re);
	assert.doesNotMatch(t, /Rp|tagihan|lunas|bayar|<b>|BRIEFING|otomatis|bot/i);
});

test("catatan kosong → baris jelas; catatan panjang tetap utuh (yang dibuang baris cek)", () => {
	assert.match(
		composeCrewBriefing({ ...base, catatan: [] }),
		/📝 Catatan penting\n• nggak ada catatan khusus dari klien/,
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
	assert.match(t, /• Adit \(lead, spot 1\)\n• Bima \(lead, spot 2\)/);
	assert.match(t, /Cetak: spot 1 4R, spot 2 2R/);
});

test("hari H: singkat, semua crew + PIC + catatan terpenting, tanpa tanda bot", () => {
	const t = composeHariH(base);
	assert.equal(
		t,
		[
			"Pagi gaes! Hari ini Rafi & Dinda ☀️",
			"• Loading & setup 14.00 • acara 16.00–19.00 (3 jam)",
			"• Gedung Serbaguna",
			"• Maps: https://maps.app.goo.gl/x",
			"• Crew: Adit (lead) & Rio",
			"• PIC: Bu Rina · 0812",
			"• Parkir di basement B2",
			"Semangat & hati-hati di jalan ya! 🙌",
		].join("\n"),
	);
});

test("setelah acara: nama crew, rekap/sudah masuk, footage ke Iqbal, tanpa uang klien", () => {
	const t = composeSelesai({
		judul: "Adel & Alpi",
		project_id: "PRJ-1",
		crew: ["Mou", "Lutpii"],
		rekapUrl: "https://team.tetraphoto.com/crew/jadwal/PRJ-1/rekap",
		rekapMasuk: false,
	});
	assert.match(t, /Mou & Lutpii/);
	assert.match(
		t,
		/Rekap di aplikasi crew: foto bukti \+ bukti transfer\/transaksi \(bensin, parkir, tol, dll\.\)\n {2}https:\/\/team\.tetraphoto\.com\/crew\/jadwal\/PRJ-1\/rekap/,
	);
	assert.match(t, /Footage dokumentasi langsung kirim ke Iqbal/);
	assert.match(t, /Hati-hati pulangnya! 🛵$/);
	assert.doesNotMatch(t, /Rp|tagihan|lunas|otomatis|bot/i);
	const masuk = composeSelesai({
		judul: "X",
		project_id: "PRJ-1",
		crew: ["Mou"],
		rekapUrl: null,
		rekapMasuk: true,
	});
	assert.match(masuk, /Rekap udah masuk, makasih! 👍/);
	assert.doesNotMatch(masuk, /aplikasi crew/);
	// selesai + 30 menit: endAt selesai 22.00 → 15:00Z; lewat tengah malam → hari berikutnya
	assert.equal(
		new Date(endAt("2026-10-09", "19:00", "22:00") ?? 0).toISOString(),
		"2026-10-09T15:00:00.000Z",
	);
	assert.equal(
		new Date(endAt("2026-10-09", "21:00", "01:00") ?? 0).toISOString(),
		"2026-10-09T18:00:00.000Z",
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

test("PIC = kontak WO (nomor sama) → satu baris; beda → dua baris", () => {
	const sama = composeCrewBriefing({
		...base,
		pic: { name: "Nisa", wa: "082133200110" },
		wo: { vendor: "Partner Organizer", name: "Nisa", wa: "+62 821-3320-0110" },
	});
	assert.match(
		sama,
		/☎️ PIC hari H\n• Nisa · 082133200110 \(WO Partner Organizer\)\n\n/,
	);
	const beda = composeCrewBriefing({
		...base,
		wo: { vendor: "Partner Organizer", name: "Puput", wa: "0857" },
	});
	assert.match(
		beda,
		/• Bu Rina · 0812\n• WO: Partner Organizer \(Puput · 0857\)/,
	);
});
