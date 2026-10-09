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
	/** Aturan pilih (lihat addonFits). null = add-on biasa. */
	addon_group?: string | null;
	/** Tier Guest Cam/cetak; null di grup guest_cam = tak terbatas. */
	max_guests?: number | null;
	print_size?: string | null;
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
	guest_cam: "Guest Cam (tanpa booth)",
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
/**
 * Aturan add-on per paket (owner 8 Okt 2026; DR-041 + DR-042):
 * - extend Rp500rb/jam paket 2 crew, Rp750rb/jam paket combo (3+ crew); Guest Cam saja tanpa extend booth;
 * - Guest Cam: pilih satu tier (wajib untuk paket Guest Cam saja); upsell hanya kalau ada tier;
 * - cetak foto tamu: tier sama dengan Guest Cam (tak terbatas → per 100); ukuran ikut cetakan booth;
 *   tanpa printer booth wajib + Print Station (Bogor / luar Bogor dari kota acara);
 * - TV Live Gallery butuh crew di lokasi (paket ber-crew atau Print Station).
 */
export const EXTEND_2_CREW = "Tambahan Durasi 1 Jam";
export const EXTEND_3_CREW = "Tambahan Durasi 1 Jam (3+ crew)";
export const GUEST_CAM_PKG = "guest_cam";
const COMBO = ["photostage_combo", "magazine_combo"];
const HAS_PRINTER = [
	"photobooth_classic",
	"photostage_combo",
	"magazine_combo",
];
/** Grup yang hanya boleh satu baris, qty 1 (cetak tier & per-100 satu keluarga). */
const SINGLE = ["guest_cam", "guest_print", "print_station", "tv"];
const family = (g: string | null | undefined) =>
	g === "guest_print_100" ? "guest_print" : (g ?? null);

export type AddonCtx = {
	category: string | null;
	/** Ukuran cetak paket (2R/4R/polaroid), null = belum/tidak ada. */
	frame: string | null;
	city: string | null;
	/** Add-on yang sedang dipilih (qty > 0). */
	chosen: PublicAddonRow[];
};

export const isBogor = (city: string | null) => /bogor/i.test(city ?? "");
const hasPrinter = (c: string | null) => HAS_PRINTER.includes(c ?? "");

/** Boleh tampil/dipesan di paket & pilihan ini? */
export function addonFits(a: PublicAddonRow, x: AddonCtx): boolean {
	const cat = x.category ?? "";
	const tier = x.chosen.find((c) => c.addon_group === "guest_cam");
	const print = x.chosen.some((c) => family(c.addon_group) === "guest_print");
	const station = x.chosen.some((c) => c.addon_group === "print_station");
	const sizeOk = () => !hasPrinter(cat) || !x.frame || a.print_size === x.frame;
	if (a.name === EXTEND_2_CREW)
		return !COMBO.includes(cat) && cat !== GUEST_CAM_PKG;
	if (a.name === EXTEND_3_CREW) return COMBO.includes(cat);
	switch (a.addon_group) {
		case "guest_cam":
			return true;
		case "guest_cam_extra":
			return !!tier;
		case "guest_print":
			return !!tier && tier.max_guests === a.max_guests && sizeOk();
		case "guest_print_100":
			return !!tier && tier.max_guests == null && sizeOk();
		case "print_station":
			return (
				!hasPrinter(cat) &&
				print &&
				a.name.endsWith("· Bogor") === isBogor(x.city)
			);
		case "print_station_extend":
			return station;
		case "tv":
			return (cat !== GUEST_CAM_PKG && cat !== "magazine_box_only") || station;
		default:
			return cat !== GUEST_CAM_PKG;
	}
}

/** Jumlah maksimal per add-on (null = bebas). */
export const addonMax = (a: PublicAddonRow): number | null =>
	SINGLE.includes(a.addon_group ?? "") ? 1 : null;

/** Pilihan yang dilepas saat `a` dipilih (satu keluarga hanya satu baris). */
export const addonSiblings = (a: PublicAddonRow, all: PublicAddonRow[]) => {
	const f = family(a.addon_group);
	return f && SINGLE.includes(f)
		? all.filter((o) => o.id !== a.id && family(o.addon_group) === f)
		: [];
};

/**
 * Add-on yang tampil & yang benar-benar terpilih setelah aturan berantai
 * (tier dilepas → cetak gugur → Print Station gugur). Dipakai wizard.
 */
export function settleAddons(
	all: PublicAddonRow[],
	isOn: (a: PublicAddonRow) => boolean,
	x: Omit<AddonCtx, "chosen">,
): { visible: PublicAddonRow[]; chosen: PublicAddonRow[] } {
	let chosen = all.filter(isOn);
	for (let i = 0; i < 5; i++) {
		const next = chosen.filter((a) => addonFits(a, { ...x, chosen }));
		if (next.length === chosen.length) break;
		chosen = next;
	}
	return {
		visible: all.filter((a) => addonFits(a, { ...x, chosen })),
		chosen,
	};
}

