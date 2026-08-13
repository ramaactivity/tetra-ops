import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	looksLikeFullAddress,
	parseIndonesianAddress,
} from "@/lib/geo/parse-address";

describe("parseIndonesianAddress", () => {
	it("memecah format baku Google", () => {
		const r = parseIndonesianAddress(
			"Jl. Raya Kalimulya No.30, Jatimulya, Kec. Cilodong, Kota Depok, Jawa Barat 16413",
		);
		assert.equal(
			r.address,
			"Jl. Raya Kalimulya No.30, Jatimulya, Kec. Cilodong",
		);
		assert.equal(r.city, "Kota Depok");
		assert.equal(r.province, "Jawa Barat");
		assert.equal(r.postcode, "16413");
	});

	it("memanjangkan singkatan kota Google", () => {
		const r = parseIndonesianAddress(
			"Jl. Jenderal Sudirman KM. 34, Harapan Mulya, Kec. Medan Satria, Kota Bks, Jawa Barat 17143",
		);
		assert.equal(r.city, "Kota Bekasi");
		assert.equal(r.province, "Jawa Barat");
	});

	it("menerima kota tanpa awalan Kota/Kabupaten", () => {
		const r = parseIndonesianAddress(
			"Jl. Dr. Sumeru No.35, Menteng, Bogor Barat, Bogor, Jawa Barat 16111",
		);
		assert.equal(r.city, "Bogor");
		assert.equal(r.address, "Jl. Dr. Sumeru No.35, Menteng, Bogor Barat");
	});

	it("menormalkan variasi nama Jakarta & Yogyakarta", () => {
		assert.equal(
			parseIndonesianAddress(
				"Jl. Sudirman No.1, Karet Tengsin, Kec. Tanah Abang, Kota Jakarta Pusat, Daerah Khusus Ibukota Jakarta 10220",
			).province,
			"DKI Jakarta",
		);
		assert.equal(
			parseIndonesianAddress(
				"Jl. Malioboro No.16, Suryatmajan, Kec. Danurejan, Kota Yogyakarta, Daerah Istimewa Yogyakarta 55213",
			).province,
			"DI Yogyakarta",
		);
	});

	it("mengabaikan ekor 'Indonesia'", () => {
		const r = parseIndonesianAddress(
			"Jl. Merdeka No.5, Cibeureum, Kec. Cisarua, Kabupaten Bogor, Jawa Barat 16750, Indonesia",
		);
		assert.equal(r.city, "Kabupaten Bogor");
		assert.equal(r.address, "Jl. Merdeka No.5, Cibeureum, Kec. Cisarua");
	});

	it("menyerah (semua null) kalau bukan alamat Indonesia", () => {
		const r = parseIndonesianAddress("Gedung serbaguna dekat pasar");
		assert.equal(r.province, null);
		assert.equal(r.address, null);
		assert.equal(looksLikeFullAddress("Gedung serbaguna dekat pasar"), false);
	});

	it("tidak tertipu nama provinsi di nama jalan", () => {
		const r = parseIndonesianAddress(
			"Jl. Jawa Barat No.2, Kayuringin Jaya, Kec. Bekasi Selatan, Kota Bekasi, Jawa Barat 17144",
		);
		assert.equal(r.city, "Kota Bekasi");
		assert.equal(
			r.address,
			"Jl. Jawa Barat No.2, Kayuringin Jaya, Kec. Bekasi Selatan",
		);
	});
});
