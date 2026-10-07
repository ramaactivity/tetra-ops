/**
 * Booking publik + portal klien — logika murni (tanpa I/O), dipakai server
 * action, halaman portal, dan test. Lihat docs/RENCANA-BOOKING-PORTAL.md.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";

// ── Katalog publik ──────────────────────────────────────────────────────────

export type PublicPackageRow = {
	category: string;
	frame_size: string | null;
	duration_hours: number;
	base_price: number;
	public_description: string | null;
	public_sort: number;
};

export type PublicAddonRow = {
	id: string;
	name: string;
	unit: string | null;
	price: number;
	min_qty: number | null;
};

/** Satu produk di halaman booking (mis. "Photobooth Cetak Classic"). */
export type CatalogProduct = {
	category: string;
	label: string;
	description: string | null;
	/** Pilihan ukuran cetak; kosong = produk tanpa frame (360, Photo Stage only, Magazine only). */
	frames: string[];
	options: Array<{ hours: number; price: number }>;
};

export const PRODUCT_LABELS: Record<string, string> = {
	photobooth_classic: "Photobooth Cetak Classic",
	videobooth_360: "360° Spin Videobooth",
	magazine_combo: "Magazine Box + Photobooth Classic",
	magazine_box_only: "Magazine Box Only",
	photostage_only: "Photo Stage Only",
	photostage_combo: "Photo Stage + Photobooth Classic",
};

const PRODUCT_ORDER = Object.keys(PRODUCT_LABELS);

/**
 * Kelompokkan paket per kategori × durasi. Harga per durasi sama untuk semua
 * ukuran (pricelist); kalau ternyata beda, ambil yang terendah — sama dengan
 * aturan resolveBasePrice untuk paket "durasi saja".
 */
export function groupCatalog(rows: PublicPackageRow[]): CatalogProduct[] {
	const byCat = new Map<string, PublicPackageRow[]>();
	for (const r of rows) {
		const list = byCat.get(r.category) ?? [];
		list.push(r);
		byCat.set(r.category, list);
	}
	return [...byCat.entries()]
		.map(([category, list]) => {
			const prices = new Map<number, number>();
			for (const r of list) {
				const cur = prices.get(r.duration_hours);
				if (cur === undefined || r.base_price < cur)
					prices.set(r.duration_hours, r.base_price);
			}
			const frames = [
				...new Set(
					list
						.map((r) => r.frame_size)
						.filter((f): f is string => !!f && f !== "none"),
				),
			].sort((a, b) => FRAME_ORDER.indexOf(a) - FRAME_ORDER.indexOf(b));
			return {
				category,
				label: PRODUCT_LABELS[category] ?? category,
				description:
					list.find((r) => r.public_description)?.public_description ?? null,
				frames,
				options: [...prices.entries()]
					.map(([hours, price]) => ({ hours, price }))
					.sort((a, b) => a.hours - b.hours),
				sort: Math.min(...list.map((r) => r.public_sort)),
			};
		})
		.sort(
			(a, b) =>
				a.sort - b.sort ||
				PRODUCT_ORDER.indexOf(a.category) - PRODUCT_ORDER.indexOf(b.category),
		)
		.map(({ sort: _s, ...p }) => p);
}

const FRAME_ORDER = ["2R", "4R", "polaroid"];

export const FRAME_LABELS: Record<string, string> = {
	"2R": "2R Photostrip",
	"4R": "4R",
	polaroid: "Polaroid",
};

// ── Pilihan klien & harga ───────────────────────────────────────────────────

export const SelectionSchema = z.object({
	category: z.string().min(2).max(40),
	hours: z.number().int().min(1).max(24),
	/** null = belum tahu ukurannya (boleh menyusul). */
	frame: z.enum(["2R", "4R", "polaroid"]).nullable(),
	units: z.number().int().min(1).max(3),
	addons: z
		.array(z.object({ id: z.uuid(), qty: z.number().int().min(1).max(5000) }))
		.max(20),
	date: z.iso.date(),
	/** null = jam belum pasti. */
	start: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
		.nullable(),
	city: z.string().trim().max(60).nullable(),
});
export type Selection = z.infer<typeof SelectionSchema>;

