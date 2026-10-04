import { NextResponse } from "next/server";
import { isAuthorizedBooth } from "@/lib/bot-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/booth/packages — paket aktif (nama, kategori, frame, durasi) untuk pilihan paket manual di wizard
 * Tetra Booth. Tanpa harga. Auth sama dengan /api/booth/bookings.
 */
export async function GET(req: Request) {
	if (!isAuthorizedBooth(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { data, error } = await createAdminClient()
		.from("packages")
		.select("name, category, frame_size, duration_hours")
		.eq("is_active", true)
		.is("deleted_at", null)
		.order("category", { ascending: true })
		.order("duration_hours", { ascending: true });
	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	return NextResponse.json({ packages: data ?? [] });
}
