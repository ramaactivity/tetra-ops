import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Company-wide dashboard aggregates.
 *
 * Every figure here is identical for all owners/super_admins (no per-user
 * filtering), so it's cached ONCE for the whole org rather than recomputed on
 * each visit. Previously the dashboard ran ~15 Supabase round-trips on every
 * load (Vercel Active CPU per visit); now repeat visits within the revalidate
 * window are served from the Next data cache.
 *
 * Why a service-role client: Next forbids reading request cookies inside an
 * unstable_cache scope, so the cookie-bound client can't be used here. The
 * dashboard page still gates access by role (owner-level layout + getCurrentUser)
 * BEFORE calling this, and the cached result is server-side only — never shipped
 * to unauthorized clients. The data is aggregate counts/sums that owners are
 * already entitled to see.
 *
 * Staleness: revalidate=300 → at most ~5 min stale, which is fine for KPI tiles.
 * Date-dependent ranges are passed as args so each day (and the rolling 7-day
 * window) gets its own cache entry.
 */
export type DashboardStats = {
	thisMonthRevenue: number;
	lastMonthRevenue: number;
	/** % change vs last month; null when last month had no revenue (no base). */
	revenueDeltaPct: number | null;
	/** Per-day revenue totals across the current month (for the hero sparkline). */
	dailyRevenue: number[];
	outstanding: number;
	monthCount: number;
	awaitingCount: number;
	upcoming7dCount: number;
	inProgressCount: number;
	completedThisMonthCount: number;
	yearCount: number;
	monthCancelled: number;
	monthUpcoming: number;
	invoicePaid: number;
	invoicePartial: number;
	invoiceUnpaid: number;
	targets: { monthly: number; yearly: number };
	nextEvents: Array<{
		id: string;
		project_id: string;
		status: string;
		client_name: string;
		event_date: string;
		setup_time: string | null;
		start_time: string | null;
		venue_name: string;
		venue_city: string | null;
	}>;
};

type DashboardStatsParams = {
	ymStart: string;
	ymEnd: string;
	lastMonthStart: string;
	lastMonthEnd: string;
	yearStart: string;
	yearEnd: string;
	todayISO: string;
	tomorrowISO: string;
	sevenFromNowISO: string;
};

