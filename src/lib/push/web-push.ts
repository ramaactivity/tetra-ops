import "server-only";
import webpush from "web-push";

let vapidConfigured = false;
let vapidConfigError: string | null = null;

function configureVapid(): boolean {
	if (vapidConfigured) return true;
	if (vapidConfigError) return false;

	const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;
	const subject =
		process.env.VAPID_CONTACT_EMAIL || "mailto:tetraphotobooth@gmail.com";

	if (!publicKey || !privateKey) {
		vapidConfigError =
			"VAPID keys not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)";
		return false;
	}

	webpush.setVapidDetails(
		`mailto:${subject.replace(/^mailto:/, "")}`,
		publicKey,
		privateKey,
	);
	vapidConfigured = true;
	return true;
}

export type PushPayload = {
	title: string;
	body: string;
	url?: string;
	tag?: string;
	severity?: "alert" | "warning" | "info" | "success";
	notification_id?: string;
};

export type PushSubscriptionRow = {
	id: string;
	endpoint: string;
	p256dh_key: string;
	auth_key: string;
};

export type DispatchOutcome = {
	id: string;
	ok: boolean;
	statusCode?: number;
	error?: string;
	gone: boolean;
};

export async function dispatchPushToSubscription(
	sub: PushSubscriptionRow,
	payload: PushPayload,
	timeoutMs = 8000,
): Promise<DispatchOutcome> {
	if (!configureVapid()) {
		return {
			id: sub.id,
			ok: false,
			error: vapidConfigError ?? "VAPID not configured",
			gone: false,
		};
	}

	try {
		const result = await webpush.sendNotification(
			{
				endpoint: sub.endpoint,
				keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
			},
			JSON.stringify(payload),
			{ TTL: 60 * 60 * 24, timeout: timeoutMs },
		);
		return { id: sub.id, ok: true, statusCode: result.statusCode, gone: false };
	} catch (err) {
		const e = err as { statusCode?: number; body?: string; message?: string };
		const status = typeof e.statusCode === "number" ? e.statusCode : undefined;
		const gone = status === 404 || status === 410;
		return {
			id: sub.id,
			ok: false,
			statusCode: status,
			error: e.message ?? "send failed",
			gone,
		};
	}
}

export async function dispatchPushToMany(
	subs: PushSubscriptionRow[],
	payload: PushPayload,
	overallBudgetMs = 25000,
): Promise<DispatchOutcome[]> {
	if (subs.length === 0) return [];
	// Run all dispatches in parallel; each gets the full budget since
	// they share wall-clock time (Promise.all waits for slowest).
	const perSubTimeout = Math.max(5000, overallBudgetMs);
	const results = await Promise.all(
		subs.map((s) => dispatchPushToSubscription(s, payload, perSubTimeout)),
	);
	return results;
}

export function isVapidConfigured(): boolean {
	return configureVapid();
}
