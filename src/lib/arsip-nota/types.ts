/**
 * types.ts — Konstanta & tipe modul Arsip Nota.
 * Modul biasa (BUKAN "use server") supaya bisa di-import client + server.
 */

/** Sumber nota sistem (sesuai kolom source_type di view v_nota_sistem). */
export type NotaSistemSource =
	| "payment"
	| "recap_proof"
	| "transport_proof"
	| "crew_fee"
	| "misc_expense";

export type NotaSistemRow = {
	source_type: NotaSistemSource;
	source_id: string;
	event_id: string | null;
	project_id: string | null;
	client_name: string | null;
	label: string | null;
	amount: number | null;
	nota_date: string | null;
	drive_url: string | null;
	uploaded_by: string | null;
	uploaded_by_name: string | null;
	created_at: string | null;
};

export type ManualNotaRow = {
	id: string;
	category: string;
	nota_date: string | null;
	amount: number | null;
	description: string;
	drive_url: string;
	drive_file_id: string;
	file_name: string;
	upload_year: number;
	upload_month: number;
	event_id: string | null;
	uploaded_by: string;
	created_at: string;
	uploaded_by_name?: string | null;
};

/** Label + warna aksen per sumber (biru/hijau saja — no merah/oranye). */
export const SOURCE_META: Record<
	NotaSistemSource,
	{ label: string; tone: "blue" | "green" | "slate" }
> = {
	payment: { label: "Pembayaran", tone: "green" },
	recap_proof: { label: "Rekap Crew", tone: "blue" },
	transport_proof: { label: "Transport", tone: "blue" },
	crew_fee: { label: "Fee Crew", tone: "slate" },
	misc_expense: { label: "Lain-lain", tone: "slate" },
};

export const SOURCE_FILTER_OPTIONS: Array<{
	value: NotaSistemSource | "all";
	label: string;
}> = [
	{ value: "all", label: "Semua sumber" },
	{ value: "payment", label: "Pembayaran" },
	{ value: "recap_proof", label: "Rekap Crew" },
	{ value: "transport_proof", label: "Transport" },
	{ value: "crew_fee", label: "Fee Crew" },
	{ value: "misc_expense", label: "Lain-lain" },
];

/**
 * Preset kategori nota manual — hanya saran. User bisa ketik sendiri (free-text)
 * lewat datalist, jadi daftar ini tidak mengikat.
 */
export const MANUAL_CATEGORY_PRESETS = [
	"Belanja Pasar/Bahan",
	"Operasional",
	"Transport/BBM",
	"Perlengkapan/Aset",
	"Konsumsi",
	"Maintenance/Servis",
	"Pajak/Retribusi",
	"Lain-lain",
] as const;

export const MANUAL_UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const MANUAL_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
