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

			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				<span className="hidden text-[14px] font-medium text-foreground lg:inline">
					{name}
				</span>
				<UserMenu name={name} email={email} role={role} theme={theme} />
				<NotificationBell />
			</div>
		</header>
	);
}
