"use client";

import {
	Bell,
	Briefcase,
	FileText,
	LayoutDashboard,
	type LucideIcon,
	Menu,
	Package,
	Receipt,
	Settings,
	Wallet,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/operations", label: "Operations", icon: Briefcase },
	{ href: "/billing", label: "Billing", icon: Receipt },
	{ href: "/warehouse", label: "Warehouse", icon: Package },
	{ href: "/finance", label: "Finance", icon: Wallet },
	{ href: "/notifications", label: "Notifications", icon: Bell },
	{ href: "/reports", label: "Reports", icon: FileText },
	{ href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNavSheet() {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [open]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Open menu"
				className="hover:bg-muted text-foreground inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors md:hidden"
			>
				<Menu className="h-5 w-5" />
			</button>

			{open && (
				<>
					<button
						type="button"
						aria-label="Close menu"
						onClick={() => setOpen(false)}
						className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
					/>
					<aside className="bg-background border-border fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r shadow-xl md:hidden">
						<div className="border-border flex h-14 items-center justify-between border-b px-4">
							<span className="text-foreground text-sm font-semibold">
								Menu
							</span>
							<button
								type="button"
								onClick={() => setOpen(false)}
								aria-label="Close menu"
								className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						<nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
							{NAV_ITEMS.map((item) => {
								const isActive =
									pathname === item.href ||
									pathname.startsWith(`${item.href}/`);
								const Icon = item.icon;
								return (
									<Link
										key={item.href}
										href={item.href}
										className={cn(
											"flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
											isActive
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:bg-muted hover:text-foreground",
										)}
									>
										<Icon className="h-4 w-4" />
										{item.label}
									</Link>
								);
							})}
						</nav>
					</aside>
				</>
			)}
		</>
	);
}
