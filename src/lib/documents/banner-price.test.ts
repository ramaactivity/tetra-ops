import assert from "node:assert/strict";
import { test } from "node:test";
import {
	bannerIncludes,
	bannerItemName,
	bannerPrice,
	bannerPricingFromConfig,
	isBannerItem,
	parseBannerSize,
	withBannerSize,
} from "./banner-price";

test("rumus banner: HPP + markup, dibulatkan ke atas", () => {
	assert.deepEqual(bannerPrice(230, 230), {
		areaM2: 5.29,
		hpp: 238_050,
		recommended: 400_000,
	});
	assert.equal(bannerPrice(300, 250).recommended, 500_000); // 337.500 + 150.000
	assert.equal(bannerPrice(200, 200).recommended, 350_000); // 180.000 + 150.000 pas
	assert.equal(bannerPrice(0, 230).recommended, 150_000);
});

test("angka rumus dari system_config; nilai rusak pakai default", () => {
	const cfg = bannerPricingFromConfig([
		{ key: "banner_rate_per_m2", value: 50000 },
		{ key: "banner_markup", value: "ngawur" },
		{ key: "banner_round_to", value: 25000 },
	]);
	assert.deepEqual(cfg, {
		ratePerM2: 50_000,
		markup: 150_000,
		roundTo: 25_000,
	});
	assert.equal(bannerPrice(230, 230, cfg).recommended, 425_000); // 264.500+150.000=414.500
});

test("ukuran dari nama item", () => {
	assert.deepEqual(parseBannerSize("Cetak Backdrop Banner 230×230"), {
		w: 230,
		h: 230,
	});
	assert.deepEqual(parseBannerSize("banner 300 x 250 cm"), { w: 300, h: 250 });
	assert.equal(parseBannerSize("Cetak Backdrop Banner"), null);
	assert.equal(
		isBannerItem("Cetak Backdrop Banner 230×230 (desain dari klien)"),
		true,
	);
	assert.equal(isBannerItem("Bannerless"), false);
	assert.equal(bannerItemName(300, 250), "Cetak Backdrop Banner 300×250");
});

test("ganti ukuran di nama & rincian", () => {
	assert.equal(
		withBannerSize(
			"Cetak Backdrop Banner 230×230 (desain dari klien)",
			300,
			250,
		),
		"Cetak Backdrop Banner 300×250 (desain dari klien)",
	);
	assert.equal(
		withBannerSize("Ongkir banner dari percetakan", 300, 250),
		"Ongkir banner dari percetakan",
	);
	assert.match(bannerIncludes(300, 250)[0], /^Cetak banner 300×250 bahan doff/);
});
