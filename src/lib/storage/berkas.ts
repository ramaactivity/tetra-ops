import "server-only";

import { randomUUID } from "node:crypto";
import { r2Put } from "./r2";

/**
 * Berkas privat app di R2 (DR-066 — Drive Tetra penuh). Dua kelompok akses:
 *  - "owner": bukti bayar klien, komisi, transaksi event (data uang)
 *  - "tim":   foto rekap, nota lapangan, bukti uang jalan, desain (owner + crew)
 * Dibuka lewat /api/berkas/<kelompok>/… (wajib login, dicek perannya). Nama
 * file diberi awalan acak supaya tidak bisa ditebak.
 */
export type KelompokBerkas = "owner" | "tim";

export async function simpanBerkas(
	kelompok: KelompokBerkas,
	folder: string,
	nama: string,
	body: Buffer | Uint8Array,
	mime: string,
	origin: string,
): Promise<{ key: string; url: string }> {
	const aman = nama
		.replace(/[^\w.\- ]+/g, "_")
		.replace(/\s+/g, " ")
		.slice(-120);
	const key = `berkas/${kelompok}/${folder}/${randomUUID().slice(0, 8)}-${aman}`;
	await r2Put(key, new Uint8Array(body), mime);
	const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
	return {
		key,
		url: `${base}/api/${key.split("/").map(encodeURIComponent).join("/")}`,
	};
}
