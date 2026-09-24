import { pdfDocumentResponse } from "@/lib/documents/pdf-response";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	return pdfDocumentResponse(request, id, "auto");
}
