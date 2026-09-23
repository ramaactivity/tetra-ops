import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { TetraDocument } from "@/components/pdf/tetra-document";
import { getCurrentUser } from "@/lib/auth/get-user";
import { buildPdfContext } from "@/lib/documents/load";
import { buildPdfData } from "@/lib/documents/pdf-data";
import type { DocumentRow } from "@/lib/documents/types";

/**
 * Preview draft dari editor: body = isi dokumen (belum tentu tersimpan).
 * Dirender di server dengan renderer yang sama dengan unduhan final supaya
 * yang dilihat = yang diunduh, tanpa mengirim @react-pdf ke browser.
 */
export async function POST(request: Request) {
	const me = await getCurrentUser();
	if (
		!me ||
		(me.profile.role !== "super_admin" && me.profile.role !== "owner")
	) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const body = (await request.json()) as Partial<DocumentRow>;
	const doc: Omit<DocumentRow, "id" | "created_at" | "updated_at"> = {
		doc_type: body.doc_type ?? "quotation",
		doc_number: body.doc_number || "PREVIEW",
		event_id: body.event_id ?? null,
		payment_id: body.payment_id ?? null,
		source_document_id: null,
		client: { name: body.client?.name || "Nama Klien", ...body.client },
		event_info: body.event_info ?? {},
		items: (body.items ?? []).map((it) => ({
			name: it.name || "Item",
			includes: Array.isArray(it.includes) ? it.includes : [],
			qty: Number(it.qty) || 0,
			unit_price: Number(it.unit_price) || 0,
		})),
		discount: Number(body.discount) || 0,
		gross_up_enabled: Boolean(body.gross_up_enabled),
		gross_up_rate: Number(body.gross_up_rate) || 2,
		notes: body.notes ?? null,
		terms: body.terms ?? null,
		signer_id: body.signer_id ?? null,
		signer_name: body.signer_name ?? null,
		signer_position: body.signer_position ?? null,
		issued_at: body.issued_at || new Date().toISOString().slice(0, 10),
		due_date: body.due_date ?? null,
		valid_until: body.valid_until ?? null,
		status: body.status ?? "draft",
	};
	const ctx = await buildPdfContext(doc);
	const buffer = await renderToBuffer(
		<TetraDocument data={buildPdfData(doc, ctx)} />,
	);
	return new Response(new Uint8Array(buffer), {
		headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
	});
}
