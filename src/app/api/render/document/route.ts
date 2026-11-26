import { type NextRequest, NextResponse } from "next/server";
import { isAuthorizedBearer } from "@/lib/bot-auth";
import { BRANDS } from "@/lib/documents/brand";
import { loadDefaultBank } from "@/lib/documents/load";
import { buildPdfData } from "@/lib/documents/pdf-data";
import { renderTetraPdf } from "@/lib/documents/pdf-render";
import { RenderDocSchema, toRenderable } from "@/lib/documents/render-api";
import { docFilename } from "@/lib/documents/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/render/document — mesin cetak PDF untuk lini bisnis lain
 * (DR-067, mis. dashboard Tetra Visual). Bearer DOC_RENDER_API_TOKEN.
 * Stateless: TIDAK menyimpan dokumen, nomor, atau pembayaran apa pun di
 * Tetra Ops. Kontrak body: src/lib/documents/render-api.ts.
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBearer(req, "DOC_RENDER_API_TOKEN"))
		return NextResponse.json(
			{ ok: false, error: "unauthorized" },
			{ status: 401 },
		);
	const parsed = RenderDocSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json(
			{ ok: false, error: "Body tidak valid", issues: parsed.error.issues },
			{ status: 400 },
		);
	try {
		const admin = createAdminClient();
		const needSigner = !parsed.data.signer;
		const [bank, signer] = await Promise.all([
			parsed.data.bank ? null : loadDefaultBank(admin),
			needSigner
				? admin
						.from("document_signers")
						.select("name, position, signature_data")
						.eq("is_default", true)
						.maybeSingle()
						.then((r) => r.data)
				: null,
		]);
		const { doc, ctx } = toRenderable(parsed.data, { signer, bank });
		// Ketentuan = persis kiriman pemanggil — tidak diisi S&K bawaan Tetra
		// Photobooth (kebijakan bisnis lain bukan milik Tetra Ops).
		const data = {
			...buildPdfData(doc, ctx),
			brand: parsed.data.brand,
			terms: doc.terms,
		};
		const pdf = await renderTetraPdf(data);
		const name = docFilename(data.docType, {
			title: data.event.title,
			clientName: data.client.name,
			issuedAt: data.issuedAt,
			company: BRANDS[parsed.data.brand].name,
		});
		return new NextResponse(new Uint8Array(pdf), {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Length": String(pdf.byteLength),
				"Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
				"Cache-Control": "no-store",
			},
		});
	} catch (e) {
		console.error("[api/render/document]", e);
		return NextResponse.json(
			{ ok: false, error: "gagal render" },
			{ status: 500 },
		);
	}
}
