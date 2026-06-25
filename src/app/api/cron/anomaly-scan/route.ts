import { NextResponse } from "next/server";
import { runAnomalyScannerInternal } from "@/lib/actions/anomaly-scanner";
import { runReconciliationCheckInternal } from "@/lib/actions/reconciliation-check";
import { runTbcReminderInternal } from "@/lib/actions/tbc-reminder";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Vercel Cron triggers this daily — see vercel.json. Manually trigger via
// curl with the same Authorization header for ad-hoc runs.
//
// Runs both anomaly scanner + TBC reminder (H-7/H-3 events with missing fields)
// in the same job to avoid menambah cron entry baru. Errors di salah satu
// tidak mem-block yang lain.
export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const ranAt = new Date().toISOString();
	const [anomaly, tbc, recon] = await Promise.allSettled([
		runAnomalyScannerInternal(),
		runTbcReminderInternal(),
		runReconciliationCheckInternal(),
	]);
	return NextResponse.json({
		ok: anomaly.status === "fulfilled" || tbc.status === "fulfilled",
		ranAt,
		anomaly:
			anomaly.status === "fulfilled"
				? anomaly.value
				: { error: anomaly.reason?.message ?? "anomaly scanner failed" },
		tbc:
			tbc.status === "fulfilled"
				? tbc.value
				: { error: tbc.reason?.message ?? "tbc reminder failed" },
		reconciliation:
			recon.status === "fulfilled"
				? recon.value
				: { error: recon.reason?.message ?? "reconciliation check failed" },
	});
}
