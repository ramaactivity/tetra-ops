/**
 * Rekanan daftar sendiri / diundang bot WA (DR-050) — bagian murni: isian,
 * pencocokan nomor, dan kode error untuk API bot. Dipakai halaman
 * /rekanan/daftar, POST /api/bot/undang-vendor, dan test.
 */
import { z } from "zod";

export const JENIS_REKANAN = {
	wo: "Wedding Organizer",
	eo: "Event Organizer",
	venue: "Venue",
	vendor: "Vendor lain",
} as const;
export type JenisRekanan = keyof typeof JENIS_REKANAN;

export const SignupSchema = z.object({
	nama_usaha: z.string().trim().min(2, "Nama usaha minimal 2 huruf").max(80),
	jenis: z.enum(["wo", "eo", "venue", "vendor"], {
		error: "Pilih jenis usaha",
	}),
	nama_pic: z.string().trim().min(2, "Nama PIC minimal 2 huruf").max(80),
	phone: z.string().trim().min(8, "Nomor WhatsApp belum benar").max(20),
	kota: z.string().trim().max(60).nullish(),
	instagram: z.string().trim().max(60).nullish(),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export type SignupError =
	| "input_tidak_valid"
	| "nomor_tidak_valid"
	| "nomor_tim"
	| "portal_dimatikan"
	| "gagal";

/** 9 digit terakhir — cara repo ini mencocokkan nomor (08…, 62…, +62…). */
export const phoneTail = (x: string | null | undefined) =>
	(x ?? "").replace(/\D/g, "").slice(-9);

export const samePhone = (
	a: string | null | undefined,
	b: string | null | undefined,
) => {
	const t = phoneTail(a);
	return t.length === 9 && t === phoneTail(b);
};

/** "@tetra.photo", "instagram.com/tetra.photo/" → "tetra.photo". */
export function cleanInstagram(raw: string | null | undefined): string | null {
	const s = (raw ?? "")
		.trim()
		.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
		.replace(/^@/, "")
		.replace(/[/?#].*$/, "");
	return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : null;
}

/** Nama usaha untuk pencocokan longgar ("CV. Partner  Organizer" = "partner organizer"). */
export const normName = (s: string) =>
	s
		.toLowerCase()
		.replace(/\b(cv|pt|ud)\.?\s+/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
