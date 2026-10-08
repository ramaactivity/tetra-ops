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
	normPromo,
	parseInstagram,
	parseStageGroups,
	pickAddon,
	promoDiscount,
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

test("grup foto pelaminan: satu per baris, kosong dibuang, dipotong ke batas Booth", () => {
	assert.deepEqual(parseStageGroups("  Keluarga inti \n\nSahabat SMA\n  "), [
		"Keluarga inti",
		"Sahabat SMA",
	]);
	assert.equal(parseStageGroups("x".repeat(200))[0].length, 120);
	assert.equal(parseStageGroups(Array(400).fill("g").join("\n")).length, 300);
});

test("instagram: @, link, koma/spasi dibersihkan; unik; maks 6", () => {
	assert.deepEqual(
		parseInstagram(
			"@rina, https://www.instagram.com/dimas_ok/  @wo.bahagia @Rina",
		),
		["rina", "dimas_ok", "wo.bahagia"],
	);
	assert.deepEqual(parseInstagram("bukan-handle! ok_1"), ["ok_1"]);
	assert.equal(parseInstagram("a b c d e f g h").length, 6);
});

test("promo: persen dengan batas, nominal, item, minimal total", () => {
	assert.deepEqual(
		promoDiscount(
			{ type: "percent", value: 10, max_idr: 300000 },
			2500000,
			2000000,
		),
		{ ok: true, idr: 250000 },
	);
	assert.deepEqual(
		promoDiscount(
			{ type: "percent", value: 10, max_idr: 300000 },
			5000000,
			null,
		),
		{ ok: true, idr: 300000 },
	);
	assert.deepEqual(
		promoDiscount({ type: "amount", value: 9000000 }, 2000000, null),
		{ ok: true, idr: 2000000 },
	);
	assert.deepEqual(
		promoDiscount({ type: "item", item: "Gratis Guest Cam" }, 2000000, null),
		{ ok: true, idr: 0 },
	);
	assert.deepEqual(
		promoDiscount({ type: "amount", value: 100000 }, 1500000, 2000000),
		{ ok: false, reason: "min_total" },
	);
	assert.equal(normPromo(" tamu-7kq2m "), "TAMU-7KQ2M");
	assert.equal(normPromo("halo"), null);
});

