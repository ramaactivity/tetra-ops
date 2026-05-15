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
 * <OwnerSidebar /> — Vercel dashboard sidebar lineage.
 *
 * - 256px wide, white card surface, hairline right border.
 * - Items grouped into sections with quiet whitespace (no divider line).
 * - Each item: 13px font-medium, 16px icon, rounded-md, px-2 py-1.5.
 *   Active = `bg-secondary` fill (no left-edge accent — Vercel pattern).
 *   Hover = `bg-secondary/60`. No transform.
 * - Vertical scroll uses `scrollbar-vercel` thin track (8px, near-invisible
 *   until hover) so long nav lists feel native.
 *
 * Mobile: hidden (md:block). Primary nav on mobile = OwnerBottomNav.
 */

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

type NavSection = {
	items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
	{
		items: [
			{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
			{ href: "/operations", label: "Operations", icon: Briefcase },
			{ href: "/design", label: "Design", icon: Palette },
			{ href: "/billing", label: "Billing", icon: Receipt },
			{ href: "/warehouse", label: "Warehouse", icon: Package },
			{ href: "/finance", label: "Finance", icon: Wallet },
		],
	},
	{
		items: [
			{ href: "/reminders", label: "Reminders", icon: MessageCircle },
			{ href: "/notifications", label: "Notifications", icon: Bell },
			{ href: "/reports", label: "Reports", icon: FileText },
			{ href: "/settings", label: "Settings", icon: Settings },
		],
	},
];

export function OwnerSidebar() {
	const pathname = usePathname();

	function isActive(href: string): boolean {
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	return (
		<aside
			style={{ viewTransitionName: "site-sidebar" }}
			className="hidden w-[260px] shrink-0 border-r border-border-default bg-card md:flex md:flex-col"
		>
			<nav className="scrollbar-vercel flex-1 overflow-y-auto p-3">
				<div className="flex flex-col gap-5">
					{NAV_SECTIONS.map((section, sIdx) => (
						<ul
							// biome-ignore lint/suspicious/noArrayIndexKey: stable section index
							key={sIdx}
							className="flex flex-col gap-0.5"
						>
							{section.items.map((item) => {
								const active = isActive(item.href);
								const Icon = item.icon;
								return (
									<li key={item.href}>
										<Link
											href={item.href}
											aria-current={active ? "page" : undefined}
											className={cn(
												"group/nav flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] font-medium leading-none transition-colors duration-fast ease-out-expo",
												active
													? "bg-secondary text-foreground"
													: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
											)}
										>
											<Icon
												className={cn(
													"size-[18px] shrink-0",
													active
														? "text-foreground"
														: "text-muted-foreground/70 group-hover/nav:text-foreground/80",
												)}
												aria-hidden
												strokeWidth={2}
											/>
											{item.label}
										</Link>
									</li>
								);
							})}
						</ul>
					))}
				</div>
			</nav>
		</aside>
	);
}
