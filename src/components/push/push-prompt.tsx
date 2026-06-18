"use client";

import { BellRing, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PushSubscribeButton } from "@/components/push/subscribe-button";

const DISMISS_KEY = "tetra:push-prompt-dismissed";

/**
 * <PushPrompt /> — the "enable push / add to home screen" card, shown as a
 * dismissible popup pinned to the BOTTOM of the notifications screen (above the
 * mobile bottom-nav; bottom-right on desktop). It's deliberately NOT a hero:
 * it floats over content, can be closed (persisted in localStorage), and never
 * shows again once the device is already subscribed.
 */
export function PushPrompt({
	vapidPublicKey,
}: {
	vapidPublicKey: string | null;
}) {
	const [show, setShow] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				if (localStorage.getItem(DISMISS_KEY) === "1") return;
			} catch {
				// localStorage blocked — fall through and show anyway.
			}
			// Already subscribed on this device? Then there's nothing to prompt.
			try {
				if ("serviceWorker" in navigator && "PushManager" in window) {
					const reg = await navigator.serviceWorker.ready;
					const existing = await reg.pushManager.getSubscription();
					if (existing) return;
				}
			} catch {
				// ignore — show the prompt (subscribe button handles edge states)
			}
			if (!cancelled) setShow(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	function dismiss() {
		try {
			localStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// ignore persistence failure
		}
		setShow(false);
	}

	if (!show) return null;

	return (
		<div
			role="dialog"
			aria-label="Aktifkan push notification"
			className="reveal fixed z-40 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-1/2 w-[calc(100%-1.5rem)] max-w-[26rem] -translate-x-1/2 rounded-2xl border border-border-subtle bg-card p-4 pr-10 shadow-[var(--shadow-level-4)] md:bottom-6 md:left-auto md:right-6 md:w-[24rem] md:translate-x-0"
		>
			<button
				type="button"
				onClick={dismiss}
				aria-label="Tutup"
				className="text-muted-foreground hover:bg-secondary hover:text-foreground absolute right-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-full transition-colors"
			>
				<X className="size-4" />
			</button>

			<div className="flex items-start gap-3">
				<span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full">
					<BellRing className="size-[18px]" />
				</span>
				<div className="space-y-0.5">
					<p className="text-foreground text-sm font-medium">
						Push notification ke device ini
					</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Aktifkan biar dapat alert OS-level (lockscreen Android, macOS, dll)
						saat anomaly fires — tanpa perlu buka app.
					</p>
				</div>
			</div>

			<div className="mt-3">
				<PushSubscribeButton vapidPublicKey={vapidPublicKey} />
			</div>
		</div>
	);
}
