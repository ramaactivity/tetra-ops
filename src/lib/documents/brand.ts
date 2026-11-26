import { LOGO_BLACK_DATA_URL, LOGO_CREAM_DATA_URL } from "./logo-swiss-data";
import {
	TV_LOGO_BLACK_DATA_URL,
	TV_LOGO_CREAM_DATA_URL,
} from "./logo-tetra-visual-data";
import { COMPANY } from "./types";

/**
 * Identitas merek di PDF dokumen (DR-067). Tetra Photobooth = bawaan semua
 * dokumen Tetra Ops; Tetra Visual hanya lewat API render (mesin cetak) —
 * datanya dikelola dashboard Tetra Visual, tidak masuk buku Tetra Ops.
 */
export type PdfBrand = {
	key: BrandKey;
	name: string;
	city: string;
	email: string;
	instagram: string;
	whatsapp: string;
	logoBlack: string;
	logoCream: string;
};

export const BRAND_KEYS = ["tetra_photobooth", "tetra_visual"] as const;
export type BrandKey = (typeof BRAND_KEYS)[number];

export const BRANDS: Record<BrandKey, PdfBrand> = {
	tetra_photobooth: {
		key: "tetra_photobooth",
		...COMPANY,
		logoBlack: LOGO_BLACK_DATA_URL,
		logoCream: LOGO_CREAM_DATA_URL,
	},
	// Sumber: tetra-visual/src/data/site.ts (satu-satunya sumber kontak TV).
	tetra_visual: {
		key: "tetra_visual",
		name: "Tetra Visual",
		city: "Bogor, Indonesia",
		email: "visualtetra@gmail.com",
		instagram: "@tetra.visual",
		whatsapp: "0896-1138-4767",
		logoBlack: TV_LOGO_BLACK_DATA_URL,
		logoCream: TV_LOGO_CREAM_DATA_URL,
	},
};