async function fetchDashboardStats(
	p: DashboardStatsParams,
): Promise<DashboardStats> {
	const supabase = createAdminClient();

	const [
		monthRevenueResult,
		outstandingResult,
		monthCountResult,
		awaitingCountResult,
		upcoming7dCountResult,
		inProgressCountResult,
		completedThisMonthCountResult,
		nextEventsResult,
		yearCountResult,
		monthCancelledResult,
		monthUpcomingResult,
		invoicePaidResult,
		invoicePartialResult,
		invoiceUnpaidResult,
		targetsResult,
		lastMonthRevenueResult,
	] = await Promise.all([
		supabase
			.from("payments")
			.select("amount, payment_date")
			.eq("is_reversed", false)
			.gte("payment_date", p.ymStart)
			.lte("payment_date", p.ymEnd),
		supabase.rpc("get_outstanding_total"),
		// Event count this month — counts ALL events incl. legacy/archived
		// (event-count metric, not financial). Matches Operations "Bulan Ini".
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.gte("event_date", p.ymStart)
			.lte("event_date", p.ymEnd),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("status", "awaiting_settlement"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("status", "upcoming")
			.gte("event_date", p.todayISO)
			.lte("event_date", p.sevenFromNowISO),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("status", "in_progress"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("status", "completed")
			.gte("event_date", p.ymStart)
			.lte("event_date", p.ymEnd),
		supabase
			.from("events")
			.select(
				"id, project_id, status, client_name, event_date, setup_time, start_time, venue_name, venue_city",
			)
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", p.todayISO)
			.lte("event_date", p.tomorrowISO)
			.order("event_date", { ascending: true })
			.order("start_time", { ascending: true }),
		// Event count this year — counts ALL events incl. legacy/archived so the
		// yearly target reflects every event done this year. Matches Operations
		// "Tahun Ini". (Financial figures below stay legacy-free.)
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.gte("event_date", p.yearStart)
			.lte("event_date", p.yearEnd),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", p.ymStart)
			.lte("event_date", p.ymEnd)
			.eq("status", "cancelled"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", p.ymStart)
			.lte("event_date", p.ymEnd)
			.in("status", ["upcoming", "in_progress"]),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("payment_status", "paid"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("payment_status", "partial"),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("payment_status", "unpaid"),
		supabase
			.from("system_config")
			.select("key, value")
			.in("key", ["event_target_monthly", "event_target_yearly"]),
		supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", p.lastMonthStart)
			.lte("payment_date", p.lastMonthEnd),
	]);

	const monthPayments = (monthRevenueResult.data ?? []) as Array<{
		amount: number | null;
		payment_date: string | null;
	}>;
	const thisMonthRevenue = monthPayments.reduce(
		(sum, row) => sum + (row.amount ?? 0),
		0,
	);
	const lastMonthRevenue = (
		(lastMonthRevenueResult.data ?? []) as Array<{ amount: number | null }>
	).reduce((sum, row) => sum + (row.amount ?? 0), 0);
	const revenueDeltaPct =
		lastMonthRevenue > 0
			? Math.round(
					((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100,
				)
			: null;

	// Per-day revenue across the month (0-filled for days w/o payments) so the
	// hero sparkline has an even daily x-axis. Built from the same query rows.
	const revenueByDay = new Map<string, number>();
	for (const row of monthPayments) {
		const day = (row.payment_date ?? "").slice(0, 10);
		if (!day) continue;
		revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + (row.amount ?? 0));
	}
	const dailyRevenue: number[] = [];
	{
		const cursor = new Date(`${p.ymStart}T00:00:00`);
		const end = new Date(`${p.ymEnd}T00:00:00`);
		while (cursor <= end) {
			const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
			dailyRevenue.push(revenueByDay.get(key) ?? 0);
			cursor.setDate(cursor.getDate() + 1);
		}
	}

	type ConfigRow = { key: string; value: number | string | null };
	const targets = ((targetsResult.data ?? []) as ConfigRow[]).reduce<{
		monthly: number;
		yearly: number;
	}>(
		(acc, r) => {
			const v = typeof r.value === "number" ? r.value : Number(r.value ?? 0);
			if (r.key === "event_target_monthly") acc.monthly = v || 10;
			if (r.key === "event_target_yearly") acc.yearly = v || 100;
			return acc;
		},
		{ monthly: 10, yearly: 100 },
	);

	return {
		thisMonthRevenue,
		lastMonthRevenue,
		revenueDeltaPct,
		dailyRevenue,
		outstanding: (outstandingResult.data as number | null) ?? 0,
		monthCount: monthCountResult.count ?? 0,
		awaitingCount: awaitingCountResult.count ?? 0,
		upcoming7dCount: upcoming7dCountResult.count ?? 0,
		inProgressCount: inProgressCountResult.count ?? 0,
		completedThisMonthCount: completedThisMonthCountResult.count ?? 0,
		yearCount: yearCountResult.count ?? 0,
		monthCancelled: monthCancelledResult.count ?? 0,
		monthUpcoming: monthUpcomingResult.count ?? 0,
		invoicePaid: invoicePaidResult.count ?? 0,
		invoicePartial: invoicePartialResult.count ?? 0,
		invoiceUnpaid: invoiceUnpaidResult.count ?? 0,
		targets,
		nextEvents: (nextEventsResult.data ?? []) as DashboardStats["nextEvents"],
	};
}

const cachedDashboardStats = unstable_cache(
	fetchDashboardStats,
	["dashboard-stats"],
	{ revalidate: 300, tags: ["dashboard-stats"] },
);

export function getDashboardStats(
	params: DashboardStatsParams,
): Promise<DashboardStats> {
	return cachedDashboardStats(params);
}
