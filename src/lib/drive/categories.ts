/**
 * Per-event Drive subfolder categories. Plain module (NOT "use server") so the
 * const + type can be exported — "use server" files may only export async fns.
 */
export const DRIVE_CATEGORIES = [
	"Nota",
	"Design",
	"Hasil Cetak",
	"Footage",
	"Lainnya",
] as const;

export type DriveCategory = (typeof DRIVE_CATEGORIES)[number];
