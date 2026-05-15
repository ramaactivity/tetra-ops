import Image from "next/image";
import { cookies } from "next/headers";
import { NotificationBell } from "@/components/layouts/notification-bell";
import { UserMenu } from "@/components/layouts/user-menu";
import type { Theme } from "@/lib/actions/theme";

/**
 * <TopBar /> — sticky app-shell header.
 *
 * A1 refactor (sesi 5):
 * - Mobile shrinkage: 44px (h-11) on mobile, 56px (h-14) desktop. Per
 *   design system §3.5 / §9.2 mobile rules.
 * - Surface tone: surface-1/85 with backdrop blur for native-feel
 *   translucency without losing legibility.
 * - View Transitions anchor: viewTransitionName="site-header" prevents
 *   the topbar from morphing during page navigations.
 * - Sub-pixel logo crispness: w/h tuned per breakpoint.
 */
export async function TopBar({
	name,
	email,
	role,
}: {
	name: string;
	email: string;
	role: string;
	/**
	 * Kept for back-compat with callers — no longer renders a hamburger,
	 * since primary navigation is handled by the bottom tab bar (owner)
	 * or CrewBottomNav (crew).
	 */
	withMobileNav?: boolean;
}) {
	const cookieStore = await cookies();
	const theme: Theme =
		cookieStore.get("theme")?.value === "light" ? "light" : "dark";

	return (
		<header
			style={{ viewTransitionName: "site-header" }}
			className="sticky top-0 z-30 border-b border-border-default bg-card/95 supports-[backdrop-filter]:bg-card/80 backdrop-blur-xl pt-safe"
		>
			<div className="flex h-11 items-center justify-between gap-2 px-3 md:h-14 md:px-6">
				<div className="flex min-w-0 items-center gap-2 md:gap-3">
					<Image
						src={
							theme === "dark"
								? "/brand/logo-monochrome-light.png"
								: "/brand/logo-monochrome-dark.png"
						}
						alt="Tetra"
						width={120}
						height={36}
						className="h-6 w-auto md:h-7"
						priority
					/>
					<span className="hidden eyebrow sm:inline">Operations</span>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<NotificationBell />
					<UserMenu name={name} email={email} role={role} theme={theme} />
				</div>
			</div>
		</header>
	);
}
