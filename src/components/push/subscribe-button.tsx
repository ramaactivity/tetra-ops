"use client";

import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
	deletePushSubscriptionByEndpoint,
	savePushSubscription,
	sendTestPushToMyDevices,
} from "@/lib/actions/push-subscriptions";
import { cn } from "@/lib/utils";

type State =
	| "checking"
	| "unsupported"
	| "blocked"
	| "idle"
	| "subscribed"
	| "error";

function urlBase64ToBuffer(base64: string): ArrayBuffer {
	const padding = "=".repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(b64);
	const buf = new ArrayBuffer(raw.length);
	const view = new Uint8Array(buf);
	for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
	return buf;
}

export function PushSubscribeButton({
	vapidPublicKey,
	className,
}: {
	vapidPublicKey: string | null;
	className?: string;
}) {
	const [state, setState] = useState<State>("checking");
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const [testStatus, setTestStatus] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (typeof window === "undefined") return;
			if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
				if (!cancelled) setState("unsupported");
				return;
			}
			if (Notification.permission === "denied") {
				if (!cancelled) setState("blocked");
				return;
			}
			try {
				const reg = await navigator.serviceWorker.ready;
				const existing = await reg.pushManager.getSubscription();
				if (!cancelled) setState(existing ? "subscribed" : "idle");
			} catch {
				if (!cancelled) setState("idle");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function handleSubscribe() {
		setError(null);
		if (!vapidPublicKey) {
			setError("VAPID public key tidak tersedia di env");
			return;
		}
		try {
			const permission = await Notification.requestPermission();
			if (permission === "denied") {
				setState("blocked");
				return;
			}
			if (permission !== "granted") return;

			const reg = await navigator.serviceWorker.ready;
			let sub = await reg.pushManager.getSubscription();
			if (!sub) {
				sub = await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
				});
			}

			const json = sub.toJSON();
			const p256dh = (json.keys as Record<string, string> | undefined)?.p256dh;
			const auth = (json.keys as Record<string, string> | undefined)?.auth;
			if (!sub.endpoint || !p256dh || !auth) {
				setError("Subscription gagal — endpoint/keys missing");
				return;
			}

			startTransition(async () => {
				const r = await savePushSubscription({
					endpoint: sub.endpoint,
					p256dh_key: p256dh,
					auth_key: auth,
					user_agent:
						typeof navigator !== "undefined" ? navigator.userAgent : null,
				});
				if (r.error) {
					setError(r.error);
					return;
				}
				setState("subscribed");
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Subscribe failed");
			setState("error");
		}
	}

	async function handleUnsubscribe() {
		setError(null);
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				const endpoint = sub.endpoint;
				await sub.unsubscribe();
				startTransition(async () => {
					const r = await deletePushSubscriptionByEndpoint(endpoint);
					if (r.error) setError(r.error);
					setState("idle");
				});
			} else {
				setState("idle");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unsubscribe failed");
		}
	}

	async function handleTestPush() {
		setTestStatus("sending");
		setError(null);
		startTransition(async () => {
			const r = await sendTestPushToMyDevices();
			if (r.error) {
				setError(r.error);
				setTestStatus(null);
				return;
			}
			setTestStatus(`✓ Sent to ${r.sent ?? 0} device(s)`);
			window.setTimeout(() => setTestStatus(null), 3000);
		});
	}

	if (state === "checking") {
		return (
			<div
				className={cn(
					"text-muted-foreground inline-flex items-center gap-2 text-xs",
					className,
				)}
			>
				<Loader2 className="h-3.5 w-3.5 animate-spin" /> Cek status push…
			</div>
		);
	}

	if (state === "unsupported") {
		return (
			<div
				className={cn(
					"text-muted-foreground inline-flex items-center gap-2 text-xs",
					className,
				)}
			>
				<BellOff className="h-3.5 w-3.5" /> Browser tidak support push
			</div>
		);
	}

	if (state === "blocked") {
		return (
			<div
				className={cn(
					"text-destructive inline-flex flex-col items-start gap-1 text-xs",
					className,
				)}
			>
				<div className="inline-flex items-center gap-2">
					<BellOff className="h-3.5 w-3.5" /> Notifikasi diblok
				</div>
				<span className="text-muted-foreground">
					Aktifkan dari setting browser
				</span>
			</div>
		);
	}

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex flex-wrap items-center gap-2">
				{state === "subscribed" ? (
					<>
						<button
							type="button"
							onClick={handleUnsubscribe}
							disabled={pending}
							className="border-border bg-card hover:bg-muted text-foreground inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium disabled:opacity-50"
						>
							{pending ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<BellOff className="h-3.5 w-3.5" />
							)}
							Disable push
						</button>
						<button
							type="button"
							onClick={handleTestPush}
							disabled={pending}
							className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:opacity-50"
						>
							<Send className="h-3.5 w-3.5" />
							Test push
						</button>
						<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 text-xs">
							<Bell className="h-3.5 w-3.5" />
							Aktif di device ini
						</span>
					</>
				) : (
					<button
						type="button"
						onClick={handleSubscribe}
						disabled={pending || !vapidPublicKey}
						className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:opacity-50"
					>
						{pending ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Bell className="h-3.5 w-3.5" />
						)}
						Aktifkan push notif
					</button>
				)}
			</div>
			{!vapidPublicKey && (
				<span className="text-muted-foreground text-xs">
					VAPID belum di-set di env (NEXT_PUBLIC_VAPID_PUBLIC_KEY)
				</span>
			)}
			{testStatus && (
				<span className="text-muted-foreground text-xs">{testStatus}</span>
			)}
			{error && <span className="text-destructive text-xs">{error}</span>}
		</div>
	);
}