/**
 * Pilih/ubah satu add-on → patch jumlah (0 = lepas). Dipakai wizard & form admin:
 * satu keluarga satu pilihan, ganti tier memindahkan cetak ke tier baru (ukuran
 * sama), cetak tanpa printer booth ikut memilih Print Station sesuai kota.
 */
export function pickAddon(
	all: PublicAddonRow[],
	qtyOf: (id: string) => number,
	id: string,
	n: number,
	x: Omit<AddonCtx, "chosen">,
): Record<string, number> {
	const a = all.find((r) => r.id === id);
	if (!a) return {};
	const max = addonMax(a);
	const qty = Math.max(0, max === null ? n : Math.min(max, n));
	const patch: Record<string, number> = { [id]: qty };
	for (const o of addonSiblings(a, all)) patch[o.id] = 0;
	if (qty === 0) return patch;
	const before = settleAddons(all, (r) => qtyOf(r.id) > 0, x).chosen;
	const oldPrint = before.find((r) => family(r.addon_group) === "guest_print");
	if (a.addon_group === "guest_cam" && oldPrint) {
		const np = all.find(
			(r) =>
				r.print_size === oldPrint.print_size &&
				(a.max_guests == null
					? r.addon_group === "guest_print_100"
					: r.addon_group === "guest_print" && r.max_guests === a.max_guests),
		);
		patch[oldPrint.id] = 0;
		if (np) patch[np.id] = 1;
	}
	const after = settleAddons(all, (r) => (patch[r.id] ?? qtyOf(r.id)) > 0, x);
	const station = after.visible.find((r) => r.addon_group === "print_station");
	if (station && !after.chosen.some((r) => r.addon_group === "print_station"))
		patch[station.id] = 1;
	return patch;
}

/** Aturan lintas add-on untuk server; null = lolos. */
export function addonRuleError(
	chosen: PublicAddonRow[],
	x: Omit<AddonCtx, "chosen">,
): string | null {
	const ctx = { ...x, chosen };
	for (const a of chosen)
		if (!addonFits(a, ctx))
			return `${a.name} tidak tersedia untuk pilihan ini.`;
	for (const f of SINGLE)
		if (chosen.filter((a) => family(a.addon_group) === f).length > 1)
			return "Ada pilihan yang hanya boleh satu (Guest Cam, cetak, Print Station, atau TV).";
	if (
		x.category === GUEST_CAM_PKG &&
		!chosen.some((a) => a.addon_group === "guest_cam")
	)
		return "Pilih jumlah tamu Guest Cam dulu.";
	if (
		!hasPrinter(x.category) &&
		chosen.some((a) => family(a.addon_group) === "guest_print") &&
		!chosen.some((a) => a.addon_group === "print_station")
	)
		return "Cetak foto tamu tanpa photobooth perlu Print Station.";
	return null;
}

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
		const max = addonMax(row);
		if (max !== null && a.qty > max)
			return { ok: false, error: `${row.name} maksimal ${max}.` };
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
	const ruleErr = addonRuleError(
		sel.addons
			.map((a) => addons.find((r) => r.id === a.id))
			.filter((r): r is PublicAddonRow => !!r),
		{ category: sel.category, frame: sel.frame, city: sel.city },
	);
	if (ruleErr) return { ok: false, error: ruleErr };
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
export const INSTAGRAM_MAX = 6;

/**
 * "@rina, instagram.com/dimas_ok  @wo.bahagia" → ["rina","dimas_ok","wo.bahagia"].
 * Pemisah koma/spasi/baris; link instagram.com dibuang; karakter tak sah
 * membuat handle diabaikan; unik, maks 6 (kontrak Booth v0.7).
 */
