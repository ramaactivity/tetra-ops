import { NextResponse } from "next/server";
import { runStatusTransitionInternal } from "@/lib/actions/status-transition";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Vercel Cron triggers this daily — see vercel.json. Re-derives the date-driven
// lifecycle for auto-managed events:
//   → in_progress (event day == today)
//   → awaiting_settlement (event date passed)
//   → upcoming (event date in the future / postponed)
export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	try {
		const result = await runStatusTransitionInternal();
		return NextResponse.json({
			ok: true,
			ranAt: new Date().toISOString(),
			...result,
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
