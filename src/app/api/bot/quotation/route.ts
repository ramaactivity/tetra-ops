import { type NextRequest, NextResponse } from "next/server";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { handleBotQuotation } from "@/lib/documents/bot-quotation";
import { createQuotationCore } from "@/lib/documents/quotation-core";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/quotation — bot WA meminta draft quotation (idempoten per
 * external_id). Hanya membuat DRAFT + pesan persetujuan ke grup owner; bot
 * memberi tahu klien bahwa penawaran sedang dicek admin. Auth sama dengan
 * /api/bot/booking. Kontrak input: src/lib/documents/quotation-plan.ts.
 */
export async function POST(req: NextRequest) {
	const authorized = isAuthorizedBot(req);
	const json = authorized ? await req.json().catch(() => null) : null;
	try {
		const supabase = createAdminClient();
		const today = new Date(Date.now() + 7 * 3600_000)
			.toISOString()
			.slice(0, 10);
		const res = await handleBotQuotation({
			authorized,
			json,
			create: (input, externalId) =>
				createQuotationCore(supabase, input, {
					actorId: null,
					today,
					externalId,
				}),
		});
		return NextResponse.json(res.body, { status: res.status });
	} catch (e) {
		console.error("[api/bot/quotation]", e);
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : "Gagal membuat quotation" },
			{ status: 500 },
		);
	}
}
