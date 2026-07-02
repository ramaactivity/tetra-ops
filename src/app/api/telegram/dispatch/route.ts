import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runTelegramDigestInternal } from "@/lib/telegram/digest";

/**
 * Trigger manual/eksternal untuk digest Telegram — dipakai kalau mau jadwal
 * tambahan di luar cron Vercel harian (slot Hobby sudah penuh), mis. crontab
 * VPS sore hari:
 *
 *   30 9 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://tetra-ops-lac.vercel.app/api/telegram/dispatch?force=1"
 *
 * (09:30 UTC = 16:30 WIB. force=1 melewati dedup harian.)
 */
export const maxDuration = 60;

export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const force = new URL(request.url).searchParams.get("force") === "1";
	const result = await runTelegramDigestInternal({ force });
	return NextResponse.json({ ok: result.errors.length === 0, ...result });
}
