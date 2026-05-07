"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

type Severity = "alert" | "warning" | "info" | "success";
type Category = "operational" | "financial" | "inventory" | "system";

type Match = {
	entity_type: string;
	entity_id: string;
	title: string;
	body: string;
	action_url?: string;
};

type Rule = {
	id: string;
	code: string;
	name: string;
	category: Category;
	severity: Severity;
	trigger_condition: Record<string, unknown>;
	recipient_roles: string[];
	is_enabled: boolean;
};

type ScanResult = {
	scanned: number;
	matched: number;
	created: number;
	skipped: number;
	errors: string[];
	byRule: Array<{ code: string; matched: number; created: number }>;
};

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
	const c = new Date(d);
	c.setDate(c.getDate() + n);
	return c;
}

export async function runAnomalyScanner(): Promise<ScanResult> {
	const me = await getCurrentUser();
	if (!me) throw new Error("Unauthorized");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return runAnomalyScannerInternal();
}

/**
 * Internal variant — no auth. Use ONLY from authenticated server actions
 * (which gate auth themselves) or from the Vercel cron endpoint
 * (which gates via CRON_SECRET).
 */
export async function runAnomalyScannerInternal(): Promise<ScanResult> {
	const admin = createAdminClient();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayISO = isoDate(today);

	const result: ScanResult = {
		scanned: 0,
		matched: 0,
		created: 0,
		skipped: 0,
		errors: [],
		byRule: [],
	};

	// Fetch all enabled rules + all recipient users we might need
	const [{ data: rulesData }, { data: usersData }] = await Promise.all([
		admin
			.from("notification_rules")
			.select(
				"id, code, name, category, severity, trigger_condition, recipient_roles, is_enabled",
			)
			.eq("is_enabled", true),
		admin
			.from("users")
			.select("id, role")
			.is("deleted_at", null)
			.eq("is_active", true),
	]);

	const rules = (rulesData ?? []) as Rule[];
	const users = ((usersData ?? []) as Array<{ id: string; role: string }>);
	result.scanned = rules.length;

	if (rules.length === 0) return result;

	for (const rule of rules) {
		try {
			let matches: Match[] = [];
			switch (rule.code) {
				case "h_minus_2_no_crew":
					matches = await checkHMinusNoCrew(admin, addDays(today, 2));
					break;
				case "h_minus_1_no_design":
					matches = await checkHMinusNoDesign(admin, addDays(today, 1));
					break;
				case "h_minus_3_not_paid":
					matches = await checkHMinusNotPaid(admin, addDays(today, 3));
					break;
				case "h_minus_7_no_dp":
					matches = await checkHMinusNoDP(admin, addDays(today, 7));
					break;
				case "invoice_overdue_1d":
					matches = await checkInvoiceOverdue(admin, todayISO, 1);
					break;
				case "invoice_overdue_7d":
					matches = await checkInvoiceOverdue(admin, todayISO, 7);
					break;
				case "loss_event":
					matches = await checkLossEvent(admin);
					break;
				case "pending_user_24h":
					matches = await checkPendingUser24h(admin);
					break;
				case "stock_critical":
					matches = await checkStockCritical(admin);
					break;
				case "stock_zero":
					matches = await checkStockZero(admin);
					break;
				case "crew_double_booked":
					matches = await checkCrewDoubleBooked(admin);
					break;
				case "equipment_missing":
					matches = await checkEquipmentMissing(admin, today);
					break;
				default:
					// Unknown rule code — skip silently
					continue;
			}

			result.matched += matches.length;

			if (matches.length === 0) {
				result.byRule.push({ code: rule.code, matched: 0, created: 0 });
				continue;
			}

			// Resolve recipients for this rule
			const roles = new Set(rule.recipient_roles ?? []);
			const recipients = users.filter((u) => roles.has(u.role));
			if (recipients.length === 0) {
				result.byRule.push({
					code: rule.code,
					matched: matches.length,
					created: 0,
				});
				continue;
			}

			// Build proposed inserts: entity × recipient
			const proposed: Array<{
				rule_id: string;
				user_id: string;
				entity_type: string;
				entity_id: string;
				title: string;
				body: string;
				action_url?: string;
			}> = [];
			for (const m of matches) {
				for (const u of recipients) {
					proposed.push({
						rule_id: rule.id,
						user_id: u.id,
						entity_type: m.entity_type,
						entity_id: m.entity_id,
						title: m.title,
						body: m.body,
						action_url: m.action_url,
					});
				}
			}

			// Dedup against existing unread + non-dismissed notifications
			// for the same (rule, entity, user) combo
			const entityIds = Array.from(new Set(matches.map((m) => m.entity_id)));
			const userIds = Array.from(new Set(recipients.map((u) => u.id)));
			const { data: existingDups } = await admin
				.from("notifications")
				.select("user_id, entity_id, anomaly_rule_id")
				.eq("anomaly_rule_id", rule.id)
				.eq("is_dismissed", false)
				.eq("is_read", false)
				.in("user_id", userIds)
				.in("entity_id", entityIds);

			const dupKey = (
				userId: string,
				entityId: string,
			) => `${userId}::${entityId}`;
			const dupSet = new Set(
				((existingDups ?? []) as Array<{
					user_id: string;
					entity_id: string;
				}>).map((d) => dupKey(d.user_id, d.entity_id)),
			);

			const toInsert = proposed.filter(
				(p) => !dupSet.has(dupKey(p.user_id, p.entity_id)),
			);
			result.skipped += proposed.length - toInsert.length;

			if (toInsert.length === 0) {
				result.byRule.push({
					code: rule.code,
					matched: matches.length,
					created: 0,
				});
				continue;
			}

			// Bulk insert
			const rows = toInsert.map((p) => ({
				user_id: p.user_id,
				severity: rule.severity,
				category: rule.category,
				title: p.title,
				body: p.body,
				entity_type: p.entity_type,
				entity_id: p.entity_id,
				action_url: p.action_url ?? null,
				anomaly_rule_id: p.rule_id,
			}));
			const { error: insertErr } = await admin
				.from("notifications")
				.insert(rows);
			if (insertErr) {
				result.errors.push(`${rule.code}: ${insertErr.message}`);
				result.byRule.push({
					code: rule.code,
					matched: matches.length,
					created: 0,
				});
				continue;
			}

			result.created += rows.length;
			result.byRule.push({
				code: rule.code,
				matched: matches.length,
				created: rows.length,
			});
		} catch (err) {
			result.errors.push(
				`${rule.code}: ${err instanceof Error ? err.message : "unknown"}`,
			);
		}
	}

	revalidatePath("/notifications");
	revalidatePath("/dashboard");
	revalidatePath("/operations");
	revalidatePath("/finance");
	return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-rule checks
// ─────────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

async function checkHMinusNoCrew(
	admin: AdminClient,
	targetDate: Date,
): Promise<Match[]> {
	const dateISO = isoDate(targetDate);
	const { data: events } = await admin
		.from("events")
		.select("id, project_id, client_name, event_date, venue_name")
		.eq("event_date", dateISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.in("status", [
			"draft",
			"confirmed",
			"design_brief",
			"design_approved",
			"upcoming",
		]);

	if (!events || events.length === 0) return [];

	const eventIds = events.map((e) => e.id as string);
	const { data: assignments } = await admin
		.from("crew_assignments")
		.select("event_id")
		.in("event_id", eventIds);
	const haveCrew = new Set(
		((assignments ?? []) as Array<{ event_id: string }>).map((a) => a.event_id),
	);

	return (events as Array<{
		id: string;
		project_id: string;
		client_name: string;
		event_date: string;
		venue_name: string;
	}>)
		.filter((e) => !haveCrew.has(e.id))
		.map((e) => ({
			entity_type: "event",
			entity_id: e.id,
			title: `Event H-2 belum ada crew: ${e.client_name}`,
			body: `${e.event_date} · ${e.venue_name} — assign crew sekarang sebelum hari H.`,
			action_url: `/operations/${e.project_id}/crew`,
		}));
}

async function checkHMinusNoDesign(
	admin: AdminClient,
	targetDate: Date,
): Promise<Match[]> {
	const dateISO = isoDate(targetDate);
	const { data: events } = await admin
		.from("events")
		.select(
			"id, project_id, client_name, event_date, venue_name, design_approved_at",
		)
		.eq("event_date", dateISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.is("design_approved_at", null);
	return ((events ?? []) as Array<{
		id: string;
		project_id: string;
		client_name: string;
		event_date: string;
		venue_name: string;
	}>).map((e) => ({
		entity_type: "event",
		entity_id: e.id,
		title: `Event H-1 desain belum ACC: ${e.client_name}`,
		body: `${e.event_date} · ${e.venue_name} — approve desain sekarang.`,
		action_url: `/operations/${e.project_id}`,
	}));
}

async function checkHMinusNotPaid(
	admin: AdminClient,
	targetDate: Date,
): Promise<Match[]> {
	const dateISO = isoDate(targetDate);
	const { data: events } = await admin
		.from("events")
		.select("id, project_id, client_name, event_date, remaining_balance")
		.eq("event_date", dateISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.gt("remaining_balance", 0);
	return ((events ?? []) as Array<{
		id: string;
		project_id: string;
		client_name: string;
		event_date: string;
		remaining_balance: number;
	}>).map((e) => ({
		entity_type: "event",
		entity_id: e.id,
		title: `Event H-3 belum lunas: ${e.client_name}`,
		body: `Sisa Rp ${e.remaining_balance.toLocaleString("id-ID")} · ${e.event_date}`,
		action_url: `/operations/${e.project_id}/payments`,
	}));
}

async function checkHMinusNoDP(
	admin: AdminClient,
	targetDate: Date,
): Promise<Match[]> {
	const dateISO = isoDate(targetDate);
	const { data: events } = await admin
		.from("events")
		.select("id, project_id, client_name, event_date, total_paid")
		.eq("event_date", dateISO)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.eq("total_paid", 0);
	return ((events ?? []) as Array<{
		id: string;
		project_id: string;
		client_name: string;
		event_date: string;
	}>).map((e) => ({
		entity_type: "event",
		entity_id: e.id,
		title: `Event H-7 belum DP: ${e.client_name}`,
		body: `${e.event_date} — chase DP atau pertimbangkan cancel.`,
		action_url: `/operations/${e.project_id}`,
	}));
}

async function checkInvoiceOverdue(
	admin: AdminClient,
	todayISO: string,
	daysAfter: number,
): Promise<Match[]> {
	const cutoff = isoDate(addDays(new Date(`${todayISO}T00:00:00`), -daysAfter));
	const { data: events } = await admin
		.from("events")
		.select(
			"id, project_id, client_name, due_date, remaining_balance, payment_status",
		)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.neq("payment_status", "paid")
		.gt("remaining_balance", 0)
		.lte("due_date", cutoff)
		.not("due_date", "is", null);
	return ((events ?? []) as Array<{
		id: string;
		project_id: string;
		client_name: string;
		due_date: string;
		remaining_balance: number;
	}>).map((e) => ({
		entity_type: "event",
		entity_id: e.id,
		title: `Invoice overdue ${daysAfter}d: ${e.client_name}`,
		body: `Due ${e.due_date} · sisa Rp ${e.remaining_balance.toLocaleString("id-ID")}`,
		action_url: `/operations/${e.project_id}/payments`,
	}));
}

async function checkLossEvent(admin: AdminClient): Promise<Match[]> {
	const { data: settlements } = await admin
		.from("event_settlements")
		.select(
			`event_id, net_profit, closed_at,
			event:events!inner(id, project_id, client_name)`,
		)
		.eq("is_loss", true)
		.eq("is_reopened", false);
	return ((settlements ?? []) as Array<{
		event_id: string;
		net_profit: number;
		closed_at: string;
		event:
			| { id: string; project_id: string; client_name: string }
			| Array<{ id: string; project_id: string; client_name: string }>
			| null;
	}>)
		.map((s) => {
			const ev = Array.isArray(s.event) ? s.event[0] : s.event;
			if (!ev) return null;
			return {
				entity_type: "event",
				entity_id: ev.id,
				title: `Event rugi: ${ev.client_name}`,
				body: `Net profit Rp ${s.net_profit.toLocaleString("id-ID")} · review settlement.`,
				action_url: `/operations/${ev.project_id}`,
			} as Match;
		})
		.filter((m): m is Match => m !== null);
}

async function checkPendingUser24h(admin: AdminClient): Promise<Match[]> {
	const cutoff = new Date();
	cutoff.setHours(cutoff.getHours() - 24);
	const { data: users } = await admin
		.from("users")
		.select("id, full_name, email, created_at")
		.eq("role", "pending_approval")
		.is("deleted_at", null)
		.lte("created_at", cutoff.toISOString());
	return ((users ?? []) as Array<{
		id: string;
		full_name: string;
		email: string;
	}>).map((u) => ({
		entity_type: "user",
		entity_id: u.id,
		title: `Pending approval >24h: ${u.full_name}`,
		body: `${u.email} — review di /settings/crew`,
		action_url: `/settings/crew`,
	}));
}

async function checkStockCritical(admin: AdminClient): Promise<Match[]> {
	const { data: items } = await admin
		.from("inventory_items")
		.select("id, sku, name, min_stock_alert")
		.eq("category", "consumable")
		.eq("is_active", true)
		.gt("min_stock_alert", 0);
	if (!items) return [];

	const matches: Match[] = [];
	for (const item of items as Array<{
		id: string;
		sku: string;
		name: string;
		min_stock_alert: number;
	}>) {
		const { data: stock } = await admin.rpc("get_current_stock", {
			p_item_id: item.id,
		});
		const current = (stock as number | null) ?? 0;
		if (current > 0 && current < item.min_stock_alert) {
			matches.push({
				entity_type: "inventory_item",
				entity_id: item.id,
				title: `Stok kritis: ${item.name}`,
				body: `Sisa ${current} (min ${item.min_stock_alert}) · SKU ${item.sku}`,
				action_url: `/warehouse`,
			});
		}
	}
	return matches;
}

async function checkStockZero(admin: AdminClient): Promise<Match[]> {
	const { data: items } = await admin
		.from("inventory_items")
		.select("id, sku, name, min_stock_alert")
		.eq("category", "consumable")
		.eq("is_active", true)
		.gt("min_stock_alert", 0);
	if (!items) return [];

	const matches: Match[] = [];
	for (const item of items as Array<{
		id: string;
		sku: string;
		name: string;
		min_stock_alert: number;
	}>) {
		const { data: stock } = await admin.rpc("get_current_stock", {
			p_item_id: item.id,
		});
		const current = (stock as number | null) ?? 0;
		if (current === 0) {
			matches.push({
				entity_type: "inventory_item",
				entity_id: item.id,
				title: `Stok habis: ${item.name}`,
				body: `SKU ${item.sku} — restock segera.`,
				action_url: `/warehouse`,
			});
		}
	}
	return matches;
}

async function checkCrewDoubleBooked(admin: AdminClient): Promise<Match[]> {
	// Find crew_assignments where the same user has 2+ events on the same date
	// in the upcoming window (today onwards)
	const todayISO = isoDate(new Date());
	const { data: assignments } = await admin
		.from("crew_assignments")
		.select(
			`user_id,
			event:events!inner(id, project_id, client_name, event_date)`,
		)
		.gte("event.event_date", todayISO);

	if (!assignments) return [];

	type Row = {
		user_id: string;
		event:
			| { id: string; project_id: string; client_name: string; event_date: string }
			| Array<{
					id: string;
					project_id: string;
					client_name: string;
					event_date: string;
				}>
			| null;
	};

	const rows = assignments as Row[];
	const conflicts = new Map<string, Row[]>(); // key = user_id::date
	for (const a of rows) {
		const ev = Array.isArray(a.event) ? a.event[0] : a.event;
		if (!ev) continue;
		const k = `${a.user_id}::${ev.event_date}`;
		const list = conflicts.get(k) ?? [];
		list.push(a);
		conflicts.set(k, list);
	}

	// Fetch crew names
	const conflictUserIds = new Set<string>();
	for (const [k, list] of conflicts.entries()) {
		if (list.length > 1) {
			conflictUserIds.add(k.split("::")[0]);
		}
	}
	const { data: usersData } = conflictUserIds.size
		? await admin
				.from("users")
				.select("id, full_name")
				.in("id", Array.from(conflictUserIds))
		: { data: [] as Array<{ id: string; full_name: string }> };
	const nameById = new Map(
		((usersData ?? []) as Array<{ id: string; full_name: string }>).map(
			(u) => [u.id, u.full_name],
		),
	);

	const matches: Match[] = [];
	for (const [k, list] of conflicts.entries()) {
		if (list.length < 2) continue;
		const [userId, date] = k.split("::");
		const name = nameById.get(userId) ?? "Crew";
		const events = list
			.map((l) => (Array.isArray(l.event) ? l.event[0] : l.event))
			.filter((e): e is NonNullable<typeof e> => !!e);
		const firstEvent = events[0];
		matches.push({
			entity_type: "crew_assignment",
			entity_id: `${userId}-${date}`,
			title: `Crew double-booked: ${name} · ${date}`,
			body: events
				.map((e) => `${e.client_name} (${e.project_id})`)
				.join(" + "),
			action_url: firstEvent
				? `/operations/${firstEvent.project_id}/crew`
				: `/operations/team`,
		});
	}
	return matches;
}

async function checkEquipmentMissing(
	admin: AdminClient,
	today: Date,
): Promise<Match[]> {
	const dayAgo = new Date(today);
	dayAgo.setDate(dayAgo.getDate() - 1);
	const dayAgoISO = isoDate(dayAgo);

	// Equipment items with current_event_id pointing to events that have
	// already passed (event_date <= yesterday)
	const { data: items } = await admin
		.from("inventory_items")
		.select(
			`id, sku, name, current_event_id,
			event:events!inventory_items_current_event_id_fkey(id, project_id, client_name, event_date)`,
		)
		.eq("category", "equipment")
		.not("current_event_id", "is", null);

	return ((items ?? []) as Array<{
		id: string;
		sku: string;
		name: string;
		event:
			| {
					id: string;
					project_id: string;
					client_name: string;
					event_date: string;
				}
			| Array<{
					id: string;
					project_id: string;
					client_name: string;
					event_date: string;
				}>
			| null;
	}>)
		.map((i) => {
			const ev = Array.isArray(i.event) ? i.event[0] : i.event;
			if (!ev) return null;
			if (ev.event_date > dayAgoISO) return null; // event is today or future
			return {
				entity_type: "inventory_item",
				entity_id: i.id,
				title: `Alat belum kembali: ${i.name}`,
				body: `Last seen di event "${ev.client_name}" tgl ${ev.event_date} — check-in di /operations/${ev.project_id}/equipment.`,
				action_url: `/operations/${ev.project_id}/equipment`,
			} as Match;
		})
		.filter((m): m is Match => m !== null);
}
