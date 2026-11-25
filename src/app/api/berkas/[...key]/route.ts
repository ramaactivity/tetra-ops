import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import { r2Get } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/berkas/<owner|tim>/… — berkas privat di R2 (DR-066). "owner" hanya
 * owner; "tim" owner + crew. Tanpa link publik.
 */
export async function GET(
	_req: NextRequest,
	ctx: { params: Promise<{ key: string[] }> },
) {
	const me = await getCurrentUser();
	const { key } = await ctx.params;
	const kelompok = key[0];
	const role = me?.profile.role;
	const owner = role === "owner" || role === "super_admin";
	const boleh =
		kelompok === "owner"
			? owner
			: kelompok === "tim"
				? owner || role === "crew"
				: false;
	if (!me || !boleh)
		return new NextResponse("Tidak diizinkan", { status: 403 });
	if (key.some((k) => k === ".." || k === ""))
		return new NextResponse("Tidak ada", { status: 404 });
	try {
		const o = await r2Get(`berkas/${key.join("/")}`);
		if (!o) return new NextResponse("Tidak ada", { status: 404 });
		return new NextResponse(new Uint8Array(o.bytes), {
			headers: {
				"Content-Type": o.type,
				"Cache-Control": "private, max-age=3600",
			},
		});
	} catch (e) {
		console.error("[api/berkas]", e);
		return new NextResponse("Gagal membuka berkas", { status: 502 });
	}
}
