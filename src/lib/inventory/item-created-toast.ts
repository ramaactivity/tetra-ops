/**
 * Kabar "berhasil" setelah menambah item.
 *
 * Form Tambah Item selesai dengan redirect ke /warehouse, jadi tidak ada state
 * yang bisa dibawa pulang — owner hanya melihat halaman berganti dan tidak tahu
 * apakah jurnalnya jadi atau tidak. Ringkasannya dititipkan lewat query string,
 * lalu ditampilkan sebagai toast oleh <ItemCreatedToast /> dan langsung
 * dibersihkan dari URL.
 *
 * Plain module (bukan "use server") — dipakai server action & komponen client.
 */

export type ItemCreatedInfo = {
	/** Nama item/alat. */
	name: string;
	/** Berapa unit dibuat (aset tetap bisa >1 sekali submit). */
	units: number;
	/** Asal barang: dibeli, setoran owner, atau cuma didaftarkan. */
	origin: "purchase" | "owner_contribution" | "none";
	/** Ref jurnal yang lahir, kalau ada. */
	journalRef?: string | null;
	/** Nilai total yang dibukukan. */
	amount?: number | null;
};

const KEY = "baru";

/** Sisipkan ringkasan ke URL tujuan redirect. */
export function withItemCreated(target: string, info: ItemCreatedInfo): string {
	const payload = [
		info.name,
		String(info.units),
		info.origin,
		info.journalRef ?? "",
		String(Math.round(info.amount ?? 0)),
	].join("|");
	const sep = target.includes("?") ? "&" : "?";
	return `${target}${sep}${KEY}=${encodeURIComponent(payload)}`;
}

/** Baca kembali ringkasan dari query string. Null kalau tidak ada/rusak. */
export function readItemCreated(raw: string | null): ItemCreatedInfo | null {
	if (!raw) return null;
	const parts = raw.split("|");
	if (parts.length < 5) return null;
	const [name, units, origin, journalRef, amount] = parts;
	if (!name) return null;
	if (
		origin !== "purchase" &&
		origin !== "owner_contribution" &&
		origin !== "none"
	) {
		return null;
	}
	return {
		name,
		units: Number(units) || 1,
		origin,
		journalRef: journalRef || null,
		amount: Number(amount) || 0,
	};
}

export const ITEM_CREATED_PARAM = KEY;