export type Quote =
	| {
			ok: true;
			base: number;
			addons: Array<{ id: string; name: string; qty: number; total: number }>;
			total: number;
			end: string | null;
	  }
	| { ok: false; error: string };

/** Hitung harga + validasi pilihan terhadap katalog publik. */
export function quoteSelection(
	sel: Selection,
	catalog: CatalogProduct[],
	addons: PublicAddonRow[],
): Quote {
	const product = catalog.find((p) => p.category === sel.category);
	if (!product) return { ok: false, error: "Paket tidak tersedia." };
	const opt = product.options.find((o) => o.hours === sel.hours);
	if (!opt)
		return { ok: false, error: "Durasi tidak tersedia untuk paket ini." };
	if (sel.frame && !product.frames.includes(sel.frame))
		return { ok: false, error: "Ukuran cetak tidak tersedia untuk paket ini." };
	const lines: Array<{ id: string; name: string; qty: number; total: number }> =
		[];
	for (const a of sel.addons) {
		const row = addons.find((r) => r.id === a.id);
		if (!row) return { ok: false, error: "Ada add-on yang tidak tersedia." };
		if (row.min_qty && a.qty < row.min_qty)
			return {
				ok: false,
				error: `${row.name} minimal ${row.min_qty} ${row.unit ?? ""}`.trim(),
			};
		lines.push({
			id: row.id,
			name: row.name,
			qty: a.qty,
			total: row.price * a.qty,
		});
	}
	const base = opt.price * sel.units;
	return {
		ok: true,
		base,
		addons: lines,
		total: base + lines.reduce((s, l) => s + l.total, 0),
		end: sel.start ? addHours(sel.start, sel.hours) : null,
	};
}

/** "19:00" + 3 jam → "22:00"; lewat tengah malam dipotong 23:59. */
export function addHours(hhmm: string, hours: number): string {
	const [h, m] = hhmm.split(":").map(Number);
	const total = Math.min(h * 60 + m + hours * 60, 23 * 60 + 59);
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** DP sah: minimal dpMin (atau total kalau tagihannya lebih kecil), maksimal total. */
export function validDp(
	amount: number,
	total: number,
	dpMin: number,
): string | null {
	const min = Math.min(dpMin, total);
	if (!Number.isInteger(amount) || amount < min)
		return `DP minimal Rp${min.toLocaleString("id-ID")}`;
	if (amount > total) return "Nominal melebihi total tagihan";
	return null;
}

// ── Kode & token ────────────────────────────────────────────────────────────

// Tanpa huruf/angka yang mirip (0/O, 1/I/L) supaya kode bisa dibaca & diketik.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomCode(len: number): string {
	let s = "";
	for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
	return s;
}

/** Kode verifikasi WA yang dikirim klien sendiri: "TP-8F3K2Q". */
export function newWaCode(): string {
	return `TP-${randomCode(6)}`;
}

/** Ambil kode verifikasi dari isi pesan WA (dipakai endpoint bot). */
export function extractWaCode(text: string): string | null {
	const m = /\bTP-([A-Z0-9]{6})\b/i.exec(text);
	return m ? `TP-${m[1].toUpperCase()}` : null;
}

export function newToken(): string {
	return randomBytes(32).toString("base64url");
}

export function sha256(v: string): string {
	return createHash("sha256").update(v).digest("hex");
}

// ── Detail acara (autosave) ─────────────────────────────────────────────────

const opt = (max: number) => z.string().trim().max(max).optional();

