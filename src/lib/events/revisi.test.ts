import assert from "node:assert/strict";
import { test } from "node:test";
import type { BookingFormDefaults } from "@/components/booking/booking-form";
import {
	applyRevisi,
	parseRevisiArgs,
	type RevisiAddon,
	type RevisiPackage,
} from "@/lib/events/revisi";

const pkg = (
	id: string,
	frame: string,
	hours: number,
	price: number,
	active = true,
): RevisiPackage => ({
	id,
	name: `${frame} ${hours} Jam`,
	category: "photobooth_classic",
	frame_size: frame,
	duration_hours: hours,
	base_price: price,
	active,
});

const cat = {
	packages: [
		pkg("4r-2", "4R", 2, 2_000_000),
		pkg("4r-3", "4R", 3, 2_500_000),
		pkg("2r-3", "2R", 3, 2_400_000),
	],
	addons: [
		{ id: "a-gb", name: "Guest Book", price: 350_000 },
		{ id: "a-bt", name: "Break Time", price: 300_000 },
		{ id: "a-bt2", name: "Break Time Extra", price: 400_000 },
		{ id: "a-tr", name: "Transport Luar Kota", price: 0 },
	] satisfies RevisiAddon[],
	grossupRate: 2.5,
};

// Kasus Hilmi & Syifa (PRJ-20261122-9433): 4R 2 jam, 11:00–13:00.
const hilmi: BookingFormDefaults = {
	service_type: "photobooth_classic",
	package_id: "4r-2",
	pending_package_hours: "",
	unit_count: 1,
	base_price: 2_000_000,
	gross_up_pph_amount: 0,
	setup_time: "10:00",
	start_time: "11:00",
	end_time: "13:00",
	session_segments: "",
	addons: [],
};

const ok = (r: ReturnType<typeof applyRevisi>) => {
	if ("error" in r) assert.fail(r.error);
	return r;
};

test("Hilmi: 2 jam → 3 jam memakai paket 4R 3 jam dari pricelist", () => {
	const r = ok(
		applyRevisi(hilmi, { durasi_jam: 3, jam_selesai: "14:00" }, cat),
	);
	assert.equal(r.defaults.package_id, "4r-3");
	assert.equal(r.defaults.base_price, 2_500_000);
	assert.equal(r.defaults.start_time, "11:00");
	assert.equal(r.defaults.end_time, "14:00");
	assert.deepEqual(r.peringatan, []);
	assert.equal(hilmi.package_id, "4r-2", "input tidak boleh termutasi");
});

test("durasi berubah tanpa jam baru → ditolak, tidak menebak", () => {
	const r = applyRevisi(hilmi, { durasi_jam: 3 }, cat);
	assert.ok("error" in r && r.error.includes("jam_mulai"));
});

test("durasi yang tidak ada di pricelist → ditolak dengan daftar durasi", () => {
	const r = applyRevisi(hilmi, { durasi_jam: 7, jam_selesai: "18:00" }, cat);
	assert.ok("error" in r && r.error.includes("2, 3"));
});

test("harga nego lama → peringatan, harga baru tetap pricelist", () => {
	const r = ok(
		applyRevisi(
			{ ...hilmi, base_price: 1_800_000 },
			{ durasi_jam: 3, jam_selesai: "14:00" },
			cat,
		),
	);
	assert.equal(r.defaults.base_price, 2_500_000);
	assert.match(r.peringatan[0], /nego/);
});

test("multi-unit: harga paket × unit", () => {
	const r = ok(
		applyRevisi(
			{ ...hilmi, unit_count: 2, base_price: 4_000_000 },
			{ durasi_jam: 3, jam_selesai: "14:00" },
			cat,
		),
	);
	assert.equal(r.defaults.base_price, 5_000_000);
	assert.deepEqual(r.peringatan, []);
});

