"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Unread-notification badge in the top bar.
 *
 * Client-side on purpose: this sits in the shared <TopBar>, so a server-side
 * version ran a `notifications` COUNT query on EVERY authenticated page render
 * (one Supabase round-trip per navigation = Active CPU on Vercel). Fetching the
 * count from the browser (client → Supabase, never touching the Vercel
 * function) removes that per-navigation query entirely. RLS scopes the rows to
 * the signed-in user; we still filter by user_id for index use. Re-checks on
 * window focus so the badge stays current without polling.
 */
export function NotificationBell() {
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
		const onFocus = () => {
			load();
		};
		window.addEventListener("focus", onFocus);
		return () => {
			active = false;
			window.removeEventListener("focus", onFocus);
		};
	}, []);

	const display = unread > 99 ? "99+" : String(unread);

	return (
		<Link
			href="/notifications"
			aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
			className="text-muted-foreground hover:text-foreground hover:bg-muted relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
		>
			<Bell className="h-4 w-4" />
			{unread > 0 && (
				<span
					aria-hidden="true"
					className={`bg-rose-500 text-white tabular pointer-events-none absolute -right-0.5 -top-0.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-[1.125rem] ${
						unread > 99 ? "min-w-[1.5rem]" : ""
					}`}
				>
					{display}
				</span>
			)}
		</Link>
	);
}
