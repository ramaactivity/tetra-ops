import { NextResponse } from "next/server";
import { runCrewBriefing, runPostEventCrew } from "@/lib/crew-briefing-run";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runGalleryThanks } from "@/lib/gallery-thanks-run";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pesan otomatis seputar acara — dipanggil tiap 30 menit oleh GitHub Actions
 * (.github/workflows/crew-briefing.yml; slot cron Vercel Hobby penuh). Semua
 * idempoten, jadi aman dipanggil berulang.
 * - briefing crew H-1 / hari H  (sakelar system_config crew_briefing_enabled)
 * - pengingat crew selesai+30'  (sakelar crew_followup_enabled)
 * - galeri + terima kasih klien (sakelar gallery_thanks_enabled)
 * `?dry=1` = pratinjau teks tanpa mengirim; `?only=PRJ-…` = satu event.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
	if (!isAuthorizedCron(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const sp = new URL(request.url).searchParams;
	const dry = sp.get("dry") === "1";
	const only = sp.get("only") ?? undefined;
	const { data } = await createAdminClient()
		.from("system_config")
		.select("key, value")
		.in("key", [
			"crew_briefing_enabled",
			"crew_followup_enabled",
			"gallery_thanks_enabled",
		]);
	const on = (k: string) =>
		dry || data?.find((d) => d.key === k)?.value === true;
	const [briefing, followup, gallery] = await Promise.all([
		on("crew_briefing_enabled") ? runCrewBriefing({ dryRun: dry, only }) : null,
		on("crew_followup_enabled")
			? runPostEventCrew({ dryRun: dry, only })
			: null,
		on("gallery_thanks_enabled")
			? runGalleryThanks({ dryRun: dry, only })
			: null,
	]);
	const errors = [briefing, followup, gallery].flatMap((r) => r?.errors ?? []);
	return NextResponse.json({
		ok: errors.length === 0,
		briefing,
		followup,
		gallery,
	});
}
