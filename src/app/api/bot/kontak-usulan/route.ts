import { type NextRequest, NextResponse } from "next/server";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { handleKontakUsulan } from "@/lib/kontak-usulan/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/kontak-usulan — bot WA melaporkan nomor yang chat tapi belum
 * tercatat di acara mana pun (DR-064). Hanya menyimpan usulan; data event
 * berubah saat owner menekan tombol di Booking Masuk. Kontrak:
 * src/lib/kontak-usulan/core.ts.
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBot(req))
		return NextResponse.json(
			{ ok: false, error: "unauthorized" },
			{ status: 401 },
		);
	const json = await req.json().catch(() => null);
	try {
		const res = await handleKontakUsulan(json);
		return NextResponse.json(res.body, { status: res.status });
	} catch (e) {
		console.error("[api/bot/kontak-usulan]", e);
		return NextResponse.json({ ok: false, error: "gagal" }, { status: 500 });
	}
}
