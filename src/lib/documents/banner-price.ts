/**
 * Harga rekomendasi cetak banner backdrop ukuran bebas (owner 18 Nov 2026,
 * rumus masih coba-coba → angkanya di system_config, bisa diubah di
 * Pengaturan › Sistem):
 *   HPP   = luas (m²) × tarif percetakan per m² (Laku Print, selongsong termasuk)
 *   harga = HPP + markup (GoSend dari percetakan + handling + pasang tripod),
 *           dibulatkan KE ATAS ke kelipatan `roundTo`.
 * Contoh 230×230: 5,29 m² × 45.000 = 238.050 + 150.000 = 388.050 → 400.000.
 * HPP internal — jangan pernah tampil ke klien/crew.
 */
export type BannerPricing = {
	ratePerM2: number;
	markup: number;
	roundTo: number;
};

export const BANNER_PRICING_DEFAULT: BannerPricing = {
	ratePerM2: 45_000,
	markup: 150_000,
	roundTo: 50_000,
};

/** Kunci system_config ↔ field BannerPricing. */
export const BANNER_PRICING_KEYS = {
	banner_rate_per_m2: "ratePerM2",
	banner_markup: "markup",
	banner_round_to: "roundTo",
} as const satisfies Record<string, keyof BannerPricing>;

export function bannerPricingFromConfig(
	rows: ReadonlyArray<{ key: string; value: unknown }>,
): BannerPricing {
	const cfg = { ...BANNER_PRICING_DEFAULT };
	for (const r of rows) {
		const field =
			BANNER_PRICING_KEYS[r.key as keyof typeof BANNER_PRICING_KEYS];
		const n = Number(r.value);
		if (field && Number.isFinite(n) && n >= 0) cfg[field] = n;
	}
	return cfg;
}

export function bannerPrice(
	widthCm: number,
	heightCm: number,
	cfg: BannerPricing = BANNER_PRICING_DEFAULT,
): { areaM2: number; hpp: number; recommended: number } {
	const areaM2 = (Math.max(0, widthCm) * Math.max(0, heightCm)) / 10_000;
	const hpp = Math.round(areaM2 * cfg.ratePerM2);
	const raw = hpp + cfg.markup;
	const step = cfg.roundTo > 0 ? cfg.roundTo : 1;
	return { areaM2, hpp, recommended: Math.ceil(raw / step) * step };
}

/** "Cetak Backdrop Banner 230×230" → { w: 230, h: 230 }. */
export function parseBannerSize(name: string): { w: number; h: number } | null {
	const m = /(\d{2,4})\s*[x×]\s*(\d{2,4})/i.exec(name);
	return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

export function isBannerItem(name: string): boolean {
	return /\bbanner\b/i.test(name);
}

/** Nama item standar untuk ukuran tertentu. */
export function bannerItemName(w: number, h: number): string {
	return `Cetak Backdrop Banner ${w}×${h}`;
}

/** Rincian standar item banner (kalimat klien — tanpa nama/harga vendor). */
export function bannerIncludes(w: number, h: number): string[] {
	return [
		`Cetak banner ${w}×${h} bahan doff (tidak memantulkan cahaya), sudah pakai selongsong`,
		"Ongkir banner dari percetakan",
		"Pemasangan di hari H dengan stand banner tripod dari Tetra",
	];
}

/** Ganti ukuran "230×230" di teks dengan ukuran baru (nama item / rincian). */
export function withBannerSize(text: string, w: number, h: number): string {
	return text.replace(/(\d{2,4})\s*[x×]\s*(\d{2,4})/i, `${w}×${h}`);
}
