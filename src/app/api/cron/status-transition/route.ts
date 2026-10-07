import { NextResponse } from "next/server";
import { runStatusTransitionInternal } from "@/lib/actions/status-transition";
import { sweepBoothOutbox } from "@/lib/booth-sync";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron triggers this daily — see vercel.json. Re-derives the date-driven
// lifecycle for auto-managed events:
//   → in_progress (event day == today)
//   → awaiting_settlement (event date passed)
//   → upcoming (event date in the future / postponed)
// Plus: draf booking portal tanpa DP kedaluwarsa (booking.lead_expiry_days,
// DR-026) atau tanggal acaranya sudah lewat, dan kirim ulang webhook Booth
// yang tertunda.
export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	try {
		const result = await runStatusTransitionInternal();
		const today = new Date(Date.now() + 7 * 3600_000)
			.toISOString()
			.slice(0, 10);
		const { data: expired } = await createAdminClient()
			.from("client_bookings")
			.update({ status: "kedaluwarsa" })
			.eq("status", "draft")
			.or(`expires_at.lt.${new Date().toISOString()},event_date.lte.${today}`)
			.select("id");
		return NextResponse.json({
			ok: true,
			ranAt: new Date().toISOString(),
			...result,
			portalDraftsExpired: expired?.length ?? 0,
			// Webhook Booth yang gagal dikirim langsung (kontrak §4.4).
			boothWebhook: await sweepBoothOutbox(),
		});
	} catch (err) {
		return NextResponse.json(
			{
				error: err instanceof Error ? err.message : "transition failed",
			},
			{ status: 500 },
		);
	}
}
