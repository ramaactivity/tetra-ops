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
 * Render PDF dokumen. Muat satu halaman → blok bawah dipaku di dasar halaman
 * (tampilan biasa). Tidak muat → render ulang dalam mode alir: bagian
 * penutup (total, pembayaran, ketentuan, tanda tangan) langsung menyambung di
 * halaman 2, bukan sendirian di dasar halaman kosong.
 */
export async function renderTetraPdf(data: PdfDocData): Promise<Buffer> {
	const first = await renderToBuffer(<TetraDocument data={data} />);
	if (pdfPageCount(first) <= 1) return first;
	return renderToBuffer(<TetraDocument data={data} flow />);
}
