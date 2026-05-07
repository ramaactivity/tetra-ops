import Image from "next/image";
import { cookies } from "next/headers";
import { NotificationBell } from "@/components/layouts/notification-bell";
import { UserMenu } from "@/components/layouts/user-menu";
import type { Theme } from "@/lib/actions/theme";

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
		<header className="bg-background/80 border-border supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 border-b backdrop-blur pt-safe">
			<div className="flex h-14 items-center justify-between px-4 md:px-6">
				<div className="flex items-center gap-2 md:gap-3">
					<Image
						src={
							theme === "dark"
								? "/brand/logo-monochrome-light.png"
								: "/brand/logo-monochrome-dark.png"
						}
						alt="Tetra"
						width={120}
						height={36}
						className="h-7 w-auto"
						priority
					/>
					<span className="text-muted-foreground hidden text-xs uppercase tracking-wider sm:inline">
						Operations
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<NotificationBell />
					<UserMenu name={name} email={email} role={role} theme={theme} />
				</div>
			</div>
		</header>
	);
}
