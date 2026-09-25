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
	created_at: string;
	updated_at: string;
};

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
): string {
	const tax = grossUp
		? "Harga belum termasuk pajak (PPN/PPh) karena Tetra merupakan usaha perorangan non-PKP. Apabila terdapat kewajiban pemotongan pajak oleh pihak penyelenggara, nilai yang terpotong di-gross up sehingga jumlah yang diterima Tetra tetap sesuai nominal dasar. Pajak ditanggung pihak penyelenggara sesuai ketentuan yang berlaku."
		: "Harga belum termasuk pajak (PPN/PPh) karena Tetra merupakan usaha perorangan non-PKP.";
	if (docType === "quotation") {
		return [
			"Setelah quotation ini disetujui, kami akan menerbitkan invoice sebagai dasar pembayaran DP (booking).",
			`Pelunasan dilakukan maksimal H-${hMinus} sebelum acara, atau sesuai kesepakatan bersama.`,
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

/**
 * Template "include" quotation per kategori paket. `{hours}` diganti durasi
 * paket. Dipakai kalau packages.quotation_includes masih NULL; hasilnya tetap
 * bisa diedit per dokumen.
 */
const PHOTOBOOTH_BASE = [
	"Professional gear equipment & printer",
	"2 professional crews",
	"Softfile via flashdisk / Google Drive",
	"Custom template design",
	"Barcode for realtime digital result",
	"Fun props & basic backdrop",
	"Transportation",
];

export const DEFAULT_INCLUDES_BY_CATEGORY: Record<string, string[]> = {
	photobooth_classic: [
		"Unlimited photo & print {hours} hours",
		...PHOTOBOOTH_BASE,
	],
	videobooth_360: [
		"Unlimited 360° video {hours} hours",
		"Professional 360 platform & lighting",
		"2 professional crews",
		"Instant share via barcode / AirDrop",
		"Custom overlay & music",
		"Fun props",
		"Transportation",
	],
	photostage_only: [
		"Photo stage session {hours} hours",
		"Professional camera, lighting & backdrop",
		"2 professional crews",
		"Softfile via Google Drive (edited)",
		"Transportation",
	],
	photostage_combo: [
		"Photo stage + photobooth {hours} hours",
		"Unlimited photo & print (photobooth)",
		...PHOTOBOOTH_BASE.slice(0, 1),
		"3 professional crews",
		"Softfile via flashdisk / Google Drive",
		"Custom template design",
		"Barcode for realtime digital result",
		"Transportation",
	],
	magazine_box_only: [
		"Magazine box installation {hours} hours",
		"Custom magazine cover design",
		"Softfile via Google Drive",
		"Transportation",
	],
	magazine_combo: [
		"Magazine box + photobooth {hours} hours",
		"Unlimited photo & print (photobooth)",
		...PHOTOBOOTH_BASE,
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
			: (DEFAULT_INCLUDES_BY_CATEGORY[pkg.category] ?? PHOTOBOOTH_BASE);
	const hours = pkg.duration_hours ? String(pkg.duration_hours) : "";
	return tpl.map((s) =>
		s.replace("{hours}", hours).replace(/\s+/g, " ").trim(),
	);
}

/** yyyy-MM-dd + n hari (tanpa zona waktu). */
export function addDays(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00`);
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}
