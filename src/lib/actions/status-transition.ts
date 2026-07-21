"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	applyDateTransitions,
	type DateTransitionResult,
} from "@/lib/event-status-transition";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateDashboard } from "@/lib/dashboard/stats";

export type StatusTransitionResult = DateTransitionResult;

export async function runStatusTransition(): Promise<StatusTransitionResult> {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return runStatusTransitionInternal();
}

/**
 * Internal — bypass auth. Used by cron endpoint (gated by CRON_SECRET).
 *
 * Re-derives the date-driven lifecycle for every auto-managed event. Idempotent,
 * and robust to missed runs / postponed dates because each rule looks at the
 * full set of auto-managed source statuses, not just the "expected" previous one.
 *
 *  - → in_progress          event_date == today
 *  - → awaiting_settlement   event_date < today (event has passed)
 *  - → upcoming              event_date > today (future / postponed back out)
 *
 * Terminal & manual states (completed, cancelled) are never touched, nor are
 * legacy (is_migrated_legacy=true) or soft-deleted rows.
 */
export async function runStatusTransitionInternal(): Promise<StatusTransitionResult> {
	const result = await applyDateTransitions(createAdminClient());

	revalidatePath("/operations");
	revalidateDashboard();
	revalidatePath("/finance");

	return result;
}
