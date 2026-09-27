/**
 * buat_quotation (B2): pemetaan paket, aturan durasi, isian admin, usulan
 * diskon, gross-up 2,5%, masa berlaku 14 hari. Katalog = pricelist master.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Catalog,
	type CatalogPackage,
	pickPackage,
	planQuotation,
	QuotationRequestSchema,
} from "./quotation-plan";
import { pendingAdminItems } from "./types";

const P = (
	name: string,
	category: string,
	frame: string,
	h: number,
	price: number,
): CatalogPackage => ({
	id: name,
	name,
	category,
	frame_size: frame,
	duration_hours: h,
	base_price: price,
});
const classic = (f: string) =>
	[2, 3, 4, 5, 6, 8].map((h) =>
		P(
			`${f === "polaroid" ? "Polaroid" : f} Unlimited ${h} Jam`,
			"photobooth_classic",
			f,
			h,
			{ 2: 2e6, 3: 2.5e6, 4: 3e6, 5: 3.5e6, 6: 4e6, 8: 5e6 }[h] as number,
		),
	);
const catalog: Catalog = {
	packages: [
		...classic("2R"),
		...classic("4R"),
		...classic("polaroid"),
		P("2R Unlimited 13 Jam", "photobooth_classic", "2R", 13, 7.5e6),
		P("Videobooth 360 - 4 Jam", "videobooth_360", "none", 4, 3.5e6),
		P("Videobooth 360 - 8 Jam", "videobooth_360", "none", 8, 5.5e6),
		P("Magazine Box + Photobooth - 5 Jam", "magazine_combo", "4R", 5, 6e6),
		{
			...P("Paket Lama", "photobooth_classic", "4R", 7, 1e6),
			id: "11111111-1111-4111-8111-111111111111",
			is_active: false,
		},
	],
	addons: [
		{ id: "gb", name: "Guest Books Photo", unit: "25 lembar", price: 200_000 },
		{
			id: "22222222-2222-4222-8222-222222222222",
			name: "Keychain Photobooth Station",
			unit: "pcs",
			price: 10_000,
			min_qty: 100,
		},
		{ id: "old", name: "Addon Lama", unit: null, price: 1, is_active: false },
	],
	backdrops: [
		{
			code: "BG-BASIC-GOLD",
			name: "Basic Gold",
			type: "basic_included",
			is_active: true,
		},
		{
			code: "BG-BASIC-BLACK",
			name: "Basic Black",
			type: "basic_included",
			is_active: false,
		},
		{
			code: "BG-RENTAL-LUX-01",
			name: "Backdrop Rental Luxury #01",
			type: "rental_owned",
			is_active: true,
		},
	],
};
const opts = { today: "2026-09-27", grossUpRate: 2.5 };

function plan(input: Record<string, unknown>) {
	const req = QuotationRequestSchema.parse({
		klien: { nama: "Nadia" },
		acara: { kota: "Bogor" },
		sumber: { jenis: "telegram" },
		...input,
	});
	return planQuotation(req, catalog, opts);
}
const ok = (r: ReturnType<typeof plan>) => {
	if (!r.ok) throw new Error(r.error);
	return r.plan;
};

test("kategori + jam + format → paket master (nama & harga dari master)", () => {
	const p = ok(
		plan({
			layanan: [{ kategori: "photobooth_classic", jam: 3, format: "4R" }],
		}),
	);
	assert.equal(p.items[0].name, "4R Unlimited 3 Jam");
	assert.equal(p.items[0].package_id, "4R Unlimited 3 Jam");
	assert.equal(p.items[0].unit_price, 2_500_000);
	assert.equal(p.items[0].includes[0], "Durasi 3 jam · Format 4R");
	const v = ok(plan({ layanan: [{ kategori: "videobooth_360", jam: 4 }] }));
	assert.equal(v.items[0].name, "Videobooth 360 - 4 Jam");
	assert.equal(v.items[0].includes[0], "Durasi 4 jam");
});

test("format belum dipilih → harga acuan, tanpa package_id, 'menyusul'", () => {
	const p = ok(plan({ layanan: [{ kategori: "photobooth_classic", jam: 4 }] }));
	assert.equal(p.items[0].unit_price, 3_000_000);
	assert.equal(p.items[0].package_id, null);
	assert.match(p.items[0].includes[0], /Format cetak menyusul/);
});

test("paket nonaktif / tidak ada ditolak", () => {
	const r = plan({
		layanan: [{ package_id: "11111111-1111-4111-8111-111111111111" }],
	});
	assert.equal(r.ok, false);
	assert.equal(
		plan({ layanan: [{ package_id: "00000000-0000-0000-0000-000000000000" }] })
			.ok,
		false,
	);
	assert.equal(
		plan({
			layanan: [{ kategori: "photobooth_classic", jam: 3 }],
			addons: [{ nama: "Addon Lama" }],
		}).ok,
		false,
	);
});

test("> 8 jam: paket 8 jam + tambahan durasi @500rb", () => {
	const p = ok(
		plan({
			layanan: [{ kategori: "photobooth_classic", jam: 10, format: "4R" }],
		}),
	);
	assert.equal(p.items[0].name, "4R Unlimited 8 Jam");
	assert.equal(p.items[1].name, "Tambahan durasi 2 jam");
	assert.equal(p.items[1].unit_price, 500_000);
	assert.equal(p.items[1].qty, 2);
	assert.equal(p.subtotal, 6_000_000);
	// 2R 12 jam: 8 jam + 4 (7 jt) lebih murah dari 13 jam (7,5 jt).
	const q = ok(
		plan({
			layanan: [{ kategori: "photobooth_classic", jam: 12, format: "2R" }],
		}),
	);
	assert.equal(q.items[0].name, "2R Unlimited 8 Jam");
	assert.equal(q.subtotal, 7_000_000);
});

test("paket 13 jam dipakai bila tidak lebih mahal & disebut di preview", () => {
	const p = ok(
		plan({
			layanan: [{ kategori: "photobooth_classic", jam: 13, format: "2R" }],
		}),
	);
	assert.equal(p.items.length, 1);
	assert.equal(p.items[0].name, "2R Unlimited 13 Jam");
	assert.ok(p.catatan_server.some((c) => c.includes("13 Jam")));
	// 14 jam: 13+1 (8 jt) = 8+6 (8 jt) → seri, pilih paket lebih panjang.
	const q = ok(
		plan({
			layanan: [{ kategori: "photobooth_classic", jam: 14, format: "2R" }],
		}),
	);
	assert.equal(q.items[0].name, "2R Unlimited 13 Jam");
	assert.equal(q.items[1].name, "Tambahan durasi 1 jam");
	assert.equal(
		pickPackage(catalog.packages, "photobooth_classic", "4r", 13)?.pkg.name,
		"4R Unlimited 8 Jam",
	);
});

test("isian admin: transport Magazine, luar Jabodetabek, Luxury → blokir kirim", () => {
	const mag = ok(
		plan({
			layanan: [{ kategori: "magazine_combo", jam: 5 }],
			acara: { kota: "Bekasi" },
		}),
	);
	assert.deepEqual(mag.butuh_isian_admin, ["Transport"]);
	assert.deepEqual(pendingAdminItems(mag.items), ["Transport"]);
	const luar = ok(
		plan({
			layanan: [{ kategori: "videobooth_360", jam: 4 }],
			acara: { kota: "Bandung" },
		}),
	);
	assert.deepEqual(luar.butuh_isian_admin, ["Transport"]);
	const tanpaKota = ok(
		plan({ layanan: [{ kategori: "videobooth_360", jam: 4 }], acara: {} }),
	);
	assert.deepEqual(tanpaKota.butuh_isian_admin, ["Transport"]);
	const lux = ok(
		plan({
			layanan: [{ kategori: "videobooth_360", jam: 4 }],
			backdrop: "BG-RENTAL-LUX-01",
		}),
	);
	assert.deepEqual(lux.butuh_isian_admin, ["Backdrop Rental Luxury #01"]);
	// Setelah admin mengisi harga, tidak lagi memblokir.
	const filled = lux.items.map((i) =>
		i.needs_admin_price ? { ...i, unit_price: 750_000 } : i,
	);
	assert.deepEqual(pendingAdminItems(filled), []);
	// Jabodetabek + non-magazine: tanpa baris transport.
	const bogor = ok(plan({ layanan: [{ kategori: "videobooth_360", jam: 4 }] }));
	assert.deepEqual(bogor.butuh_isian_admin, []);
});

test("backdrop basic masuk include; nonaktif (Hitam) ditolak", () => {
	const p = ok(
		plan({
			layanan: [{ kategori: "videobooth_360", jam: 4 }],
			backdrop: "BG-BASIC-GOLD",
		}),
	);
	assert.ok(p.items[0].includes.includes("Backdrop: Basic Gold"));
	assert.equal(
		plan({
			layanan: [{ kategori: "videobooth_360", jam: 4 }],
			backdrop: "BG-BASIC-BLACK",
		}).ok,
		false,
	);
});

test("usulan diskon tidak mengubah total", () => {
	const base = ok(plan({ layanan: [{ kategori: "videobooth_360", jam: 4 }] }));
	const p = ok(
		plan({
			layanan: [{ kategori: "videobooth_360", jam: 4 }],
			usulan_diskon: { persen: 10, alasan: "klien langganan" },
		}),
	);
	assert.equal(p.total, base.total);
	assert.equal(p.usulan_diskon_rp, 350_000);
	assert.equal(p.proposed_discount?.alasan, "klien langganan");
});

test("gross-up 2,5%: net 3,5 jt → total 3.589.744", () => {
	const p = ok(
		plan({ layanan: [{ kategori: "videobooth_360", jam: 4 }], gross_up: true }),
	);
	assert.equal(p.gross_up_rate, 2.5);
	assert.equal(p.total, Math.round(3_500_000 / 0.975));
	assert.match(p.terms, /gross up 2,5%/);
});

test("berlaku 14 hari, S&K quotation lengkap", () => {
	const p = ok(plan({ layanan: [{ kategori: "videobooth_360", jam: 4 }] }));
	assert.equal(p.issued_at, "2026-09-27");
	assert.equal(p.valid_until, "2026-10-11");
	assert.match(p.terms, /berlaku 14 hari/);
	assert.match(p.terms, /DP minimal Rp 500\.000/);
	assert.match(p.terms, /Extend di hari H Rp 500\.000\/jam/);
});

test("add-on dari master + minimal order; klien organisasi → u.p.", () => {
	const p = ok(
		plan({
			klien: { nama: "Dimas", organisasi: "PT Maju" },
			layanan: [{ kategori: "videobooth_360", jam: 4 }],
			addons: [
				{ nama: "guest book", qty: 1 },
				{ addon_id: "22222222-2222-4222-8222-222222222222", qty: 20 },
			],
		}),
	);
	assert.equal(p.items[1].name, "Guest Books Photo");
	assert.equal(p.items[1].unit_price, 200_000);
	assert.equal(p.items[2].qty, 100);
	assert.equal(p.client.name, "PT Maju");
	assert.equal(p.client.attn, "Dimas");
});
