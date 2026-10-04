import { type NextRequest, NextResponse } from "next/server";
import {
	BOOTH_EVENT_SELECT,
	BOOTH_EVENT_STATUSES,
	type BoothEventRow,
	parseBoothRange,
	toBoothBooking,
} from "@/lib/booth-api";
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
		.select(BOOTH_EVENT_SELECT)
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
		bookings: ((data ?? []) as unknown as BoothEventRow[]).map(toBoothBooking),
	});
}
