/**
 * Tipe + konstanta Pusat Dokumen (quotation / invoice / kuitansi / nota lunas /
 * BAST). Modul biasa (bukan "use server") supaya konstanta bisa diimpor dari
 * client component maupun server action.
 */

export const DOC_TYPES = [
	"quotation",
	"invoice",
	"receipt",
	"nota_lunas",
	"bast",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_STATUSES = [
	"draft",
	"sent",
	"accepted",
	"rejected",
	"void",
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/** Prefix nomor per jenis: QUO-TP-12-23092026 */
export const DOC_PREFIX: Record<DocType, string> = {
	quotation: "QUO",
	invoice: "INV",
	receipt: "KWT",
	nota_lunas: "NOTA",
	bast: "BAST",
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
	quotation: "Quotation",
	invoice: "Invoice",
	receipt: "Kuitansi",
	nota_lunas: "Nota Lunas",
	bast: "BAST",
};

/** Judul besar di PDF. */
export const DOC_TITLE: Record<DocType, string> = {
	quotation: "QUOTATION",
	invoice: "INVOICE",
	receipt: "KUITANSI",
	nota_lunas: "NOTA LUNAS",
	bast: "BERITA ACARA SERAH TERIMA",
};

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
	draft: "Draft",
	sent: "Terkirim",
	accepted: "Disetujui",
	rejected: "Ditolak",
	void: "Dibatalkan",
};

export type DocClient = {
	/** Klien yang ditagih: perusahaan/instansi, atau pengantin/perorangan. */
	name: string;
	/** Lama: instansi terpisah dari nama. Dokumen baru memakai name + attn. */
	org?: string | null;
	/** Pembooking / contact person — dicetak "u.p. …". */
	attn?: string | null;
	phone?: string | null;
	email?: string | null;
	address?: string | null;
};

export type DocEventInfo = {
	/** Nama acara, mis. "Annual Gathering 2026". */
	title?: string | null;
	/** yyyy-MM-dd */
	date?: string | null;
	/** "10:00–14:00" bebas */
	time?: string | null;
	venue?: string | null;
	city?: string | null;
};

export type DocItem = {
	name: string;
	includes: string[];
	qty: number;
	unit_price: number;
	package_id?: string | null;
	addon_id?: string | null;
	/** Harga wajib diisi Rama sebelum dokumen boleh dikirim (transport luar
	 *  Jabodetabek / Magazine Box, backdrop Luxury). unit_price 0 = belum. */
	needs_admin_price?: boolean;
};

/** Usulan diskon agent — TIDAK masuk total sampai Rama menerapkannya. */
export type ProposedDiscount = {
	persen?: number | null;
	nominal?: number | null;
	alasan: string;
};

export type DocumentRow = {
	id: string;
	doc_type: DocType;
	doc_number: string;
	event_id: string | null;
	payment_id: string | null;
	source_document_id: string | null;
	client: DocClient;
	event_info: DocEventInfo;
	items: DocItem[];
	discount: number;
	gross_up_enabled: boolean;
	gross_up_rate: number;
	notes: string | null;
	terms: string | null;
	signer_id: string | null;
	signer_name: string | null;
	signer_position: string | null;
	issued_at: string;
	due_date: string | null;
	valid_until: string | null;
	status: DocStatus;
	/** Benar-benar sampai ke klien (bot WA / tandai manual) — beda dari status. */
	delivered_at?: string | null;
	delivered_via?: "wa_bot" | "manual" | null;
	proposed_discount?: ProposedDiscount | null;
	/** Asal draft agent: { jenis: "wa_bot" | "telegram", wa_jid?, lead_id? }. */
	origin?: Record<string, unknown> | null;
	external_id?: string | null;
	created_at: string;
	updated_at: string;
};

/** Item harga-admin yang belum diisi → dokumen belum boleh dikirim. */
export function pendingAdminItems(items: DocItem[]): string[] {
	return items
		.filter((i) => i.needs_admin_price && !(i.unit_price > 0))
		.map((i) => i.name);
}

export type DocumentSigner = {
	id: string;
	name: string;
	position: string;
	signature_data: string | null;
	is_default: boolean;
	sort_order: number;
	is_active: boolean;
};

/** Identitas usaha yang tercetak di dokumen. */
export const COMPANY = {
	name: "Tetra Photobooth",
	owner: "Muhamad Ramadan Saputra",
	city: "Bogor, Indonesia",
	email: "tetraphotobooth@gmail.com",
	instagram: "@tetraphotobooth",
	whatsapp: "0852-1352-6630",
} as const;

/** Syarat & ketentuan baku. Kalimat pajak menyesuaikan toggle gross-up. */
/** Pilihan jatuh tempo relatif ke tanggal acara (chip di editor). Default H-1. */
export const DUE_PRESETS = [1, 3, 7] as const;

export function defaultTerms(
	docType: DocType,
	grossUp: boolean,
	hMinus: number = 1,
	grossUpRate: number = GROSS_UP_RATE_DEFAULT,
): string {
	const rate = String(grossUpRate).replace(".", ",");
	const tax = grossUp
		? `Harga belum termasuk pajak (PPN/PPh) karena Tetra merupakan usaha perorangan non-PKP. Karena pajak dicantumkan atas permintaan klien, nilai di-gross up ${rate}% sehingga setelah dipotong pajak jumlah yang diterima Tetra tetap sesuai nominal dasar. Pajak ditanggung pihak penyelenggara sesuai ketentuan yang berlaku.`
		: "Harga belum termasuk pajak (PPN/PPh) karena Tetra merupakan usaha perorangan non-PKP.";
	if (docType === "quotation") {
		// Keputusan Rama 27 Sep 2026.
		return [
			`Harga berlaku ${QUOTATION_VALID_DAYS} hari sejak tanggal penawaran.`,
			"Tanggal acara terkunci setelah DP minimal Rp 500.000 diterima.",
			`Pelunasan paling lambat H-${hMinus} sebelum acara.`,
			"Pembatalan setelah DP: DP hangus sebagai biaya pembatalan.",
			"Extend di hari H Rp 500.000/jam (Photobooth Classic & Videobooth 360).",
			"Transport gratis se-Jabodetabek, kecuali Magazine Box dan lokasi di luar Jabodetabek.",
			tax,
		].join("\n");
	}
	if (docType === "invoice") {
		return [
			"Tanggal acara terkunci setelah DP diterima.",
			`Pelunasan dilakukan maksimal H-${hMinus} sebelum acara, atau sesuai kesepakatan bersama.`,
			tax,
		].join("\n");
	}
	return "";
}

/** Masa berlaku quotation (hari sejak terbit). */
export const QUOTATION_VALID_DAYS = 14;

/**
 * Isi paket per kategori (pricelist 2026 di website). Dipakai editor saat
 * packages.quotation_includes masih NULL dan oleh buat_quotation agent.
 * `{hours}` diganti durasi paket.
 */
const PHOTOBOOTH_CLASSIC = [
	"Cetak foto unlimited sesuai format yang dipilih",
	"Peralatan profesional (printer, kamera, lighting)",
	"Setup rapi & properti",
	"2 crew profesional",
	"Desain frame custom sesuai acara",
	"Softfile real-time via QR code",
	"Backdrop basic 6 warna (White/Red/Silver/Gold/Emerald Green/Blue)",
	"Flashdisk kayu berisi seluruh file",
	"Free transport se-Jabodetabek",
];

const PHOTO_STAGE = [
	"Layout desain custom 4R 1–2 pose",
	"QR code A2 untuk unduh softfile",
	"Link Google Drive",
	"Lighting profesional",
	"Crew pengarah gaya",
];

export const DEFAULT_INCLUDES_BY_CATEGORY: Record<string, string[]> = {
	photobooth_classic: PHOTOBOOTH_CLASSIC,
	videobooth_360: [
		"Video 360° kualitas tinggi (iPhone)",
		"Platform spin 2–4 orang (maks. 250 kg)",
		"Lighting profesional",
		"Template video custom",
		"Pilihan musik",
		"Properti",
		"Sharing real-time via AirDrop/QR code",
		"Free transport se-Jabodetabek",
	],
	magazine_combo: [
		"Magazine box booth + semua isi Photobooth Classic",
		...PHOTOBOOTH_CLASSIC.slice(0, -1),
		"Syarat: loading 3 jam sebelum mulai, area min. 4×5 m, indoor, listrik ±700 W",
		"Klien menyiapkan 1 meja + 3 kursi",
		"Tidak termasuk transport, penggantian sticker & dekorasi tambahan",
	],
	magazine_box_only: [
		"Instalasi magazine box {hours} jam tanpa crew standby",
		"Sticker default",
		"Loading H-1 malam / hari H, bongkar maks. 23.00",
		"Listrik ±100 W, indoor",
		"Tidak termasuk transport, penggantian sticker & dekorasi",
	],
	photostage_only: [
		...PHOTO_STAGE,
		"Tanpa cetak",
		"Free transport se-Jabodetabek",
	],
	photostage_combo: [
		...PHOTO_STAGE,
		"Cetak instan classic photobooth",
		"Free transport se-Jabodetabek",
	],
	guest_cam: [
		"Tamu memotret dari HP lewat QR, tanpa install aplikasi",
		"Ucapan suara + photo frame",
		"Album gabungan, disimpan 6 bulan",
		"Kartu QR ukuran kartu nama + 3 papan meja",
		"Tanpa booth & tanpa crew (kecuali + Print Station)",
	],
};

export function includesForPackage(pkg: {
	category: string;
	duration_hours: number | null;
	quotation_includes?: string[] | null;
}): string[] {
	const tpl =
		pkg.quotation_includes && pkg.quotation_includes.length > 0
			? pkg.quotation_includes
			: (DEFAULT_INCLUDES_BY_CATEGORY[pkg.category] ?? PHOTOBOOTH_CLASSIC);
	const hours = pkg.duration_hours ? String(pkg.duration_hours) : "";
	return tpl.map((s) =>
		s.replace("{hours}", hours).replace(/\s+/g, " ").trim(),
	);
}

/** yyyy-MM-dd + n hari. Dihitung di UTC: dengan jam lokal, browser WIB
 *  (UTC+7) mundur sehari saat dikonversi balik lewat toISOString. */
export function addDays(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/**
 * Tarif gross-up PPh bawaan (%). Tetra usaha perorangan non-PKP; gross-up
 * hanya bila klien minta pajak dicantumkan (keputusan Rama 27 Sep 2026).
 * Sumber utama: system_config `tax.default_grossup_rate_pct` — ini cadangan.
 */
export const GROSS_UP_RATE_DEFAULT = 2.5;

/** Nilai config tarif gross-up → angka; tak valid → GROSS_UP_RATE_DEFAULT. */
export function parseGrossUpRate(v: unknown): number {
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
	return Number.isFinite(n) && n > 0 ? n : GROSS_UP_RATE_DEFAULT;
}

/** "Ditujukan kepada" dokumen event — disimpan di events.bill_to_*. */
export const BILL_TO_MODES = ["auto", "client", "booker", "custom"] as const;
export type BillToMode = (typeof BILL_TO_MODES)[number];
export const BILL_TO_LABEL: Record<BillToMode, string> = {
	auto: "Klien + u.p.",
	client: "Klien saja",
	booker: "Pembooking saja",
	custom: "Custom",
};

export type BillToSource = {
	client_name: string;
	client_org: string | null;
	booker_name: string | null;
	event_category: string | null;
	bill_to_mode: string | null;
	bill_to_name: string | null;
	bill_to_attn: string | null;
};

/** Kategori yang klien-nya orang (pengantin/yang ultah), bukan organisasi. */
const PERSONAL_CATEGORIES = new Set(["wedding", "pernikahan", "birthday"]);

/**
 * Nama di KEPADA + baris "u.p.". Default = klien (events.client_org, jatuh ke
 * judul event untuk data lama) + pembooking bila orangnya lain.
 */
export function billTo(ev: BillToSource): {
	name: string;
	attn: string | null;
} {
	const klien = ev.client_org?.trim() || ev.client_name;
	const booker = ev.booker_name?.trim() || null;
	switch (ev.bill_to_mode) {
		case "client":
			return { name: klien, attn: null };
		case "booker":
			return { name: booker || klien, attn: null };
		case "custom":
			return {
				name: ev.bill_to_name?.trim() || klien,
				attn: ev.bill_to_attn?.trim() || null,
			};
		default: {
			const personal = PERSONAL_CATEGORIES.has(ev.event_category ?? "");
			const attn =
				booker && !personal && booker.toLowerCase() !== klien.toLowerCase()
					? booker
					: null;
			return { name: klien, attn };
		}
	}
}

/** "Invoice INV-TP-01-23092026 - PT Gratama.pdf" — satu aturan untuk unduhan,
 *  viewer & lampiran WA bot. */
export function docFilename(
	docType: DocType,
	docNumber: string,
	clientName: string | null | undefined,
): string {
	const client = (clientName ?? "")
		.replace(/[^\w\s-]+/g, "")
		.trim()
		.replace(/\s+/g, " ");
	return `${DOC_TYPE_LABEL[docType]} ${docNumber}${client ? ` - ${client}` : ""}.pdf`;
}
