"use client";

import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";
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
	| "needs-install"
	| "blocked"
	| "idle"
	| "subscribed"
	| "error";

/**
 * iOS Safari only exposes the Push API when the site runs as an installed PWA
 * (Add to Home Screen → standalone). In a normal tab `PushManager` is missing,
 * which otherwise reads as a flat "browser tidak support push". Detect that case
 * so we can show actionable guidance instead.
 */
function needsHomeScreenInstall(): boolean {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent;
	const isIOS =
		/iphone|ipad|ipod/i.test(ua) ||
		// iPadOS 13+ reports as desktop Safari but has touch points
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	if (!isIOS) return false;
	const standalone =
		window.matchMedia?.("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	return !standalone;
}

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
				if (!cancelled) {
					setState(needsHomeScreenInstall() ? "needs-install" : "unsupported");
				}
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
			const sent = r.sent ?? 0;
			const failed = r.failed ?? 0;
			const pruned = r.pruned ?? 0;
			if (sent > 0) {
				setTestStatus(`✓ Sent to ${sent} device(s)`);
				window.setTimeout(() => setTestStatus(null), 4000);
			} else {
				const reason = r.failureReason ?? "no devices reachable";
				setError(
					`Push gagal terkirim: ${reason}. Cek VAPID keys cocok antara Vercel env vs subscribe time. Coba unsubscribe + re-subscribe.`,
				);
				setTestStatus(null);
				if (pruned > 0) {
					setError(
						(prev) => `${prev}\n${pruned} subscription expired (auto-pruned).`,
					);
				}
			}
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

	if (state === "needs-install") {
		return (
			<div
				className={cn(
					"text-muted-foreground inline-flex flex-col items-start gap-0.5 text-xs",
					className,
				)}
			>
				<span className="text-foreground inline-flex items-center gap-2 font-medium">
					<BellRing className="h-3.5 w-3.5" /> Tambahkan ke Home Screen dulu
				</span>
				<span>
					Di iPhone, push cuma jalan kalau app di-install: Share → “Add to Home
					Screen”, lalu buka dari ikonnya.
				</span>
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
							className="border-border-default bg-surface-2 hover:bg-muted text-foreground inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium disabled:opacity-50"
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
							className="bg-[#059669] text-white hover:bg-[#047857] inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:opacity-50"
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
						className="bg-[#059669] text-white hover:bg-[#047857] inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:opacity-50"
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
