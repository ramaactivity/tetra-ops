import { NextResponse } from "next/server";
import { runDepreciationInternal } from "@/lib/actions/depreciation";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Vercel Cron — accrue monthly depreciation for the current month (see
// vercel.json). Idempotent RPC, so a late/repeated run is safe.
export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	try {
		const result = await runDepreciationInternal();
		return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "depreciation failed" },
			{ status: 500 },
		);
	}
}
