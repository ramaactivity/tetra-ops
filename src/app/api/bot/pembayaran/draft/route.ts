import { type NextRequest, NextResponse } from "next/server";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { handleBotDraft } from "@/lib/payment-drafts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/pembayaran/draft — bot WA mengirim bukti transfer DP sebagai
 * DRAFT (DR-055). Idempoten per pesan_id_wa; tidak pernah menyentuh buku.
 * Kirim ulang dengan sumber admin_wa + auto_confirm menaikkan ke disetujui
 * hanya kalau syarat ketat lolos. Kontrak: src/lib/payment-drafts/core.ts.
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBot(req))
		return NextResponse.json(
			{ ok: false, error: "unauthorized" },
			{ status: 401 },
		);
	const json = await req.json().catch(() => null);
	try {
		const res = await handleBotDraft(
			json,
			process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin,
		);
		return NextResponse.json(res.body, { status: res.status });
	} catch (e) {
		console.error("[api/bot/pembayaran/draft]", e);
		return NextResponse.json({ ok: false, error: "gagal" }, { status: 500 });
	}
}
