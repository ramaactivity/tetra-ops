/**
 * Rekap-field → inventory item mapping types.
 *
 * Lives outside `src/lib/actions/rekap-mapping.ts` because that file is
 * `"use server"` — server-action modules can only export async functions.
 */

export const REKAP_FIELDS = [
	"cetak_total",
	"media_set_used",
	"sleeve_used",
	"flashdisk_used",
	"pouch_used",
	"photomagnet_used",
	"keychain_used",
] as const;

export type RekapField = (typeof REKAP_FIELDS)[number];

export const REKAP_FIELD_LABELS: Record<RekapField, string> = {
	cetak_total: "Cetak Total",
	media_set_used: "Mediaset Used",
	sleeve_used: "Sleeve Used",
	flashdisk_used: "Flashdisk Used",
	pouch_used: "Pouch Used",
	photomagnet_used: "Photo Magnet",
	keychain_used: "Keychain",
};

export const REKAP_FIELD_HINTS: Record<RekapField, string> = {
	cetak_total: "Total foto tercetak (count). Bisa di-skip kalau printer paper bukan SKU diskrit.",
	media_set_used: "Set media yang dipakai (1 set biasanya = 2 cetak). Set qty_per_unit > 1 kalau perlu.",
	sleeve_used: "Sleeve (kantong foto) yang terpakai.",
	flashdisk_used: "Flashdisk yang dibagikan ke klien.",
	pouch_used: "Pouch packaging untuk flashdisk.",
	photomagnet_used: "Foto magnet sebagai souvenir.",
	keychain_used: "Keychain frame magnet.",
};

export type RekapMapping = {
	rekap_field: RekapField;
	item_id: string | null;
	qty_per_unit: number;
	is_active: boolean;
};
