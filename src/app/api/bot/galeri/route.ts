import { type NextRequest, NextResponse } from "next/server";
import { cariGaleriData } from "@/lib/ai/tools/tim";
import { isAuthorizedBot } from "@/lib/bot-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/galeri {q?, tanggal?} — bot WA (CS) mencari link galeri acara
 * untuk tamu yang minta softfile. Auth sama dengan /api/bot/quotation. Logika
 * & bentuk respons sama dengan tool MCP cari_galeri (cariGaleriData).
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBot(req))
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const json = (await req.json().catch(() => null)) as {
		q?: unknown;
		tanggal?: unknown;
	} | null;
	const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
	const res = await cariGaleriData(createAdminClient(), today, json ?? {});
	return NextResponse.json(res, { status: "error" in res ? 400 : 200 });
}
