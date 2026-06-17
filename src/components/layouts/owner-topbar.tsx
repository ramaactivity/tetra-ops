import { cookies } from "next/headers";
import Image from "next/image";
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
			className="sticky top-3 z-30 flex items-center gap-3 rounded-[16px] border border-border-subtle bg-card px-5 py-3 shadow-[var(--shadow-level-2)]"
		>
			{/* Mobile-only brand (desktop logo is in the sidebar) */}
			<Image
				src={
					theme === "dark"
						? "/brand/logo-monochrome-light.png"
						: "/brand/logo-monochrome-dark.png"
				}
				alt="Tetra"
				width={120}
				height={36}
				className="h-6 w-auto shrink-0 md:hidden"
				priority
			/>

			{/* Page name (replaces the non-functional search) */}
			<div className="hidden min-w-0 md:block">
				<OwnerPageTitle />
			</div>

			{/* Page-level primary actions teleport here (grouped with the page name
			    on the left) via TopbarActionPortal. Force every portaled control to
			    the 36px pill height so it always lines up with the page-name pill,
			    regardless of the per-page button `size`. */}
			<div
				id="topbar-actions"
				className="flex items-center gap-1.5 empty:hidden [&>a]:h-9 [&>button]:h-9 [&>form>button]:h-9 [&>a]:rounded-full [&>button]:rounded-full [&>form>button]:rounded-full [&>a]:text-[13px] [&>button]:text-[13px] [&>form>button]:text-[13px]"
			/>

			{/* Identity cluster (right) */}
			<div className="ml-auto flex shrink-0 items-center gap-2.5">
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
