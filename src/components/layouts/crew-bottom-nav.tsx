"use client";

import {
	CalendarDays,
	Home,
	type LucideIcon,
	Package2,
	User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * <CrewBottomNav /> — sticky bottom nav for crew mobile (also visible
 * on tablet — crew side is mobile-first).
 *
 * A1 refactor (sesi 5):
 * - bg-surface-1 with backdrop blur (was bg-background — L0/L0 stack).
 * - View Transitions anchor: viewTransitionName="site-bottom-nav".
 * - Active strokeWidth bump for visual emphasis at small sizes.
 */

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
	{ href: "/crew", label: "Home", icon: Home },
	{ href: "/crew/jadwal", label: "Jadwal", icon: CalendarDays },
	{ href: "/crew/alat", label: "Alat", icon: Package2 },
	{ href: "/crew/profile", label: "Profile", icon: User },
];

export function CrewBottomNav() {
	const pathname = usePathname();

	return (
		<nav
			aria-label="Primary"
			style={{ viewTransitionName: "site-bottom-nav" }}
			className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border-default bg-surface-1/85 supports-[backdrop-filter]:bg-surface-1/65 backdrop-blur-xl pb-safe"
		>
			{NAV_ITEMS.map((item) => {
				const isActive =
					item.href === "/crew"
						? pathname === "/crew"
						: pathname === item.href || pathname.startsWith(`${item.href}/`);
				const Icon = item.icon;
				return (
					<Link
						key={item.href}
						href={item.href}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-fluid-caption font-medium transition-colors duration-fast ease-out-expo",
							isActive
								? "text-primary"
								: "text-muted-foreground active:text-foreground",
						)}
					>
						<Icon
							className="size-6"
							strokeWidth={isActive ? 2.25 : 1.75}
							aria-hidden="true"
						/>
						<span className="leading-none">{item.label}</span>
					</Link>
				);
			})}
		</nav>
	);
}
