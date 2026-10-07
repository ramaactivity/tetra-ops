import { type NextRequest, NextResponse } from "next/server";
import { BOOTH_EVENT_STATUSES, parseBoothRange } from "@/lib/booth-api";
import { BOOTH_FULL_SELECT, enrichBoothBookings } from "@/lib/booth-sync";
import { isAuthorizedBooth } from "@/lib/bot-auth";
import { todayWIB } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/booth/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Dipanggil server Tetra Booth (Bearer BOOTH_API_TOKEN) untuk wizard "Buat event → Ambil dari Tetra Ops".
 * Read-only, hanya field non-finansial (src/lib/booth-api.ts). Booking batal/selesai/arsip & soft-deleted
 * tidak ikut.
 */
export async function GET(req: NextRequest) {
	if (!isAuthorizedBooth(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const sp = req.nextUrl.searchParams;
	const range = parseBoothRange(sp.get("from"), sp.get("to"), todayWIB());
	if ("error" in range) {
		return NextResponse.json({ error: range.error }, { status: 400 });
	}
	const { data, error } = await createAdminClient()
		.from("events")
		.select(BOOTH_FULL_SELECT)
		.gte("event_date", range.from)
		.lte("event_date", range.to)
		.in("status", [...BOOTH_EVENT_STATUSES])
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.order("event_date", { ascending: true })
		.order("start_time", { ascending: true })
		.limit(500);
	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	return NextResponse.json({
		...range,
		// Field kontrak v0.4 §2.1 tetap; §2.2 (unit_count, modules, cancelled,
		// design, portal_url) ditambahkan — aditif, Booth membuang yang tak dikenal.
		bookings: await enrichBoothBookings(
			(data ?? []) as unknown as Parameters<typeof enrichBoothBookings>[0],
		),
	});
}
