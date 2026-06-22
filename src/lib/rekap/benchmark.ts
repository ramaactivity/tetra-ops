import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type CetakBenchmark = { typical: number; sampleSize: number };

/**
 * Median cetak_total of APPROVED rekaps for other events on the same package —
 * a cheap "is this number sane?" benchmark for the crew form. Uses the admin
 * client because crew RLS scopes crew_rekap to their own assigned events, so a
 * crew-session query could never see the cross-event history. Cetak counts
 * aren't a business secret (unlike cost/HPP), so exposing the benchmark to crew
 * is fine. Median, not mean — event sizes are skewed (a few huge events would
 * drag a mean up). Best-effort: any failure returns null (no warning shown).
 */
export async function getCetakBenchmark(
	eventId: string,
): Promise<CetakBenchmark | null> {
	try {
		const admin = createAdminClient();

		const { data: ev } = await admin
			.from("events")
			.select("package_id")
			.eq("id", eventId)
			.maybeSingle();
		const packageId = (ev?.package_id as string | null) ?? null;
		if (!packageId) return null;

		const { data: samePkgEvents } = await admin
			.from("events")
			.select("id")
			.eq("package_id", packageId)
			.neq("id", eventId)
			.limit(300);
		const ids = (samePkgEvents ?? []).map((e) => e.id as string);
		if (ids.length === 0) return null;

		const { data: rekaps } = await admin
			.from("crew_rekap")
			.select("cetak_total")
			.in("event_id", ids)
			.eq("is_approved", true)
			.gt("cetak_total", 0)
			.limit(500);

		const vals = (rekaps ?? [])
			.map((r) => Number(r.cetak_total) || 0)
			.filter((n) => n > 0)
			.sort((a, b) => a - b);
		if (vals.length < 3) return { typical: 0, sampleSize: vals.length };

		const mid = Math.floor(vals.length / 2);
		const median =
			vals.length % 2 === 1
				? vals[mid]
				: Math.round((vals[mid - 1] + vals[mid]) / 2);
		return { typical: median, sampleSize: vals.length };
	} catch {
		return null;
	}
}