test("add-on per paket: extend, tier Guest Cam, cetak ikut tier & ukuran, Print Station, TV", () => {
	const cat = groupCatalog([
		...rows,
		pkg("photostage_combo", "4R", 3, 4_500_000),
		{ ...pkg("guest_cam", "none", 4, 0) },
	]);
	const ad = (
		id: string,
		name: string,
		price: number,
		addon_group: string | null = null,
		max_guests: number | null = null,
		print_size: string | null = null,
	) => ({
		id,
		name,
		unit: "x",
		price,
		min_qty: null,
		addon_group,
		max_guests,
		print_size,
	});
	const all = [
		ad("e2", "Tambahan Durasi 1 Jam", 500_000),
		ad("e3", "Tambahan Durasi 1 Jam (3+ crew)", 750_000),
		ad("gS", "Guest Cam S", 450_000, "guest_cam", 100),
		ad("gU", "Guest Cam tak terbatas", 1_200_000, "guest_cam", null),
		ad("p2S", "Cetak 2R 100", 400_000, "guest_print", 100, "2R"),
		ad("p4S", "Cetak 4R 100", 750_000, "guest_print", 100, "4R"),
		ad("p2U", "Cetak 2R per 100", 375_000, "guest_print_100", null, "2R"),
		ad("sB", "Print Station · Bogor", 750_000, "print_station"),
		ad("sL", "Print Station · luar Bogor", 1_200_000, "print_station"),
		ad("tv", "TV Live Gallery", 1_500_000, "tv"),
		ad("mg", "Photomagnet", 650_000),
	];
	const q = (
		category: string,
		hours: number,
		frame: "2R" | "4R" | null,
		city: string,
		adds: [string, number][],
	) =>
		quoteSelection(
			{
				...base,
				category,
				hours,
				frame,
				city,
				units: 1,
				addons: adds.map(([id, qty]) => ({ id, qty })),
			},
			cat,
			all,
		);
	// extend sesuai crew
	assert.equal(q("photostage_combo", 3, "4R", "Bogor", [["e3", 2]]).ok, true);
	assert.equal(q("photostage_combo", 3, "4R", "Bogor", [["e2", 1]]).ok, false);
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [["e3", 1]]).ok,
		false,
	);
	assert.equal(
		q("guest_cam", 4, null, "Bogor", [
			["gS", 1],
			["e2", 1],
		]).ok,
		false,
	);
	// Guest Cam saja wajib tier; harga = tier
	assert.equal(q("guest_cam", 4, null, "Bogor", []).ok, false);
	const solo = q("guest_cam", 4, null, "Bogor", [["gS", 1]]);
	assert.ok(solo.ok);
	assert.equal(solo.total, 450_000);
	// cetak: ikut ukuran booth, butuh tier yang sama
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [
			["gS", 1],
			["p2S", 1],
		]).ok,
		true,
	);
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [
			["gS", 1],
			["p4S", 1],
		]).ok,
		false,
	);
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [["p2S", 1]]).ok,
		false,
	);
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [
			["gU", 1],
			["p2S", 1],
		]).ok,
		false,
	);
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [
			["gU", 1],
			["p2U", 3],
		]).ok,
		true,
	);
	// tanpa booth: cetak bebas ukuran + wajib Print Station sesuai kota
	assert.equal(
		q("guest_cam", 4, null, "Bogor", [
			["gS", 1],
			["p4S", 1],
		]).ok,
		false,
	);
	const st = q("guest_cam", 4, null, "Kab. Bogor", [
		["gS", 1],
		["p4S", 1],
		["sB", 1],
	]);
	assert.ok(st.ok);
	assert.equal(st.total, 450_000 + 750_000 + 750_000);
	assert.equal(
		q("guest_cam", 4, null, "Jakarta", [
			["gS", 1],
			["p4S", 1],
			["sB", 1],
		]).ok,
		false,
	);
	assert.equal(
		q("guest_cam", 4, null, "Jakarta", [
			["gS", 1],
			["p4S", 1],
			["sL", 1],
		]).ok,
		true,
	);
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [
			["gS", 1],
			["p2S", 1],
			["sB", 1],
		]).ok,
		false,
	);
	// pilih satu, maks 1
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [
			["gS", 1],
			["gU", 1],
		]).ok,
		false,
	);
	assert.equal(
		q("photobooth_classic", 2, "2R", "Bogor", [["gS", 2]]).ok,
		false,
	);
	// TV: paket ber-crew, atau Guest Cam saja dengan Print Station
	assert.equal(q("photobooth_classic", 2, "2R", "Bogor", [["tv", 1]]).ok, true);
	assert.equal(
		q("guest_cam", 4, null, "Bogor", [
			["gS", 1],
			["tv", 1],
		]).ok,
		false,
	);
	assert.equal(
		q("guest_cam", 4, null, "Bogor", [
			["gS", 1],
			["p2S", 1],
			["sB", 1],
			["tv", 1],
		]).ok,
		true,
	);
	// add-on booth tidak untuk Guest Cam saja
	assert.equal(
		q("guest_cam", 4, null, "Bogor", [
			["gS", 1],
			["mg", 1],
		]).ok,
		false,
	);
});

test("pickAddon: lepas tier lain, cetak pindah tier, Print Station otomatis", () => {
	const ad = (
		id: string,
		addon_group: string,
		max_guests: number | null,
		print_size: string | null = null,
		name = id,
	) => ({
		id,
		name,
		unit: "x",
		price: 1,
		min_qty: null,
		addon_group,
		max_guests,
		print_size,
	});
	const all = [
		ad("gS", "guest_cam", 100),
		ad("gM", "guest_cam", 200),
		ad("p2S", "guest_print", 100, "2R"),
		ad("p2M", "guest_print", 200, "2R"),
		ad("sB", "print_station", null, null, "Print Station · Bogor"),
		ad("sL", "print_station", null, null, "Print Station · luar Bogor"),
	];
	const run = (
		cur: Record<string, number>,
		id: string,
		n: number,
		category = "guest_cam",
	) => ({
		...cur,
		...pickAddon(all, (r) => cur[r] ?? 0, id, n, {
			category,
			frame: null,
			city: "Bogor",
		}),
	});
	let s = run({}, "gS", 1);
	s = run(s, "p2S", 1);
	assert.equal(s.sB, 1);
	assert.equal(s.sL ?? 0, 0);
	s = run(s, "gM", 1);
	assert.deepEqual([s.gS, s.gM, s.p2S, s.p2M, s.sB], [0, 1, 0, 1, 1]);
	// photobooth: tanpa Print Station
	const pb = run(
		run({}, "gS", 1, "photobooth_classic"),
		"p2S",
		1,
		"photobooth_classic",
	);
	assert.equal(pb.sB ?? 0, 0);
});
