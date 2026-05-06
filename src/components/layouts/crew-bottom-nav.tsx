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
		<nav className="bg-background/95 border-border supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t backdrop-blur">
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
						className={cn(
							"flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium transition-colors",
							isActive
								? "text-primary"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className="h-5 w-5" />
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
