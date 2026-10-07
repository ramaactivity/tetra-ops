/**
 * Logika murni booking publik: katalog, harga, DP, kode verifikasi.
 * Jalankan: `pnpm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	addHours,
	daysUntil,
	extractWaCode,
	groupCatalog,
	missingForDp,
	newWaCode,
	quoteSelection,
	refundEstimate,
	rescheduleError,
	type Selection,
	validDp,
	withRundownLine,
} from "./core";

const pkg = (
	category: string,
	frame: string,
	hours: number,
	price: number,
) => ({
	category,
	frame_size: frame,
	duration_hours: hours,
	base_price: price,
	public_description: null,
	public_sort: 0,
});

const rows = [
	pkg("photobooth_classic", "2R", 2, 2_000_000),
	pkg("photobooth_classic", "4R", 2, 2_000_000),
	pkg("photobooth_classic", "polaroid", 3, 2_500_000),
	pkg("photobooth_classic", "4R", 3, 2_600_000),
	pkg("videobooth_360", "none", 2, 2_500_000),
];
const addons = [
	{
		id: "11111111-1111-4111-8111-111111111111",
		name: "Voucher",
		unit: "100 pcs",
		price: 25_000,
		min_qty: null,
	},
	{
		id: "22222222-2222-4222-8222-222222222222",
		name: "Keychain",
		unit: "pcs",
		price: 10_000,
		min_qty: 100,
	},
];

test("katalog: per kategori, durasi urut, harga terendah per durasi, frame tanpa 'none'", () => {
	const cat = groupCatalog(rows);
	assert.deepEqual(
		cat.map((p) => p.category),
		["photobooth_classic", "videobooth_360"],
	);
	assert.deepEqual(cat[0].frames, ["2R", "4R", "polaroid"]);
	assert.deepEqual(cat[0].options, [
		{ hours: 2, price: 2_000_000 },
		{ hours: 3, price: 2_500_000 },
	]);
	assert.deepEqual(cat[1].frames, []);
});

const base: Selection = {
	category: "photobooth_classic",
	hours: 3,
	frame: null,
	units: 2,
	addons: [{ id: addons[0].id, qty: 2 }],
	date: "2026-12-12",
	start: "19:00",
	city: "Bogor",
};

test("harga: paket × unit + add-on, jam selesai dari durasi", () => {
	const q = quoteSelection(base, groupCatalog(rows), addons);
	assert.ok(q.ok);
	assert.equal(q.base, 5_000_000);
	assert.equal(q.total, 5_050_000);
	assert.equal(q.end, "22:00");
});

test("harga: tolak durasi/ukuran/add-on yang tidak ada dan min qty", () => {
	const cat = groupCatalog(rows);
	assert.equal(quoteSelection({ ...base, hours: 9 }, cat, addons).ok, false);
	assert.equal(
		quoteSelection(
			{ ...base, category: "videobooth_360", hours: 2, frame: "4R" },
			cat,
			addons,
		).ok,
		false,
	);
	assert.equal(
		quoteSelection(
			{ ...base, addons: [{ id: addons[1].id, qty: 50 }] },
			cat,
			addons,
		).ok,
		false,
	);
	assert.equal(
		quoteSelection(
			{
				...base,
				addons: [{ id: "33333333-3333-4333-8333-333333333333", qty: 1 }],
			},
			cat,
			addons,
		).ok,
		false,
	);
});

test("jam selesai tidak lewat tengah malam", () => {
	assert.equal(addHours("22:30", 3), "23:59");
	assert.equal(addHours("08:15", 2), "10:15");
});

test("DP: minimal 500rb, tapi tagihan kecil boleh lunas sekaligus", () => {
	assert.equal(validDp(500_000, 2_000_000, 500_000), null);
	assert.match(validDp(400_000, 2_000_000, 500_000) ?? "", /minimal/);
	assert.match(validDp(2_500_000, 2_000_000, 500_000) ?? "", /melebihi/);
	assert.equal(validDp(300_000, 300_000, 500_000), null);
});

test("kode WA: format TP-XXXXXX dan terbaca dari pesan apa pun", () => {
	const code = newWaCode();
	assert.match(code, /^TP-[A-Z2-9]{6}$/);
	assert.equal(
		extractWaCode(`Halo Tetra, kode verifikasi saya: ${code}`),
		code,
	);
	assert.equal(extractWaCode("kode tp-ab3k9q ya"), "TP-AB3K9Q");
	assert.equal(extractWaCode("halo kak mau tanya harga"), null);
});

test("detail wajib sebelum DP", () => {
	assert.deepEqual(missingForDp({ nama_acara: "Wedding", pemilik_nama: " " }), [
		"Nama pemilik acara",
		"Nama tempat acara",
	]);
});

test("refund pembatalan klien sesuai kebijakan website (DP ditahan)", () => {
	assert.equal(refundEstimate(2_000_000, 15), 2_000_000); // > H-14: penuh
	assert.equal(refundEstimate(2_000_000, 14), 1_000_000); // H-14..H-3: 50%
	assert.equal(refundEstimate(2_000_000, 3), 1_000_000);
	assert.equal(refundEstimate(2_000_000, 2), 0); // < H-3
	assert.equal(refundEstimate(0, 60), 0); // baru DP: hangus
});

test("pindah tanggal: diajukan paling lambat H-30", () => {
	assert.equal(daysUntil("2026-11-20", "2026-10-21"), 30);
	assert.equal(rescheduleError("2027-08-01", "2026-11-20", "2026-10-21"), null);
	assert.match(
		rescheduleError("2027-01-10", "2026-11-20", "2026-10-22") ?? "",
		/30 hari/,
	);
	assert.match(
		rescheduleError("2026-10-07", "2026-12-20", "2026-10-07") ?? "",
		/besok/,
	);
});

test("rundown klien jadi satu baris di catatan crew, catatan owner utuh", () => {
	const rd = [
		{ jam: "18:00", acara: "Tamu datang" },
		{ jam: "19:30", acara: "Foto keluarga" },
	];
	assert.equal(
		withRundownLine(null, rd),
		"Rundown klien: 18:00 Tamu datang; 19:30 Foto keluarga",
	);
	const notes = "Bawa kabel ekstra\nRundown klien: lama";
	assert.equal(
		withRundownLine(notes, rd),
		"Bawa kabel ekstra\nRundown klien: 18:00 Tamu datang; 19:30 Foto keluarga",
	);
	assert.equal(withRundownLine(notes, []), "Bawa kabel ekstra");
});