/** Field yang boleh diisi klien bertahap. Semua opsional; tiap simpan = patch. */
export const DetailSchema = z.object({
	nama_acara: opt(120),
	kategori: opt(40),
	pemilik_nama: opt(120),
	pemilik_wa: opt(20),
	venue_nama: opt(120),
	venue_alamat: opt(255),
	venue_kota: opt(60),
	maps_url: opt(500),
	pic_nama: opt(120),
	pic_wa: opt(20),
	catatan: opt(1000),
	/** Susunan acara dari klien; dibaca crew di hari H. */
	rundown: z
		.array(
			z.object({
				jam: z.string().trim().max(5),
				acara: z.string().trim().max(120),
			}),
		)
		.max(30)
		.optional(),
	/** Perkiraan jumlah tamu (diisi di langkah Acara). */
	jumlah_tamu: opt(10),
	/** Nama usaha WO/vendor yang memesan (booking lewat WO). */
	wo_nama: opt(120),
});
export type Detail = z.infer<typeof DetailSchema>;

// ── Pembatalan (DR-034) ─────────────────────────────────────────────────────

/** Selisih hari kalender dari `today` ke `eventDate` (yyyy-mm-dd). */
export function daysUntil(eventDate: string, today: string): number {
	return Math.round(
		(Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
			86_400_000,
	);
}

/**
 * Perkiraan uang kembali kalau KLIEN membatalkan — mengikuti kebijakan resmi
 * tetraphoto.com/kebijakan-refund (keputusan owner 7 Okt 2026, menggantikan
 * angka DR-034). DP selalu ditahan sebagai biaya pembatalan; yang bisa kembali
 * hanya pembayaran DI LUAR DP:
 *   lebih dari 14 hari sebelum acara : kembali penuh
 *   14 s/d 3 hari                     : kembali 50%
 *   kurang dari 3 hari                : tidak kembali
 * Hanya perkiraan untuk ditampilkan; refund dijalankan admin.
 */
export function refundEstimate(paidBeyondDp: number, days: number): number {
	if (paidBeyondDp <= 0 || days < 3) return 0;
	if (days > 14) return paidBeyondDp;
	return Math.floor(paidBeyondDp / 2);
}

/** Pindah tanggal (kebijakan website): diajukan paling lambat H-30, tanggal baru setelah hari ini. */
export function rescheduleError(
	newDate: string,
	original: string,
	today: string,
): string | null {
	if (daysUntil(original, today) < 30)
		return "Pindah tanggal paling lambat 30 hari sebelum acara. Hubungi admin lewat WhatsApp, ya.";
	if (newDate <= today) return "Tanggal baru minimal besok, ya.";
	return null;
}

/** Field wajib sebelum DP diajukan. Sisanya boleh menyusul. */
export function missingForDp(detail: Detail): string[] {
	const need: Array<["nama_acara" | "pemilik_nama" | "venue_nama", string]> = [
		["nama_acara", "Nama acara"],
		["pemilik_nama", "Nama pemilik acara"],
		["venue_nama", "Nama tempat acara"],
	];
	return need.filter(([k]) => !detail[k]?.trim()).map(([, label]) => label);
}

// ── Rundown → catatan crew ──────────────────────────────────────────────────

const RUNDOWN_PREFIX = "Rundown klien: ";

/**
 * Tulis ulang satu baris "Rundown klien: …" di catatan crew event, tanpa
 * menyentuh catatan lain yang ditulis owner. Rundown kosong = baris dihapus.
 */
export function withRundownLine(
	notes: string | null,
	rundown: Array<{ jam: string; acara: string }>,
): string | null {
	const keep = (notes ?? "")
		.split("\n")
		.filter((l) => !l.startsWith(RUNDOWN_PREFIX));
	const line = rundown
		.map((r) => `${r.jam} ${r.acara}`.trim())
		.filter(Boolean)
		.join("; ");
	if (line) keep.push(`${RUNDOWN_PREFIX}${line}`);
	const out = keep.join("\n").trim();
	return out || null;
}
