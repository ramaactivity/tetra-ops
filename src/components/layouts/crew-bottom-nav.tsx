"use client";

import {
	CalendarDays,
	Home,
	type LucideIcon,
	Package2,
	User,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
	{ href: "/crew", label: "Home", icon: Home },
	{ href: "/crew/jadwal", label: "Jadwal", icon: CalendarDays },
	{ href: "/crew/alat", label: "Alat", icon: Package2 },
	{ href: "/crew/fee", label: "Fee", icon: Wallet },
	{ href: "/crew/profile", label: "Profile", icon: User },
];

export function CrewBottomNav() {
	const pathname = usePathname();

	return (
		<nav
			aria-label="Primary"
			className="bg-background/85 border-border supports-[backdrop-filter]:bg-background/70 fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t backdrop-blur-xl pb-safe"
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
							"flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors",
							isActive
								? "text-primary"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon
							className="h-6 w-6"
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
