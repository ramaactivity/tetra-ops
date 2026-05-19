import { Bell } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export async function NotificationBell() {
	const me = await getCurrentUser();
	if (!me) return null;

	const supabase = await createClient();
	const nowIso = new Date().toISOString();
	const { count } = await supabase
		.from("notifications")
		.select("id", { count: "exact", head: true })
		.eq("user_id", me.profile.id)
		.eq("is_read", false)
		.eq("is_dismissed", false)
		.or(`expires_at.is.null,expires_at.gt.${nowIso}`);

	const unread = count ?? 0;
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