test("paket sementara (ukuran menyusul) → harga terendah durasi itu", () => {
	const r = ok(
		applyRevisi(
			{ ...hilmi, package_id: "", pending_package_hours: 2 },
			{ durasi_jam: 3, jam_selesai: "14:00" },
			cat,
		),
	);
	assert.equal(r.defaults.pending_package_hours, 3);
	assert.equal(r.defaults.base_price, 2_400_000);
});

test("paket custom → ditolak (lewat app)", () => {
	const r = applyRevisi(
		{ ...hilmi, package_id: "" },
		{ durasi_jam: 3, jam_selesai: "14:00" },
		cat,
	);
	assert.ok("error" in r && r.error.includes("custom"));
});

test("gross-up dihitung ulang dengan rumus tombol Auto", () => {
	const r = ok(
		applyRevisi(
			{ ...hilmi, gross_up_pph_amount: 51_282 },
			{ durasi_jam: 3, jam_selesai: "14:00" },
			cat,
		),
	);
	assert.equal(r.defaults.gross_up_pph_amount, 64_103);
});

test("event sudah punya add-on Tambahan Durasi → peringatan dobel", () => {
	const r = ok(
		applyRevisi(
			{ ...hilmi, addons: [{ addon_id: "a-ext", quantity: 1 }] },
			{ durasi_jam: 3, jam_selesai: "14:00" },
			{
				...cat,
				addons: [
					...cat.addons,
					{ id: "a-ext", name: "Tambahan Durasi 1 Jam", price: 500_000 },
				],
			},
		),
	);
	assert.match(r.peringatan.join(), /dobel/);
});

test("acara berjeda: jam tidak boleh diubah lewat agent", () => {
	const r = applyRevisi(
		{ ...hilmi, session_segments: '[{"start":"11:00","end":"12:00"}]' },
		{ jam_selesai: "14:00" },
		cat,
	);
	assert.ok("error" in r && r.error.includes("jeda"));
});

test("jam tak sesuai durasi & setup sesudah mulai → peringatan", () => {
	const r = ok(applyRevisi(hilmi, { jam_mulai: "09:30" }, cat));
	assert.equal(r.peringatan.length, 2);
});

test("add-on: tambah, ubah jumlah (harga nego tetap), hapus", () => {
	const cur = {
		...hilmi,
		addons: [
			{ addon_id: "a-gb", quantity: 1, unit_price: 300_000 },
			{ addon_id: "a-bt", quantity: 1 },
		],
	};
	const r = ok(
		applyRevisi(
			cur,
			{
				addons: [
					{ addon: "guest book", jumlah: 2 },
					{ addon: "a-bt", jumlah: 0 },
					{ addon: "Break Time Extra", jumlah: 1 },
				],
			},
			cat,
		),
	);
	assert.deepEqual(r.defaults.addons, [
		{ addon_id: "a-gb", quantity: 2, unit_price: 300_000 },
		{ addon_id: "a-bt2", quantity: 1 },
	]);
	assert.equal(cur.addons.length, 2, "input tidak boleh termutasi");
});

test("add-on ambigu / tanpa harga katalog → ditolak", () => {
	const amb = applyRevisi(
		hilmi,
		{ addons: [{ addon: "break", jumlah: 1 }] },
		cat,
	);
	assert.ok("error" in amb && amb.error.includes("ambigu"));
	const nol = applyRevisi(
		hilmi,
		{ addons: [{ addon: "Transport", jumlah: 1 }] },
		cat,
	);
	assert.ok("error" in nol && nol.error.includes("diisi admin"));
});

test("parseRevisiArgs: normalisasi jam & tolak permintaan kosong", () => {
	assert.deepEqual(parseRevisiArgs({ jam_mulai: "9.30" }), {
		jam_mulai: "09:30",
	});
	assert.ok("error" in parseRevisiArgs({ project_id: "PRJ-1" }));
	assert.ok("error" in parseRevisiArgs({ durasi_jam: 2.5 }));
	assert.ok(
		"error" in parseRevisiArgs({ addons: [{ addon: "x", jumlah: -1 }] }),
	);
});
