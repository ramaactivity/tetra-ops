import { NextResponse } from "next/server";
import { runStatusTransitionInternal } from "@/lib/actions/status-transition";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Vercel Cron triggers this daily — see vercel.json. Transitions:
//   confirmed → upcoming (H-7)
//   upcoming → in_progress (event day)
//   in_progress → awaiting_settlement (after event)
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
