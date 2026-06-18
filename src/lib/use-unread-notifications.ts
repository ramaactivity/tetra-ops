"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Unread + non-dismissed notification count for the signed-in user.
 *
 * Client-side on purpose (see notification-bell.tsx): keeps the COUNT query in
 * the browser → Supabase, off the Vercel function, so it doesn't run on every
 * authenticated navigation. Re-checks on window focus. Shared by the desktop
 * top-bar bell and the mobile bottom-nav "More" badge.
 */
export function useUnreadNotifications(): number {
	const [unread, setUnread] = useState(0);

	useEffect(() => {
		const supabase = createClient();
		let active = true;

		const load = async () => {
			const { data } = await supabase.auth.getClaims();
			const uid = data?.claims?.sub;
			if (!uid) return;
			const nowIso = new Date().toISOString();
			const { count } = await supabase
				.from("notifications")
				.select("id", { count: "exact", head: true })
				.eq("user_id", uid)
				.eq("is_read", false)
				.eq("is_dismissed", false)
				.or(`expires_at.is.null,expires_at.gt.${nowIso}`);
			if (active) setUnread(count ?? 0);
		};

		load();
		const onFocus = () => load();
		// visibilitychange fires reliably on mobile (tab switch / app resume),
		// where `focus` often doesn't — keeps the badge fresh on phones.
		const onVisible = () => {
			if (document.visibilityState === "visible") load();
		};
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			active = false;
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	return unread;
}
