import { type NextRequest, NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/ai/mcp";
import { toolsForRole } from "@/lib/ai/registry";
import { isAuthorizedBearer } from "@/lib/bot-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isoDateUTC, wibNow } from "@/lib/telegram/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mcp — endpoint MCP untuk agent eksternal (Hermes di VPS).
 *
 * Auth: `Authorization: Bearer ${MCP_API_TOKEN}`. Token ini SETARA OWNER:
 * membuka data keuangan (HPP, profit, saldo). Jangan pernah diberikan ke bot
 * yang berhadapan dengan pelanggan; bot WA memakai AVAILABILITY_API_TOKEN
 * yang hanya membuka /api/availability.
 *
 * Hanya POST yang ada: GET/HEAD → 405 dari Next, dan itu yang diharapkan
 * probe Streamable HTTP milik Hermes (non-2xx = lanjut ke handshake).
 */
/**
 * Pelaku tulisan dari agent: owner ber-email MCP_ACTOR_EMAIL, atau kalau env
 * itu kosong, owner aktif tertua (pola yang sama dengan cron depresiasi).
 */
async function resolveActorId(
	supabase: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
	const email = process.env.MCP_ACTOR_EMAIL?.trim();
	let q = supabase
		.from("users")
		.select("id")
		.in("role", ["owner", "super_admin"])
		.eq("is_active", true);
	q = email ? q.eq("email", email) : q.order("created_at");
	const { data } = await q.limit(1).maybeSingle();
	return (data?.id as string | undefined) ?? null;
}

export async function POST(req: NextRequest) {
	if (!isAuthorizedBearer(req, "MCP_API_TOKEN")) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{
				jsonrpc: "2.0",
				id: null,
				error: { code: -32700, message: "Parse error" },
			},
			{ status: 400 },
		);
	}

	const supabase = createAdminClient();
	const reply = await handleMcpRequest(body, toolsForRole("owner"), {
		supabase,
		role: "owner",
		todayISO: isoDateUTC(wibNow()),
		surface: "mcp",
		actorId: (await resolveActorId(supabase)) ?? undefined,
	});

	if (reply.body === undefined)
		return new Response(null, { status: reply.status });
	return NextResponse.json(reply.body, { status: reply.status });
}
