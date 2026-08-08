import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	durationOptions,
	type PackageLike,
	packageFitsFrame,
	resolvePackage,
	serviceNeedsFrame,
	swapPackageFrame,
} from "@/lib/events/frame-package";
import { listMissingFields } from "@/lib/events/tbc";

/**
 * Kasus uji diambil dari kejadian nyata 8 Agustus 2026: event tercatat frame
 * size "menyusul" tapi paketnya "2R Unlimited 2 Jam", klien ternyata pesan 4R.
 * Semua tes di bawah menjaga agar kombinasi itu tidak bisa terbentuk lagi.
 */

const CATALOG: PackageLike[] = [
	{
		id: "p2r2",
		name: "2R Unlimited 2 Jam",
		category: "photobooth_classic",
		frame_size: "2R",
		duration_hours: 2,
		base_price: 2_000_000,
	},
	{
		id: "p4r2",
		name: "4R Unlimited 2 Jam",
		category: "photobooth_classic",
		frame_size: "4R",
		duration_hours: 2,
		base_price: 2_000_000,
	},
	{
		id: "ppol2",
		name: "Polaroid Unlimited 2 Jam",
		category: "photobooth_classic",
		frame_size: "polaroid",
		duration_hours: 2,
		base_price: 2_000_000,
	},
	{
		id: "p2r3",
		name: "2R Unlimited 3 Jam",
		category: "photobooth_classic",
		frame_size: "2R",
		duration_hours: 3,
		base_price: 2_500_000,
	},
	{
		id: "vb2",
		name: "Videobooth 360 - 2 Jam",
		category: "videobooth_360",
		frame_size: "none",
		duration_hours: 2,
		base_price: 2_500_000,
	},
];

describe("packageFitsFrame", () => {
	it("menolak paket ber-ukuran saat frame event masih menyusul", () => {
		assert.equal(packageFitsFrame("2R", null), false);
		assert.equal(packageFitsFrame("2R", ""), false);
	});

	it("menolak paket yang ukurannya beda dari frame event", () => {
		assert.equal(packageFitsFrame("2R", "4R"), false);
	});

	it("menerima ukuran yang sama, dan paket tanpa cetak frame", () => {
		assert.equal(packageFitsFrame("2R", "2R"), true);
		assert.equal(packageFitsFrame("none", null), true);
		assert.equal(packageFitsFrame("none", "4R"), true);
	});
});

describe("durationOptions", () => {
	it("meringkas katalog jadi pilihan durasi saat ukuran belum pasti", () => {
		const opts = durationOptions(CATALOG, "photobooth_classic");
		assert.deepEqual(
			opts.map((o) => o.hours),
			[2, 3],
		);
		// Harga per durasi sama untuk semua ukuran → nominal booking tidak
		// berubah saat paket dikunci nanti. Ini alasan mode durasi boleh ada.
		assert.equal(opts[0].price, 2_000_000);
		assert.equal(opts[0].priceVaries, false);
		assert.deepEqual(opts[0].frames.sort(), ["2R", "4R", "polaroid"]);
	});

	it("tidak menawarkan durasi untuk service tanpa cetak frame", () => {
		assert.deepEqual(durationOptions(CATALOG, "videobooth_360"), []);
	});
});

describe("serviceNeedsFrame", () => {
	it("photobooth classic butuh ukuran, videobooth tidak", () => {
		assert.equal(serviceNeedsFrame(CATALOG, "photobooth_classic"), true);
		assert.equal(serviceNeedsFrame(CATALOG, "videobooth_360"), false);
	});
});

describe("resolvePackage & swapPackageFrame", () => {
	it("mengunci durasi sementara jadi paket konkret begitu ukuran pasti", () => {
		const pkg = resolvePackage(CATALOG, "photobooth_classic", 2, "4R");
		assert.equal(pkg?.id, "p4r2");
	});

	it("ganti ukuran menukar paket ke padanannya, durasi dipertahankan", () => {
		const swapped = swapPackageFrame(CATALOG, "p2r3", "2R");
		assert.equal(swapped?.id, "p2r3");
		const toPolaroid = swapPackageFrame(CATALOG, "p2r2", "polaroid");
		assert.equal(toPolaroid?.id, "ppol2");
	});

	it("tidak ada padanan (mis. 3 jam polaroid) → paket harus dilepas", () => {
		assert.equal(swapPackageFrame(CATALOG, "p2r3", "polaroid"), null);
	});

	it("ukuran dikosongkan lagi → paket ber-ukuran dilepas", () => {
		assert.equal(swapPackageFrame(CATALOG, "p2r2", null), null);
	});

	it("paket tanpa cetak frame tidak terpengaruh ganti ukuran", () => {
		assert.equal(swapPackageFrame(CATALOG, "vb2", null)?.id, "vb2");
	});
});

describe("listMissingFields", () => {
	const lengkap = {
		event_date_is_estimate: false,
		venue_name: "Resto Raja Sunda",
		start_time: "11:00",
		frame_size: "2R",
		backdrop_id: "b1",
		pic_name: "Dea",
		pic_wa: "0899",
		pending_package_hours: null,
		package_frame_size: "2R",
	};

	it("event lengkap tidak melaporkan apa pun", () => {
		assert.deepEqual(listMissingFields(lengkap), []);
	});

	it("menyebut frame size berikut status paketnya saat durasi sudah disepakati", () => {
		const missing = listMissingFields({
			...lengkap,
			frame_size: null,
			package_frame_size: null,
			pending_package_hours: 2,
		});
		assert.deepEqual(missing, ["frame size — paket masih 2 jam tanpa ukuran"]);
	});

	it("paket tanpa cetak frame tidak dituduh kurang ukuran", () => {
		assert.deepEqual(
			listMissingFields({
				...lengkap,
				frame_size: null,
				package_frame_size: "none",
			}),
			[],
		);
	});

	it("ukuran sudah pasti tapi paket sementara belum dikunci → tetap dilaporkan", () => {
		assert.deepEqual(
			listMissingFields({ ...lengkap, pending_package_hours: 2 }),
			["paket final (ukuran sudah pasti, paket belum dikunci)"],
		);
	});
});
