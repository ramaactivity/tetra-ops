"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	dispatchPushToSubscription,
	isVapidConfigured,
} from "@/lib/push/web-push";
import { createClient } from "@/lib/supabase/server";

const SubscribeSchema = z.object({
	endpoint: z.string().url().max(2000),
	p256dh_key: z.string().min(1).max(200),
	auth_key: z.string().min(1).max(100),
	user_agent: z.string().max(500).optional().nullable(),
});

export type SubscribeResult = { ok?: boolean; error?: string; id?: string };

export async function savePushSubscription(input: {
	endpoint: string;
	p256dh_key: string;
	auth_key: string;
	user_agent?: string | null;
}): Promise<SubscribeResult> {
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Unauthorized" };

		const parsed = SubscribeSchema.safeParse(input);
		if (!parsed.success) {
			return { error: "Invalid subscription payload" };
		}

		const supabase = await createClient();
		const { data, error } = await supabase
			.from("push_subscriptions")
			.upsert(
				{
					user_id: me.profile.id,
					endpoint: parsed.data.endpoint,
					p256dh_key: parsed.data.p256dh_key,
					auth_key: parsed.data.auth_key,
					user_agent: parsed.data.user_agent ?? null,
					is_active: true,
					failed_attempts: 0,
				},
				{ onConflict: "user_id,endpoint" },
			)
			.select("id")
			.single();

		if (error) return { error: error.message };
		return { ok: true, id: data?.id as string };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

export async function deletePushSubscriptionByEndpoint(
	endpoint: string,
): Promise<{ ok?: boolean; error?: string }> {
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Unauthorized" };

		const supabase = await createClient();
		const { error } = await supabase
			.from("push_subscriptions")
			.delete()
			.eq("user_id", me.profile.id)
			.eq("endpoint", endpoint);

		if (error) return { error: error.message };
		return { ok: true };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}

export async function getMyActivePushSubscriptionCount(): Promise<{
	count: number;
	error?: string;
}> {
	try {
		const me = await getCurrentUser();
		if (!me) return { count: 0, error: "Unauthorized" };

		const supabase = await createClient();
		const { count, error } = await supabase
			.from("push_subscriptions")
			.select("id", { count: "exact", head: true })
			.eq("user_id", me.profile.id)
			.eq("is_active", true);
		if (error) return { count: 0, error: error.message };
		return { count: count ?? 0 };
	} catch (err) {
		return {
			count: 0,
			error: err instanceof Error ? err.message : "Unknown error",
		};
	}
}

export async function sendTestPushToMyDevices(): Promise<{
	ok?: boolean;
	error?: string;
	sent?: number;
	pruned?: number;
}> {
	try {
		const me = await getCurrentUser();
		if (!me) return { error: "Unauthorized" };

		if (!isVapidConfigured()) {
			return {
				error:
					"VAPID belum di-set di env (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)",
			};
		}

		const supabase = await createClient();
		const { data: subs, error } = await supabase
			.from("push_subscriptions")
			.select("id, endpoint, p256dh_key, auth_key")
			.eq("user_id", me.profile.id)
			.eq("is_active", true);

		if (error) return { error: error.message };
		if (!subs || subs.length === 0) {
			return { error: "Belum ada device subscribed di akun ini" };
		}

		let sent = 0;
		let pruned = 0;
		for (const sub of subs) {
			const r = await dispatchPushToSubscription(sub, {
				title: "Test push dari Tetra Ops",
				body: "Push notif aktif. Anomaly alert akan masuk ke device ini.",
				url: "/notifications",
				severity: "info",
			});
			if (r.ok) sent++;
			else if (r.gone) {
				await supabase
					.from("push_subscriptions")
					.update({ is_active: false, failed_attempts: 99 })
					.eq("id", sub.id);
				pruned++;
			}
		}

		return { ok: true, sent, pruned };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Unknown error" };
	}
}
