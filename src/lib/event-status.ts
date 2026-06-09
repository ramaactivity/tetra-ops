/**
 * Event lifecycle — the single source of truth for the simplified status model.
 *
 * Five statuses, mostly driven automatically by the event date + settlement:
 *   - upcoming             event_date is in the future (default for new bookings)
 *   - in_progress          event_date == today (hari-H)
 *   - awaiting_settlement  event_date has passed, not yet settled
 *   - completed            settlement done (set by settle_event RPC); legacy too
 *   - cancelled            manual, sticky
 *
 * The deprecated draft / confirmed / archived values still exist in the
 * `event_status` Postgres enum (enum values can't easily be dropped) but are no
 * longer written by the app — see 20260618_simplify_event_lifecycle.sql.
 *
 * This module is plain (no "use server") so it can export constants safely and
 * be imported by both server actions and client components.
 */
export const EVENT_STATUSES = [
	"upcoming",
	"in_progress",
	"awaiting_settlement",
	"completed",
	"cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Date-driven part of the lifecycle. Terminal states (completed, cancelled)
 * and legacy rows are decided elsewhere — this only covers the automatic
 * upcoming / in_progress / awaiting_settlement window. Compares YYYY-MM-DD
 * strings lexicographically (valid for ISO dates). */
export function computeLifecycleStatus(
	eventDateISO: string,
	todayISO: string,
): "upcoming" | "in_progress" | "awaiting_settlement" {
	if (eventDateISO > todayISO) return "upcoming";
	if (eventDateISO === todayISO) return "in_progress";
	return "awaiting_settlement";
}
