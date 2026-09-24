import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { TetraDocument } from "@/components/pdf/tetra-document";
import { getCurrentUser } from "@/lib/auth/get-user";
import { loadPdfData } from "@/lib/documents/load";
import { verifyPdfSignature } from "@/lib/documents/pdf-link";
import { DOC_TYPE_LABEL } from "@/lib/documents/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
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

	const buffer = await renderToBuffer(<TetraDocument data={data} />);
	const download = url.searchParams.get("download") === "1";
	const client = data.client.name
		.replace(/[^\w\s-]+/g, "")
		.trim()
		.replace(/\s+/g, " ");
	const filename = `${DOC_TYPE_LABEL[data.docType]} ${data.docNumber} - ${client}.pdf`;
	return new Response(new Uint8Array(buffer), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
			"Cache-Control": "private, no-store",
		},
	});
}
