"use server";

import { getCurrentUser } from "@/lib/auth/get-user";
import { botHealth } from "@/lib/bot-health";
import { dispatchPushToMany, isVapidConfigured } from "@/lib/push/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Push a "bot WhatsApp mati" alert to owners — deduped to ONE push per
 * down-episode. Triggered by the dashboard banner whenever it observes an
 * unhealthy bot_status (realtime change or the 60s staleness poll), so it
 * fires as long as at least one owner has Tetra Ops open. (A fully-closed
 * dashboard can't self-detect on Vercel Hobby — see the external dead-man's
 * switch note in the handover.)
 *
 * The server re-reads bot_status itself (never trusts the client's snapshot)
 * and uses an atomic NULL→now() flip on alert_notified_at as the dedup guard,
 * so concurrent tabs don't double-fire. On recovery the flag is cleared so the
 * NEXT down-episode alerts again.
 */
export async function reportBotHealth(): Promise<{ ok: boolean }> {
	const me = await getCurrentUser();
	if (!me) return { ok: true }; // not our concern when unauthenticated

	const admin = createAdminClient();
	const { data: status } = await admin
		.from("bot_status")
		.select("connection, updated_at, alert_notified_at")
		.eq("id", 1)
		.maybeSingle();
	if (!status) return { ok: true };

	const health = botHealth({
		connection: status.connection,
		updated_at: status.updated_at,
	});

	// Recovered → clear the flag so a future down-episode can alert again.
	if (health.ok) {
		if (status.alert_notified_at) {
			await admin
				.from("bot_status")
				.update({ alert_notified_at: null })
				.eq("id", 1);
		}
		return { ok: true };
	}

	// Unhealthy → claim the alert atomically. Only the caller that flips the
	// flag from NULL wins the right to push; everyone else no-ops.
	const { data: claimed } = await admin
		.from("bot_status")
		.update({ alert_notified_at: new Date().toISOString() })
		.eq("id", 1)
		.is("alert_notified_at", null)
		.select("id");
	if (!claimed || claimed.length === 0) return { ok: false }; // already alerted

	// Recipients: active owners / super_admins.
	const { data: owners } = await admin
		.from("users")
		.select("id")
		.is("deleted_at", null)
		.eq("is_active", true)
		.in("role", ["owner", "super_admin"]);
	const recipientIds = (owners ?? []).map((u) => u.id);
	if (recipientIds.length === 0) return { ok: false };

	const title = "Bot WhatsApp mati";
	const body = health.reason;
	const actionUrl = "/leads/settings";

	await admin.from("notifications").insert(
		recipientIds.map((uid) => ({
			user_id: uid,
			severity: "alert",
			category: "system",
			title,
			body,
			entity_type: "bot_status",
			entity_id: "1",
			action_url: actionUrl,
		})),
	);

	// Best-effort web push (failures don't matter — the in-app notif + banner
	// already cover it).
	if (isVapidConfigured()) {
		try {
			const { data: subs } = await admin
				.from("push_subscriptions")
				.select("id, endpoint, p256dh_key, auth_key")
				.in("user_id", recipientIds)
				.eq("is_active", true);
			const list = (subs ?? []) as Array<{
				id: string;
				endpoint: string;
				p256dh_key: string;
				auth_key: string;
			}>;
			if (list.length > 0) {
				const outcomes = await dispatchPushToMany(list, {
					title,
					body,
					url: actionUrl,
					tag: "bot-down",
					severity: "alert",
				});
				const goneIds = outcomes.filter((o) => o.gone).map((o) => o.id);
				if (goneIds.length > 0) {
					await admin
						.from("push_subscriptions")
						.update({ is_active: false })
						.in("id", goneIds);
				}
			}
		} catch {
			// swallow — push is best-effort
		}
	}

	return { ok: false };
}
