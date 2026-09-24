import { pdfDocumentResponse } from "@/lib/documents/pdf-response";

/**
 * Sama dengan /api/pdf/document/[id], tapi URL-nya berakhiran nama file
 * (segmen [file] hanya kosmetik) supaya "Save As" di viewer PDF memakai nama
 * "Jenis Nomor - Klien.pdf".
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string; file: string }> },
) {
	const { id } = await params;
	return pdfDocumentResponse(request, id, "inline");
}
