import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegramRekapSubmitted } from "@/lib/telegram/notify";

/**
 * Event-driven rekap notifications — closes the comms loop the crew success
 * page already promises ("lo akan dapat notif kalau approve / revisi / settle").
 *
 * Inserts into the per-user `notifications` table. RLS on that table is
 * self-only (user_id = auth.uid()), so writing rows for OTHER users must go
 * through the service-role admin client — same pattern as the anomaly scanner.
 *
 * Every function here is best-effort and MUST NOT throw: notifications are a
 * side-channel; a failure to notify must never roll back or break the rekap
 * submit / approve / settle that triggered it. All errors are swallowed +
 * logged.
 */

type Severity = "alert" | "warning" | "info" | "success";
type Category = "operational" | "financial" | "inventory" | "system";

type NotifRow = {
	user_id: string;
	severity: Severity;
	category: Category;
	title: string;
	body: string;
	entity_type: string;
	entity_id: string;
	action_url: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

async function eventClientName(
	admin: AdminClient,
	eventId: string,
): Promise<string> {
	const { data } = await admin
		.from("events")
		.select("client_name")
		.eq("id", eventId)
		.maybeSingle();
	return (data?.client_name as string) || "Event";
}

/** All active owner / super_admin user ids. */
async function ownerRecipients(admin: AdminClient): Promise<string[]> {
	const { data } = await admin
		.from("users")
		.select("id, role")
		.eq("is_active", true)
		.is("deleted_at", null);
	return (data ?? [])
		.filter((u) => u.role === "owner" || u.role === "super_admin")
		.map((u) => u.id as string);
}

/** Crew user ids assigned to an event (deduped). */
async function crewRecipients(
	admin: AdminClient,
	eventId: string,
): Promise<string[]> {
	const { data } = await admin
		.from("crew_assignments")
		.select("user_id")
		.eq("event_id", eventId);
	return [...new Set((data ?? []).map((r) => r.user_id as string))].filter(
		Boolean,
	);
}

async function insertFor(
	admin: AdminClient,
	userIds: string[],
	base: Omit<NotifRow, "user_id">,
): Promise<void> {
	if (userIds.length === 0) return;
	const rows: NotifRow[] = userIds.map((user_id) => ({ user_id, ...base }));
	const { error } = await admin.from("notifications").insert(rows);
	if (error)
		console.error("[rekap-notifications] insert failed:", error.message);
}

/** Crew submitted a rekap → ping owners to review. */
export async function notifyRekapSubmitted(
	eventId: string,
	projectId: string,
	submittedByName: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const [name, recipients] = await Promise.all([
			eventClientName(admin, eventId),
			ownerRecipients(admin),
		]);
		await insertFor(admin, recipients, {
			severity: "info",
			category: "operational",
			title: `Rekap baru: ${name}`,
			body: `${submittedByName} sudah submit rekap. Tap untuk review & approve.`,
			entity_type: "crew_rekap",
			entity_id: eventId,
			action_url: `/operations/${projectId}/rekap`,
		});
		await notifyTelegramRekapSubmitted(eventId, projectId, submittedByName);
	} catch (e) {
		console.error("[rekap-notifications] notifyRekapSubmitted:", e);
	}
}

/** Owner approved or rejected → tell the assigned crew. */
export async function notifyRekapReviewed(
	eventId: string,
	projectId: string,
	approved: boolean,
	reviewNotes: string | null,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const [name, recipients] = await Promise.all([
			eventClientName(admin, eventId),
			crewRecipients(admin, eventId),
		]);
		const base = approved
			? {
					severity: "success" as const,
					title: `Rekap di-approve: ${name}`,
					body: "Rekap kamu sudah di-approve owner. 🎉",
				}
			: {
					severity: "warning" as const,
					title: `Rekap perlu revisi: ${name}`,
					body: reviewNotes
						? `Catatan owner: ${reviewNotes}`
						: "Owner minta rekap direvisi. Tap untuk update.",
				};
		await insertFor(admin, recipients, {
			...base,
			category: "operational",
			entity_type: "crew_rekap",
			entity_id: eventId,
			action_url: `/crew/jadwal/${projectId}/rekap`,
		});
	} catch (e) {
		console.error("[rekap-notifications] notifyRekapReviewed:", e);
	}
}

/** Event settled (closed) → thank the crew. No financials (crew secret). */
export async function notifyEventSettled(
	eventId: string,
	projectId: string,
): Promise<void> {
	try {
		const admin = createAdminClient();
		const [name, recipients] = await Promise.all([
			eventClientName(admin, eventId),
			crewRecipients(admin, eventId),
		]);
		await insertFor(admin, recipients, {
			severity: "success",
			category: "operational",
			title: `Event selesai: ${name}`,
			body: "Event sudah di-tutup buku. Makasih kerjanya! 🙌",
			entity_type: "event",
			entity_id: eventId,
			action_url: `/crew/jadwal/${projectId}`,
		});
	} catch (e) {
		console.error("[rekap-notifications] notifyEventSettled:", e);
	}
}
