"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

export type StatusTransitionResult = {
	to_in_progress: number;
	to_awaiting_settlement: number;
	to_upcoming: number;
	errors: string[];
};

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
	const admin = createAdminClient();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayISO = isoDate(today);
	const now = new Date().toISOString();

	const result: StatusTransitionResult = {
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
			.eq("event_date", todayISO)
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
			.lt("event_date", todayISO)
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
			.gt("event_date", todayISO)
			.select("id");
		if (error) result.errors.push(`→upcoming: ${error.message}`);
		else result.to_upcoming = (data ?? []).length;
	} catch (err) {
		result.errors.push(
			`→upcoming: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	revalidatePath("/operations");
	revalidatePath("/dashboard");
	revalidatePath("/finance");

	return result;
}
