"use client";

import {
	Bell,
	Briefcase,
	FileText,
	LayoutDashboard,
	type LucideIcon,
	MessageCircle,
	Package,
	Palette,
	Receipt,
	Settings,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * <OwnerSidebar /> — desktop primary navigation.
 *
 * A1 refactor (sesi 5):
 * - bg-surface-1 (proper L1 surface — was bg-background which is L0,
 *   created flat-feeling stack of L0+L0).
 * - View Transitions anchor: viewTransitionName="site-sidebar".
 * - Active state uses bg-accent + border-l-2 crimson for stronger
 *   readability across long sessions.
 * - Hover transitions tokenized via duration-fast + ease-out-expo.
 *
 * Mobile users: this component is hidden (md:block). Primary nav on
 * mobile is <OwnerBottomNav>.
 */

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/operations", label: "Operations", icon: Briefcase },
	{ href: "/design", label: "Design", icon: Palette },
	{ href: "/billing", label: "Billing", icon: Receipt },
	{ href: "/warehouse", label: "Warehouse", icon: Package },
	{ href: "/finance", label: "Finance", icon: Wallet },
	{ href: "/reminders", label: "Reminders", icon: MessageCircle },
	{ href: "/notifications", label: "Notifications", icon: Bell },
	{ href: "/reports", label: "Reports", icon: FileText },
	{ href: "/settings", label: "Settings", icon: Settings },
];

export function OwnerSidebar() {
	const pathname = usePathname();

	return (
		<aside
			style={{ viewTransitionName: "site-sidebar" }}
			className="hidden w-60 shrink-0 border-r border-border-default bg-surface-1 md:block"
		>
			<nav className="flex flex-col gap-0.5 p-3">
				{NAV_ITEMS.map((item) => {
					const isActive =
						pathname === item.href || pathname.startsWith(`${item.href}/`);
					const Icon = item.icon;
					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={isActive ? "page" : undefined}
							className={cn(
								"relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast ease-out-expo",
								isActive
									? "bg-accent text-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
									: "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
							)}
						>
							<Icon
								className={cn("h-4 w-4", isActive && "text-primary")}
								aria-hidden
							/>
							{item.label}
						</Link>
					);
				})}
			</nav>
		</aside>
	);
}
