import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { TetraDocument } from "@/components/pdf/tetra-document";
import { getCurrentUser } from "@/lib/auth/get-user";
import { loadPdfData } from "@/lib/documents/load";
import { DOC_TYPE_LABEL } from "@/lib/documents/types";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const me = await getCurrentUser();
	if (
		!me ||
		(me.profile.role !== "super_admin" && me.profile.role !== "owner")
	) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const data = await loadPdfData(id);
	if (!data) {
		return NextResponse.json(
			{ error: "Dokumen tidak ditemukan" },
			{ status: 404 },
		);
	}

	const buffer = await renderToBuffer(<TetraDocument data={data} />);
	const download = new URL(request.url).searchParams.get("download") === "1";
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
