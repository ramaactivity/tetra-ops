import { NextResponse } from "next/server";
import { runAnomalyScannerInternal } from "@/lib/actions/anomaly-scanner";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Vercel Cron triggers this daily — see vercel.json. Manually trigger via
// curl with the same Authorization header for ad-hoc runs.
export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	try {
		const result = await runAnomalyScannerInternal();
		return NextResponse.json({
			ok: true,
			ranAt: new Date().toISOString(),
			...result,
		});
	} catch (err) {
		return NextResponse.json(
			{
				error: err instanceof Error ? err.message : "scanner failed",
			},
			{ status: 500 },
		);
	}
}
