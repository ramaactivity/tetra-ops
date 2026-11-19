import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import { downloadDriveFile } from "@/lib/drive/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payment-drafts/<id>/bukti — foto bukti transfer untuk owner saja.
 * File di Drive tidak punya link publik (data finansial klien, DR-055).
 */
export async function GET(
	_req: NextRequest,
	ctx: { params: Promise<{ id: string }> },
) {
	const me = await getCurrentUser();
	if (!me || (me.profile.role !== "owner" && me.profile.role !== "super_admin"))
		return new NextResponse("Tidak diizinkan", { status: 403 });
	const { id } = await ctx.params;
	const { data } = await createAdminClient()
		.from("payment_drafts")
		.select("bukti_file_id")
		.eq("id", id)
		.maybeSingle();
	if (!data?.bukti_file_id)
		return new NextResponse("Bukti tidak ada", { status: 404 });
	try {
		const f = await downloadDriveFile(data.bukti_file_id as string);
		return new NextResponse(new Uint8Array(f.body), {
			headers: {
				"Content-Type": f.mimeType,
				"Cache-Control": "private, max-age=300",
			},
		});
	} catch (e) {
		console.error("[payment-drafts bukti]", e);
		return new NextResponse("Gagal membuka bukti", { status: 502 });
	}
}
