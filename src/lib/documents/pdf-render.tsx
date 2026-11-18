import { renderToBuffer } from "@react-pdf/renderer";
import { TetraDocument } from "@/components/pdf/tetra-document";
import type { PdfDocData } from "./pdf-data";

/** Jumlah halaman PDF hasil react-pdf (objek "/Type /Page", bukan "/Pages"). */
export function pdfPageCount(buf: Uint8Array): number {
	return (
		Buffer.from(buf)
			.toString("latin1")
			.match(/\/Type\s*\/Page(?!s)/g) ?? []
	).length;
}

/**
 * Render PDF dokumen — owner: "sebisa mungkin 1 halaman dulu; kalau terpaksa
 * lebih, halaman 1 dan 2 tetap harus bagus". Berurutan:
 *  1. tampilan biasa (blok bawah dipaku di dasar halaman);
 *  2. tidak muat → versi ringkas (judul & angka besar lebih kecil, jarak
 *     lebih rapat) yang tetap 1 halaman;
 *  3. masih tidak muat → mode alir 2 halaman: Subtotal/Total di bawah tabel,
 *     angka besar + pembayaran/ketentuan/tanda tangan membuka halaman 2.
 */
export async function renderTetraPdf(data: PdfDocData): Promise<Buffer> {
	const normal = await renderToBuffer(<TetraDocument data={data} />);
	if (pdfPageCount(normal) <= 1) return normal;
	const compact = await renderToBuffer(<TetraDocument data={data} compact />);
	if (pdfPageCount(compact) <= 1) return compact;
	return renderToBuffer(<TetraDocument data={data} flow />);
}
