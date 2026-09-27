/** inboxToBookingDefaults: jam, paket, frame, backdrop, PIC, tanggal perkiraan. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PackageOption } from "@/components/booking/booking-form";
import { inboxToBookingDefaults, parsePic } from "./defaults";

const pkg = (
	id: string,
	category: string,
	frame: string,
	h: number,
): PackageOption => ({
	id,
	name: id,
	category,
	frame_size: frame,
	duration_hours: h,
	base_price: h * 1_000_000,
});
const packages = [
	pkg("4r-3", "photobooth_classic", "4R", 3),
	pkg("2r-3", "photobooth_classic", "2R", 3),
	pkg("vb-3", "videobooth_360", "none", 3),
];
const backdrops = [
	{ id: "gold", code: "BG-BASIC-GOLD" },
	{ id: "white", code: "BG-BASIC-WHITE" },
	{ id: "client", code: "CLIENT-PROVIDED" },
];
const item = (data: Record<string, string | null>) => ({
	client_name: "Nadia",
	client_wa: "6281234567890",
	data,
});

test("contoh kontrak bot terpetakan lengkap", () => {
	const d = inboxToBookingDefaults(
		item({
			nama_acara: "Rizky & Nadia",
			tanggal: "Sabtu, 5 Desember 2026",
			tanggal_iso: "2026-12-05",
			jam: "11.00 - 14.00",
			lokasi: "Sentul",
			paket: "3 jam",
			pic: "Dimas 0813-1111-2222",
			instagram: "@rizkynadia.wedding",
			ukuran_frame: "4R",
			backdrop: "Gold",
		}),
		packages,
		backdrops,
	);
	assert.equal(d.channel, "direct");
	assert.equal(d.event_category, "wedding");
	assert.equal(d.client_org, "Rizky & Nadia");
	assert.equal(d.booker_name, "Nadia");
	assert.equal(d.client_wa, "081234567890");
	assert.equal(d.event_date, "2026-12-05");
	assert.equal(d.event_date_is_estimate, "");
	assert.equal(d.start_time, "11:00");
	assert.equal(d.end_time, "14:00");
	assert.equal(d.package_id, "4r-3");
	assert.equal(d.base_price, 3_000_000);
	assert.equal(d.frame_size, "4R");
	assert.equal(d.backdrop_id, "gold");
	assert.equal(d.pic_name, "Dimas");
	assert.equal(d.pic_wa, "081311112222");
	assert.match(
		String(d.crew_notes),
		/^Dari bot WA:\n- Instagram: @rizkynadia\.wedding/,
	);
});

test("frame tak jelas → paket jadi durasi sementara", () => {
	const d = inboxToBookingDefaults(
		item({ paket: "3 jam", ukuran_frame: "belum tau" }),
		packages,
		backdrops,
	);
	assert.equal(d.frame_size, "");
	assert.equal(d.package_id, "");
	assert.equal(d.pending_package_hours, 3);
	assert.equal(d.service_type, "photobooth_classic");
});

test("frame pasti tapi durasi tak ada di pricelist → tanpa paket, dicatat", () => {
	const d = inboxToBookingDefaults(
		item({ paket: "7 jam", ukuran_frame: "2R" }),
		packages,
		backdrops,
	);
	assert.equal(d.package_id, "");
	assert.equal(d.pending_package_hours, "");
	assert.match(String(d.crew_notes), /Paket diminta: 7 jam/);
});

test("videobooth cocok tanpa ukuran frame", () => {
	const d = inboxToBookingDefaults(
		item({ paket: "Videobooth 360 3 jam" }),
		packages,
		backdrops,
	);
	assert.equal(d.package_id, "vb-3");
});

test("backdrop: putih, dekorasi acara, dan warna yang tak ada", () => {
	const bd = (b: string) =>
		inboxToBookingDefaults(item({ backdrop: b }), packages, backdrops);
	assert.equal(bd("Putih").backdrop_id, "white");
	assert.equal(bd("pakai dekorasi acara").backdrop_id, "client");
	const pink = bd("Pink pastel");
	assert.equal(pink.backdrop_id, "");
	assert.match(String(pink.crew_notes), /Backdrop diminta: Pink pastel/);
});

test("tanggal belum ada / belum pasti → perkiraan", () => {
	assert.equal(
		inboxToBookingDefaults(item({}), packages, backdrops)
			.event_date_is_estimate,
		"on",
	);
	const kira = inboxToBookingDefaults(
		item({ tanggal: "sekitar awal Desember", tanggal_iso: "2026-12-05" }),
		packages,
		backdrops,
	);
	assert.equal(kira.event_date, "2026-12-05");
	assert.equal(kira.event_date_is_estimate, "on");
});

test("acara non-pernikahan: nama acara = event_title, klien = yang chat", () => {
	const d = inboxToBookingDefaults(
		item({ nama_acara: "Gathering PT Maju" }),
		packages,
		backdrops,
	);
	assert.equal(d.event_category, "gathering");
	assert.equal(d.event_title, "Gathering PT Maju");
	assert.equal(d.client_org, "Nadia");
});

test("jam tunggal & PIC berbagai bentuk", () => {
	const d = inboxToBookingDefaults(
		item({ jam: "mulai 19.00" }),
		packages,
		backdrops,
	);
	assert.equal(d.start_time, "19:00");
	assert.equal(d.end_time, "");
	assert.deepEqual(parsePic("Bu Hanna (WO) - +62 812-3456-7890"), {
		name: "Bu Hanna WO",
		wa: "081234567890",
	});
	assert.deepEqual(parsePic("Dimas"), { name: "Dimas", wa: "" });
});
