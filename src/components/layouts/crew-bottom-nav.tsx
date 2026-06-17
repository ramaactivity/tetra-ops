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
import { useHaptics } from "@/lib/use-haptics";
import { cn } from "@/lib/utils";

/**
 * <CrewBottomNav /> — native-style bottom tab bar (mobile-first crew app).
 *
 * 2026 redesign: proportional 22px icons inside an active "pill" indicator,
 * 11px labels on the enforced type ramp, frosted translucent surface, spring
 * press feedback + Android haptics. Centered to the 30rem app column so it
 * lines up with screen content on large phones / tablets.
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
	const haptic = useHaptics();

	return (
		<nav
			aria-label="Primary"
			style={{ viewTransitionName: "site-bottom-nav" }}
			className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-card/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-card/70 pb-safe"
		>
			<div className="mx-auto flex max-w-[30rem] items-stretch justify-around px-2">
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
							onClick={() => haptic("select")}
							aria-current={isActive ? "page" : undefined}
							className="press-sm tap group relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5"
						>
							<span
								className={cn(
									"flex h-8 w-[3.25rem] items-center justify-center rounded-full transition-colors duration-base ease-out-expo",
									isActive ? "bg-primary" : "bg-transparent",
								)}
							>
								<Icon
									className={cn(
										"size-[1.4rem] transition-[transform,color] duration-base ease-spring-snappy",
										isActive
											? "scale-105 text-primary-foreground"
											: "text-muted-foreground group-active:text-foreground",
									)}
									strokeWidth={isActive ? 2.3 : 1.85}
									aria-hidden="true"
								/>
							</span>
							<span
								className={cn(
									"text-[0.6875rem] leading-none tracking-tight transition-colors",
									isActive
										? "font-semibold text-foreground"
										: "font-medium text-muted-foreground",
								)}
							>
								{item.label}
							</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
