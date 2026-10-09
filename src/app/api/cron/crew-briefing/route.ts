import { NextResponse } from "next/server";
import { runCrewBriefing } from "@/lib/crew-briefing-run";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Briefing crew ke grup WA "Tetra Crew" — dipanggil tiap jam oleh GitHub
 * Actions (.github/workflows/crew-briefing.yml; slot cron Vercel Hobby penuh).
 * Idempoten per event per jenis, jadi aman dipanggil berulang.
 * `?dry=1` = pratinjau teks tanpa mengirim; `?only=PRJ-…` = satu event.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const sp = new URL(request.url).searchParams;
	const dry = sp.get("dry") === "1";
	// Sakelar owner: system_config crew_briefing_enabled = true (bawaan mati).
	if (!dry) {
		const { data } = await createAdminClient()
			.from("system_config")
			.select("value")
			.eq("key", "crew_briefing_enabled")
			.maybeSingle();
		if (data?.value !== true)
			return NextResponse.json({ ok: true, disabled: true });
	}
	const r = await runCrewBriefing({
		dryRun: dry,
		only: sp.get("only") ?? undefined,
	});
	return NextResponse.json({ ok: r.errors.length === 0, ...r });
}