export function parseInstagram(text: string): string[] {
	const out: string[] = [];
	for (const raw of text.split(/[\s,]+/)) {
		const h = raw
			.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
			.replace(/^@/, "")
			.replace(/[/?#].*$/, "");
		if (
			/^[A-Za-z0-9._]{1,30}$/.test(h) &&
			!out.some((x) => x.toLowerCase() === h.toLowerCase())
		)
			out.push(h);
	}
	return out.slice(0, INSTAGRAM_MAX);
}

export const STAGE_GROUPS_MAX = 300;
export const STAGE_GROUP_MAX_LEN = 120;

/** Teks "satu grup per baris" → daftar rapi (baris kosong dibuang, dipotong ke batas kontrak Booth). */
export function parseStageGroups(text: string): string[] {
	return text
		.split("\n")
		.map((l) => l.trim().slice(0, STAGE_GROUP_MAX_LEN))
		.filter(Boolean)
		.slice(0, STAGE_GROUPS_MAX);
}

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
	/** Email pemesan (untuk invoice & kuitansi). */
	email: opt(120),
	/** Backdrop: tetra (kain Basic) | client | later. */
	backdrop: opt(10),
	/** Warna kain Basic kalau backdrop = tetra, mis. "Emerald Green". */
	backdrop_warna: opt(20),
	/** Izin foto acara dipakai untuk portofolio Tetra (opsional). */
	izin_portofolio: z.boolean().optional(),
	/** Akun Instagram klien (tanpa @) → Booth `client_instagram`, tampil di halaman foto tamu. */
	instagram: z
		.array(z.string().regex(/^[A-Za-z0-9._]{1,30}$/))
		.max(INSTAGRAM_MAX)
		.optional(),
	/** v0.9: id desain kartu QR Guest Cam dari katalog Booth → `guest_card_design`. */
	guest_card_design: z
		.string()
		.regex(/^[a-z0-9_-]{1,30}$/)
		.optional(),
	/** Urutan grup foto pelaminan (modul Photo Stage) → Booth `stage_groups`. */
	stage_groups: z
		.array(z.string().trim().min(1).max(STAGE_GROUP_MAX_LEN))
		.max(STAGE_GROUPS_MAX)
		.optional(),
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

// ── Kode promo tamu (kontrak Booth v0.8) ────────────────────────────────────

export type PromoDiscount =
	| { type: "percent"; value: number; max_idr: number | null }
	| { type: "amount"; value: number }
	| { type: "item"; item: string };

/**
 * Potongan rupiah dari total sebelum DP. Bonus "item" = Rp0 (dicatat sebagai
 * item gratis). Total di bawah `minIdr` → tidak berlaku.
 */
export function promoDiscount(
	d: PromoDiscount,
	total: number,
	minIdr: number | null,
): { ok: true; idr: number } | { ok: false; reason: "min_total" } {
	if (minIdr && total < minIdr) return { ok: false, reason: "min_total" };
	if (d.type === "item") return { ok: true, idr: 0 };
	const raw =
		d.type === "percent" ? Math.floor((total * d.value) / 100) : d.value;
	const capped =
		d.type === "percent" && d.max_idr ? Math.min(raw, d.max_idr) : raw;
	return { ok: true, idr: Math.max(0, Math.min(capped, total)) };
}

/** Normalisasi input kode: "tamu-7kq2m " → "TAMU-7KQ2M". null kalau formatnya salah. */
export function normPromo(raw: string): string | null {
	const c = raw.trim().toUpperCase().replace(/\s+/g, "");
	return /^[A-Z]{2,10}-[A-Z0-9]{4,12}$/.test(c) ? c : null;
}

/** Perintah bot `send-grup-admin` (kontrak bot 1470ab6): baris kosong dibuang, maks 2000 karakter. */
export function adminGroupCommand(lines: string[]): string {
	const pesan = lines.filter(Boolean).join("\n").slice(0, 2000);
	return `send-grup-admin:${JSON.stringify({ pesan })}`;
}

// ── Dashboard bersama WO ↔ klien (owner 9 Okt 2026) ─────────────────────────

/** Siapa yang membayar ke Tetra di booking yang ada WO/vendor-nya. */
export type Payer = "klien" | "wo";

/** klien bayar penuh ke Tetra = komisi dibayar Tetra; WO yang bayar = potongan langsung. */
export const commissionModeOf = (p: Payer) =>
	p === "wo" ? "upfront_cut" : "commission";
export const payerFromCommissionMode = (m: string | null | undefined) =>
	m === "upfront_cut" ? "wo" : m === "commission" ? "klien" : null;

/**
 * Hak lihat & bayar per peran. Tanpa WO: pemilik acara tidak melihat uang.
 * Dengan WO: yang membayar ke Tetra (klien atau WO) yang melihat & membayar
 * tagihan; WO selalu melihat; klien undangan WO melihat harga hanya kalau WO
 * mengizinkan. Pembayar belum diatur → WO yang menangani + diminta setup.
 */
export function portalAccess(x: {
	role: "pemesan" | "pemilik" | "wo";
	hasWo: boolean;
	payer: Payer | null;
	priceVisible: boolean;
}): { canPay: boolean; seeMoney: boolean; needsSetup: boolean } {
	if (!x.hasWo) {
		const canPay = x.role !== "pemilik";
		return { canPay, seeMoney: canPay, needsSetup: false };
	}
	const canPay = x.payer === "klien" ? x.role !== "wo" : x.role === "wo";
	return {
		canPay,
		seeMoney: canPay || x.role === "wo" || x.priceVisible,
		needsSetup: x.role === "wo" && x.payer === null,
	};
}
