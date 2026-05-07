"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

export type StatusTransitionResult = {
	confirmed_to_upcoming: number;
	upcoming_to_in_progress: number;
	in_progress_to_awaiting_settlement: number;
	errors: string[];
};

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
	const c = new Date(d);
	c.setDate(c.getDate() + n);
	return c;
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
 * Transitions applied (idempotent):
 *  - confirmed → upcoming     when event_date <= today + 7
 *  - upcoming  → in_progress  when event_date == today
 *  - in_progress → awaiting_settlement when event_date < today
 *
 * Excludes legacy archive (is_migrated_legacy=true) and soft-deleted rows.
 */
export async function runStatusTransitionInternal(): Promise<StatusTransitionResult> {
	const admin = createAdminClient();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayISO = isoDate(today);
	const sevenAhead = isoDate(addDays(today, 7));

	const result: StatusTransitionResult = {
		confirmed_to_upcoming: 0,
		upcoming_to_in_progress: 0,
		in_progress_to_awaiting_settlement: 0,
		errors: [],
	};

	// 1) confirmed → upcoming (within H-7 window)
	try {
		const { data, error } = await admin
			.from("events")
			.update({ status: "upcoming", updated_at: new Date().toISOString() })
			.eq("status", "confirmed")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.lte("event_date", sevenAhead)
			.gte("event_date", todayISO)
			.select("id");
		if (error) result.errors.push(`confirmed→upcoming: ${error.message}`);
		else result.confirmed_to_upcoming = (data ?? []).length;
	} catch (err) {
		result.errors.push(
			`confirmed→upcoming: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 2) upcoming → in_progress (on event day)
	try {
		const { data, error } = await admin
			.from("events")
			.update({
				status: "in_progress",
				updated_at: new Date().toISOString(),
			})
			.eq("status", "upcoming")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("event_date", todayISO)
			.select("id");
		if (error) result.errors.push(`upcoming→in_progress: ${error.message}`);
		else result.upcoming_to_in_progress = (data ?? []).length;
	} catch (err) {
		result.errors.push(
			`upcoming→in_progress: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	// 3) in_progress → awaiting_settlement (after event day)
	try {
		const { data, error } = await admin
			.from("events")
			.update({
				status: "awaiting_settlement",
				updated_at: new Date().toISOString(),
			})
			.eq("status", "in_progress")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.lt("event_date", todayISO)
			.select("id");
		if (error)
			result.errors.push(`in_progress→awaiting_settlement: ${error.message}`);
		else result.in_progress_to_awaiting_settlement = (data ?? []).length;
	} catch (err) {
		result.errors.push(
			`in_progress→awaiting_settlement: ${err instanceof Error ? err.message : "unknown"}`,
		);
	}

	revalidatePath("/operations");
	revalidatePath("/dashboard");
	revalidatePath("/finance");

	return result;
}
