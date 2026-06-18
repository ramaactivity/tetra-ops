import { cookies } from "next/headers";
import { NotificationBell } from "@/components/layouts/notification-bell";
import { OwnerPageTitle } from "@/components/layouts/owner-page-title";
import { UserMenu } from "@/components/layouts/user-menu";
import type { Theme } from "@/lib/actions/theme";

/**
 * <OwnerTopBar /> — UpGradely DNA: a floating white card showing the current
 * page name (left) and the user identity + notifications (right). Sits over the
 * ambient gradient inside the content column (logo lives in the sidebar on
 * desktop; the page title carries context here, especially on mobile where the
 * sidebar is hidden).
 */
export async function OwnerTopBar({
	name,
	email,
	role,
}: {
	name: string;
	email: string;
	role: string;
}) {
	const cookieStore = await cookies();
	const theme: Theme =
		cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

	return (
		<header
			style={{ viewTransitionName: "site-header" }}
			className="z-30 flex items-center gap-2 px-1 py-0.5 md:sticky md:top-3 md:gap-3 md:rounded-[16px] md:border md:border-border-subtle md:bg-card md:px-5 md:py-3 md:shadow-[var(--shadow-level-2)]"
		>
			{/* Current page — gives the topbar a clear purpose and, on mobile where
			    the sidebar is hidden, tells you where you are. On sub-pages this
			    pill is the back control; the entity slot adds the breadcrumb tail
			    (e.g. "· Luthfi & Rosya") on desktop. */}
			<div className="min-w-0 shrink-0">
				<OwnerPageTitle />
			</div>
			<div
				id="topbar-entity"
				className="hidden min-w-0 items-center gap-2 empty:hidden sm:flex"
			/>

			{/* Page-level primary actions teleport here via TopbarActionPortal.
			    Scrolls horizontally so a busy action strip (e.g. the Operations
			    view-switcher) never pushes the identity cluster + bell off-screen.
			    Every portaled control snaps to the 36px pill height. */}
			<div
				id="topbar-actions"
				className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto empty:hidden [&>*]:shrink-0 [&>a]:h-9 [&>button]:h-9 [&>form>button]:h-9 [&>a]:rounded-full [&>button]:rounded-full [&>form>button]:rounded-full [&>a]:text-[13px] [&>button]:text-[13px] [&>form>button]:text-[13px]"
			/>

			{/* Identity cluster — desktop only. On mobile, account + notifications
			    live in the bottom-nav "More" tab, so the topbar stays slim. */}
			<div className="ml-auto hidden shrink-0 items-center gap-2 md:flex md:gap-2.5">
				<span className="hidden text-[14px] font-medium text-foreground lg:inline">
					{name}
				</span>
				<UserMenu name={name} email={email} role={role} theme={theme} />
				<span className="mx-0.5 h-5 w-px bg-border-default" aria-hidden />
				<NotificationBell />
			</div>
		</header>
	);
}
