import { type NextRequest, NextResponse } from "next/server";
import { HERMES_URL_CONFIG_KEY } from "@/lib/ai/hermes";
import { isAuthorizedBearer } from "@/lib/bot-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hermes/register  { "url": "https://xxx.trycloudflare.com/p/tetra" }
 *
 * Dipanggil VPS tiap kali Cloudflare quick tunnel ke API server Hermes
 * dapat alamat baru (alamatnya berubah tiap restart). Auth memakai
 * MCP_API_TOKEN yang sudah ada di VPS, jadi tidak ada rahasia baru di sana.
 * Hanya URL yang disimpan; kunci API Hermes tetap di env Vercel.
 */
export async function POST(req: NextRequest) {
	if (!isAuthorizedBearer(req, "MCP_API_TOKEN")) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
	const admin = createAdminClient();

	// { url: null } → cabut pendaftaran; Tanya Tetra kembali ke Gemini saja.
	if (body?.url === null) {
		const { error } = await admin
			.from("system_config")
			.delete()
			.eq("key", HERMES_URL_CONFIG_KEY);
		if (error)
			return NextResponse.json({ error: error.message }, { status: 500 });
		return NextResponse.json({ ok: true, url: null });
	}

	const url =
		typeof body?.url === "string" ? body.url.trim().replace(/\/+$/, "") : "";
	if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[a-z0-9_./-]*)?$/i.test(url)) {
		return NextResponse.json(
			{ error: "url harus https tanpa query" },
			{ status: 400 },
		);
	}
	const { error } = await admin.from("system_config").upsert(
		{
			key: HERMES_URL_CONFIG_KEY,
			value: url,
			description: "Alamat API server Hermes (didaftarkan otomatis oleh VPS)",
			category: "system",
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "key" },
	);
	if (error)
		return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ ok: true, url });
}
