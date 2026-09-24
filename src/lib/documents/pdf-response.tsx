import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { TetraDocument } from "@/components/pdf/tetra-document";
import { getCurrentUser } from "@/lib/auth/get-user";
import { loadPdfData } from "@/lib/documents/load";
import { verifyPdfSignature } from "@/lib/documents/pdf-link";
import { DOC_TYPE_LABEL } from "@/lib/documents/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PdfDocData } from "./pdf-data";

/** "Invoice INV-TP-01-23092026 - 20th Anniversary PT Gratama Finance Indonesia.pdf" */
export function pdfFilename(data: PdfDocData): string {
	const client = data.client.name
		.replace(/[^\w\s-]+/g, "")
		.trim()
		.replace(/\s+/g, " ");
	return `${DOC_TYPE_LABEL[data.docType]} ${data.docNumber}${client ? ` - ${client}` : ""}.pdf`;
}

/**
 * Render PDF dokumen. `mode`:
 *  - "auto"   : route /api/pdf/document/[id]. Unduhan (?download=1) & link
 *               bertanda tangan dilayani langsung; buka-di-browser dialihkan ke
 *               URL yang berakhiran nama file supaya "Save As" di viewer PDF
 *               (Chrome dsb.) memakai nama lengkap, bukan id.
 *  - "inline" : route /api/pdf/document/[id]/[file] — tujuan pengalihan itu.
 */
export async function pdfDocumentResponse(
	request: Request,
	id: string,
	mode: "auto" | "inline",
): Promise<Response> {
	const url = new URL(request.url);
	// Link bertanda tangan (bot WA mengunduh invoice untuk klien): tanpa sesi,
	// jadi dibaca dengan klien admin — tanda tangannya mengunci ke satu id.
	const signed = verifyPdfSignature(
		id,
		url.searchParams.get("exp"),
		url.searchParams.get("sig"),
	);
	if (!signed) {
		const me = await getCurrentUser();
		if (
			!me ||
			(me.profile.role !== "super_admin" && me.profile.role !== "owner")
		) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
	}
	const data = await loadPdfData(id, signed ? createAdminClient() : undefined);
	if (!data) {
		return NextResponse.json(
			{ error: "Dokumen tidak ditemukan" },
			{ status: 404 },
		);
	}
	const filename = pdfFilename(data);
	const download = url.searchParams.get("download") === "1";

	if (mode === "auto" && !download && !signed) {
		const target = new URL(
			`/api/pdf/document/${id}/${encodeURIComponent(filename)}`,
			url.origin,
		);
		return NextResponse.redirect(target, 307);
	}

	const buffer = await renderToBuffer(<TetraDocument data={data} />);
	// filename* (RFC 5987) untuk nama non-ASCII; filename biasa sebagai cadangan.
	const ascii = filename.replace(/[^\x20-\x7e]/g, "");
	return new Response(new Uint8Array(buffer), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
			"Cache-Control": "private, no-store",
		},
	});
}
