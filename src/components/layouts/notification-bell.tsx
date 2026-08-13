"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";

/**
 * Unread-notification badge in the desktop top bar. Count logic lives in the
 * shared useUnreadNotifications hook (also drives the mobile "More" badge).
 */
export function NotificationBell({
	href = "/notifications",
}: {
	href?: string;
}) {
	const unread = useUnreadNotifications();
	const display = unread > 99 ? "99+" : String(unread);

	return (
		<Link
			href={href}
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
