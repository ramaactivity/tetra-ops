/**
 * PIC cadangan di lokasi — kontak kedua, ketiga, … yang dihubungi crew kalau
 * PIC utama (events.pic_name/pic_wa) slow respon atau ada kendala. PIC utama
 * tetap di kolomnya sendiri supaya semua pembaca lama (TBC, Telegram, bot,
 * PDF) tidak berubah; cadangan disimpan di events.extra_pics.
 */
export type ExtraPic = { name: string; wa: string };

/** JSON string / jsonb → daftar bersih (baris kosong dibuang, maks 5). */
export function parseExtraPics(raw: unknown): ExtraPic[] {
	let arr: unknown = raw;
	if (typeof raw === "string") {
		try {
			arr = JSON.parse(raw || "[]");
		} catch {
			return [];
		}
	}
	if (!Array.isArray(arr)) return [];
	return arr
		.map((x) => ({
			name: typeof x?.name === "string" ? x.name.trim().slice(0, 120) : "",
			wa: typeof x?.wa === "string" ? x.wa.trim().slice(0, 20) : "",
		}))
		.filter((x) => x.name || x.wa)
		.slice(0, 5);
}
