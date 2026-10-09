/** API baca-saja Tetra Booth: rentang tanggal & bentuk data (tanpa field uang/kontak). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type BoothEventRow,
	boothSignature,
	type DesignSource,
	guestCamFields,
	modulesFor,
	parseBoothRange,
	toBoothBooking,
	toBoothDesign,
} from "@/lib/booth-api";

test("rentang bawaan hari ini + 60 hari, validasi format & batas", () => {
	assert.deepEqual(parseBoothRange(null, null, "2026-10-04"), {
		from: "2026-10-04",
		to: "2026-12-03",
	});
	assert.deepEqual(parseBoothRange("2026-11-01", "2026-11-30", "2026-10-04"), {
		from: "2026-11-01",
		to: "2026-11-30",
	});
	assert.ok("error" in parseBoothRange("04-10-2026", null, "2026-10-04"));
	assert.ok("error" in parseBoothRange("2026-11-01", "2026-10-01", "x"));
	assert.ok("error" in parseBoothRange("2026-01-01", "2026-12-31", "x"));
});

const row = (o: Partial<BoothEventRow> = {}): BoothEventRow => ({
	project_id: "TP-0101",
	client_name: "Andi & Sari",
	event_title: null,
	event_category: "wedding",
	event_date: "2026-10-12",
	start_time: "14:00:00",
	end_time: "17:00:00",
	venue_name: "Gedung Kirana",
	venue_city: "Bogor",
	service_type: "photobooth_classic",
	frame_size: "2R",
	custom_package_name: null,
	package: { name: "Wedding 3 Jam", duration_hours: 3 },
	event_type: { label: "Wedding" },
	...o,
});

test("paket dari tabel packages, atau nama paket kustom", () => {
	const b = toBoothBooking(row());
	assert.equal(b.package_name, "Wedding 3 Jam");
	assert.equal(b.package_duration_hours, 3);
	assert.equal(b.event_category_label, "Wedding");
	assert.equal(b.start_time, "14:00");
	const c = toBoothBooking(
		row({ package: null, custom_package_name: "Custom 5 jam" }),
	);
	assert.equal(c.package_name, "Custom 5 jam");
	assert.equal(c.package_duration_hours, null);
	// embed to-one kadang array di tipe PostgREST
	const d = toBoothBooking(
		row({ package: [{ name: "Arr", duration_hours: 2 }], event_type: [] }),
	);
	assert.equal(d.package_name, "Arr");
	assert.equal(d.event_category_label, null);
});

test("tidak pernah membawa field uang atau kontak", () => {
	const leaky = {
		...row(),
		grand_total: 5_000_000,
		client_phone: "0812",
	} as BoothEventRow;
	const keys = Object.keys(toBoothBooking(leaky));
	for (const k of keys)
		assert.ok(!/total|price|phone|wa|paid|balance/i.test(k), k);
});

test("modul paket dari kategori", () => {
	assert.deepEqual(modulesFor("photostage_combo"), [
		"photo_stage",
		"photobooth",
	]);
	assert.deepEqual(modulesFor("magazine_box_only"), ["magazine"]);
	const gc = { addon_group: "guest_cam", max_guests: 200, print_size: null };
	const pr = { addon_group: "guest_print", max_guests: 200, print_size: "2R" };
	assert.deepEqual(modulesFor("photobooth_classic", [gc, pr]), [
		"photobooth",
		"guest_cam",
	]);
	assert.deepEqual(modulesFor("guest_cam", [gc]), ["guest_cam"]);
	assert.deepEqual(guestCamFields([gc, pr]), {
		guest_cam_max_guests: 200,
		guest_cam_print: true,
		guest_cam_print_size: "2R",
	});
	assert.deepEqual(guestCamFields([]), {
		guest_cam_max_guests: null,
		guest_cam_print: false,
		guest_cam_print_size: null,
	});
	assert.deepEqual(modulesFor(null), []);
});

test("objek design: frame_url hanya kalau approved & ACC; spot ≥2 terpisah", () => {
	const reqs: DesignSource[] = [
		{
			spot_no: 2,
			stage: "acc",
			version: {
				frame_size: "2R",
				orientation: "portrait",
				file_path: "b/2.png",
				booth_layout_id: null,
			},
			template: null,
		},
		{
			spot_no: 1,
			stage: "acc",
			version: {
				frame_size: "4R",
				orientation: "portrait",
				file_path: "b/1.png",
				booth_layout_id: null,
			},
			template: {
				booth_layout_id: "11111111-1111-4111-8111-111111111111",
				booth_preset_id: "4r-grid",
			},
		},
	];
	const url = (p: string) => `https://x/${p}`;
	const ev = {
		design_status: "approved",
		design_approved_at: "2026-11-02T02:14:00Z",
		design_frame_size: "4R",
		frame_size: "4R",
	};
	const d = toBoothDesign(ev, reqs, url, "2026-11-09T00:00:00Z");
	assert.equal(d.frame_url, "https://x/b/1.png");
	assert.equal(d.frame_url_expires_at, "2026-11-09T00:00:00Z");
	assert.equal(d.booth_layout_id, "11111111-1111-4111-8111-111111111111");
	assert.equal(d.booth_preset_id, "4r-grid");
	assert.equal(d.spots.length, 1);
	assert.equal(d.spots[0].frame_url, "https://x/b/2.png");
	const proses = toBoothDesign(
		{ ...ev, design_status: "proses" },
		reqs,
		url,
		"x",
	);
	assert.equal(proses.frame_url, null);
	assert.equal(proses.frame_url_expires_at, null);
	const kosong = toBoothDesign(
		{
			design_status: null,
			design_approved_at: null,
			design_frame_size: null,
			frame_size: "2R",
		},
		[],
		url,
		null,
	);
	assert.equal(kosong.status, "belum");
	assert.equal(kosong.frame_size, "2R");
	assert.equal(kosong.stage, null);
});

test("tanda tangan webhook t=…,v1=hex(HMAC(secret, t.body))", () => {
	const sig = boothSignature("rahasia", 1793865600, '{"a":1}');
	assert.match(sig, /^t=1793865600,v1=[0-9a-f]{64}$/);
	assert.equal(sig, boothSignature("rahasia", 1793865600, '{"a":1}'));
	assert.notEqual(sig, boothSignature("rahasia", 1793865600, '{"a":2}'));
});

test("objek design v1.0: source & texts (template otomatis / klien / designer)", () => {
	const ev = {
		design_status: "approved",
		design_approved_at: "2026-10-09T00:00:00Z",
		design_frame_size: "4R",
		frame_size: "4R",
	};
	const tpl = toBoothDesign(
		ev,
		[
			{
				spot_no: 1,
				stage: "acc",
				mode: "template",
				brief: {
					teks_frame: "Rina & Dimas",
					tanggal_frame: "12.12.2026",
					catatan: "x",
				},
				version: null,
				template: {
					booth_layout_id: "11111111-1111-4111-8111-111111111111",
					booth_preset_id: null,
					booth_layout_version: 3,
				},
			},
		],
		() => null,
		null,
	);
	assert.equal(tpl.source, "template");
	assert.equal(tpl.booth_layout_version, 3);
	assert.equal(tpl.booth_layout_id, "11111111-1111-4111-8111-111111111111");
	assert.deepEqual(tpl.texts, {
		judul: "Rina & Dimas",
		subjudul: null,
		tanggal: "12.12.2026",
		hashtag: null,
	});
	const klien = toBoothDesign(
		ev,
		[
			{
				spot_no: 1,
				stage: "acc",
				mode: "upload",
				brief: {},
				version: {
					frame_size: "4R",
					orientation: "portrait",
					file_path: "b/k.png",
					booth_layout_id: null,
					source: "klien",
				},
				template: null,
			},
		],
		(p) => `https://x/${p}`,
		"2026-11-09T00:00:00Z",
	);
	assert.equal(klien.source, "klien");
	assert.equal(klien.texts, null);
	assert.equal(klien.frame_url, "https://x/b/k.png");
});
