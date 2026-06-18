"use client";

import { BellRing, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PushSubscribeButton } from "@/components/push/subscribe-button";

const DISMISS_KEY = "tetra:push-prompt-dismissed";

type Mode = "loading" | "popup" | "banner" | "hidden";

/**
 * <PushPrompt /> — the "enable push / add to home screen" UI.
 *
 * - First visit: a dismissible **popup** pinned to the bottom (above the mobile
 *   bottom-nav; bottom-right on desktop). Deliberately NOT a hero.
 * - After it's closed: it doesn't disappear entirely — it collapses into a quiet
 *   inline **banner** that stays at the bottom of the page content, so the user
 *   can still enable push later. Dismissal persists in localStorage.
 * - If the device is already subscribed, nothing is shown.
 */
export function PushPrompt({
	vapidPublicKey,
}: {
	vapidPublicKey: string | null;
}) {
	const [mode, setMode] = useState<Mode>("loading");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			// Already subscribed on this device? Then there's nothing to prompt.
			try {
				if ("serviceWorker" in navigator && "PushManager" in window) {
					const reg = await navigator.serviceWorker.ready;
					const existing = await reg.pushManager.getSubscription();
					if (existing) {
						if (!cancelled) setMode("hidden");
						return;
					}
				}
			} catch {
				// ignore — fall through to the prompt (subscribe button handles edges)
			}
			let dismissed = false;
			try {
				dismissed = localStorage.getItem(DISMISS_KEY) === "1";
			} catch {
				// localStorage blocked — treat as not dismissed
			}
			if (!cancelled) setMode(dismissed ? "banner" : "popup");
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
		setMode("banner");
	}

	if (mode === "loading" || mode === "hidden") return null;

	const body = (
		<>
			<div className="flex items-start gap-3">
				<span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full">
					<BellRing className="size-[18px]" />
				</span>
				<div className="space-y-0.5">
					<p className="text-foreground text-sm font-medium">
						Aktifkan push notification
					</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Dapat alert OS-level (lockscreen Android, macOS, dll) saat anomaly
						fires — tanpa perlu buka app.
					</p>
				</div>
			</div>
			<div className="mt-3">
				<PushSubscribeButton vapidPublicKey={vapidPublicKey} />
			</div>
		</>
	);

	// Persistent inline banner (after the popup is closed) — sits in normal flow
	// at the bottom of the page content.
	if (mode === "banner") {
		return (
			<div className="border-border-subtle bg-card rounded-2xl border p-4 shadow-[var(--shadow-level-1)]">
				{body}
			</div>
		);
	}

	// First-visit floating popup.
	return (
		<div
			role="dialog"
			aria-label="Aktifkan push notification"
			className="reveal fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-[26rem] -translate-x-1/2 rounded-2xl border border-border-subtle bg-card p-4 pr-10 shadow-[var(--shadow-level-4)] md:bottom-6 md:left-auto md:right-6 md:w-[24rem] md:translate-x-0"
		>
			<button
				type="button"
				onClick={dismiss}
				aria-label="Tutup"
				className="text-muted-foreground hover:bg-secondary hover:text-foreground absolute right-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-full transition-colors"
			>
				<X className="size-4" />
			</button>
			{body}
		</div>
	);
}
