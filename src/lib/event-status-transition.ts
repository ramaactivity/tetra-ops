import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Core date-driven status transitions, shared by:
 *  - the daily cron (runStatusTransitionInternal → adds revalidatePath after), and
 *  - lazy self-heal on page reads (Operations list + event detail), because the
 *    Hobby plan only allows ONE cron/day — without self-heal an event that passes
 *    its date mid-day would look stale until the next nightly run.
 *
 * Idempotent and robust to missed runs / postponed dates: each rule looks at the
 * full set of auto-managed source statuses, not just the "expected" previous one.
 * Terminal & manual states (completed, cancelled) are never touched, nor are
 * legacy (is_migrated_legacy=true) or soft-deleted rows.
 *
 * NOTE: must NOT call revalidatePath — it's invoked during render in the
 * self-heal path, where revalidate is illegal.
 */
export type DateTransitionResult = {
	to_in_progress: number;
	to_awaiting_settlement: number;
	to_upcoming: number;
	errors: string[];
};

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function applyDateTransitions(
	admin: SupabaseClient,
	todayISO?: string,
): Promise<DateTransitionResult> {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const day = todayISO ?? isoDate(today);
	const now = new Date().toISOString();

	const result: DateTransitionResult = {
		to_in_progress: 0,
		to_awaiting_settlement: 0,
		to_upcoming: 0,
		errors: [],
	};

	// 1) → in_progress (event day is today)
	try {
		const { data, error } = await admin
			.from("events")
			.update({ status: "in_progress", updated_at: now })
			.in("status", ["upcoming", "awaiting_settlement"])
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("event_date", day)
			.select("id");
		if (error) result.errors.push(`→in_progress: ${error.message}`);
		else result.to_in_progress = (data ?? []).length;
	} catch (err) {
		result.errors.push(
			`→in_progress: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 2) → awaiting_settlement (event date has passed)
	try {
		const { data, error } = await admin
			.from("events")
			.update({ status: "awaiting_settlement", updated_at: now })
			.in("status", ["upcoming", "in_progress"])
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.lt("event_date", day)
			.select("id");
		if (error) result.errors.push(`→awaiting_settlement: ${error.message}`);
		else result.to_awaiting_settlement = (data ?? []).length;
	} catch (err) {
		result.errors.push(
			`→awaiting_settlement: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 3) → upcoming (date is in the future, e.g. a postponed event)
	try {
		const { data, error } = await admin
			.from("events")
			.update({ status: "upcoming", updated_at: now })
			.in("status", ["in_progress", "awaiting_settlement"])
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gt("event_date", day)
			.select("id");
		if (error) result.errors.push(`→upcoming: ${error.message}`);
		else result.to_upcoming = (data ?? []).length;
	} catch (err) {
		result.errors.push(
			`→upcoming: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	return result;
}
