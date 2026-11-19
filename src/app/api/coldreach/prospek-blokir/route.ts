import { NextResponse } from "next/server";
import { isAuthorizedBearer } from "@/lib/bot-auth";
import { PROSPEK_BLOKIR } from "@/lib/prospek";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/coldreach/prospek-blokir — semua prospek berstatus PROSPEK_BLOKIR
 * (tolak / jangan_hubungi / berhenti), baca saja. Cold Reach menarik daftar ini
 * sebelum mengirim email supaya prospek yang berhenti di WA tidak di-email lagi
 * (Rama 19 Nov). Status diubah dari banyak jalur (bot WA langsung ke DB, endpoint
 * bot, MCP), jadi tarik-saat-kirim lebih aman daripada kait di satu fungsi.
 * Token terpisah: `COLDREACH_API_TOKEN`. Tanpa nama/telepon — cukup id + email.
 */
export async function GET(req: Request) {
	if (!isAuthorizedBearer(req, "COLDREACH_API_TOKEN")) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	try {
		const prospek = await fetchAllRows<{
			id: string;
			email: string | null;
			status: string;
			alasan_berhenti: string | null;
			berhenti_at: string | null;
		}>(
			(from, to) =>
				createAdminClient()
					.from("prospek")
					.select("id, email, status, alasan_berhenti, berhenti_at")
					.in("status", [...PROSPEK_BLOKIR])
					.order("id")
					.range(from, to),
			"prospek blokir",
		);
		return NextResponse.json({ prospek });
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : String(e) },
			{ status: 500 },
		);
	}
}
