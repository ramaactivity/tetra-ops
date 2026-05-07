"use client";

import {
	Bell,
	Briefcase,
	Ellipsis,
	FileText,
	LayoutDashboard,
	type LucideIcon,
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

const PRIMARY: NavItem[] = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/operations", label: "Operations", icon: Briefcase },
	{ href: "/billing", label: "Billing", icon: Receipt },
];

const MORE: NavItem[] = [
	{ href: "/warehouse", label: "Warehouse", icon: Package },
	{ href: "/finance", label: "Finance", icon: Wallet },
	{ href: "/notifications", label: "Notifications", icon: Bell },
	{ href: "/reports", label: "Reports", icon: FileText },
	{ href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function OwnerBottomNav() {
	const pathname = usePathname();
	const [moreOpen, setMoreOpen] = useState(false);

	const moreActive = MORE.some((item) => isActive(pathname, item.href));

	useEffect(() => {
		setMoreOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (!moreOpen) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setMoreOpen(false);
		}
		document.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [moreOpen]);

	return (
		<>
			<nav
				aria-label="Primary"
				className="bg-background/85 border-border supports-[backdrop-filter]:bg-background/70 fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t backdrop-blur-xl pb-safe md:hidden"
			>
				{PRIMARY.map((item) => {
					const active = isActive(pathname, item.href);
					const Icon = item.icon;
					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={active ? "page" : undefined}
							className={cn(
								"flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors",
								active
									? "text-primary"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<Icon
								className="h-6 w-6"
								strokeWidth={active ? 2.25 : 1.75}
								aria-hidden="true"
							/>
							<span className="leading-none">{item.label}</span>
						</Link>
					);
				})}
				<button
					type="button"
					onClick={() => setMoreOpen(true)}
					aria-label="More"
					aria-expanded={moreOpen}
					aria-haspopup="dialog"
					className={cn(
						"flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors",
						moreActive || moreOpen
							? "text-primary"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<Ellipsis
						className="h-6 w-6"
						strokeWidth={moreActive || moreOpen ? 2.25 : 1.75}
						aria-hidden="true"
					/>
					<span className="leading-none">More</span>
				</button>
			</nav>

			{moreOpen && (
				<>
					<button
						type="button"
						aria-label="Close menu"
						onClick={() => setMoreOpen(false)}
						className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label="More options"
						className="bg-card border-border fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t shadow-2xl pb-safe md:hidden"
					>
						<div className="flex items-center justify-center pt-2 pb-1">
							<div className="bg-muted-foreground/30 h-1 w-10 rounded-full" />
						</div>
						<div className="flex items-center justify-between px-4 pb-2">
							<span className="text-foreground text-base font-semibold">
								More
							</span>
							<button
								type="button"
								onClick={() => setMoreOpen(false)}
								aria-label="Close"
								className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
						<nav className="flex flex-col px-2 pt-1 pb-2">
							{MORE.map((item) => {
								const active = isActive(pathname, item.href);
								const Icon = item.icon;
								return (
									<Link
										key={item.href}
										href={item.href}
										aria-current={active ? "page" : undefined}
										className={cn(
											"flex min-h-[3rem] items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors",
											active
												? "bg-accent text-accent-foreground"
												: "text-foreground hover:bg-muted",
										)}
									>
										<Icon
											className={cn(
												"h-5 w-5",
												active ? "text-primary" : "text-muted-foreground",
											)}
											aria-hidden="true"
										/>
										{item.label}
									</Link>
								);
							})}
						</nav>
					</div>
				</>
			)}
		</>
	);
}
