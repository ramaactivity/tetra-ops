"use client";

import {
	Bell,
	Briefcase,
	Ellipsis,
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
import { useEffect, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useHaptics } from "@/lib/use-haptics";
import { cn } from "@/lib/utils";

/**
 * <OwnerBottomNav /> — sticky bottom nav for owner mobile.
 *
 * A1 refactor (sesi 5):
 * - bg-surface-1 (was bg-background — same L0/L0 problem as sidebar).
 * - View Transitions anchor: viewTransitionName="site-bottom-nav".
 * - More-button overlay rebuilt on top of F3a <Sheet> primitive instead
 *   of bespoke modal logic. Sheet handles a11y, escape-to-close, body
 *   scroll lock, focus trap, and animation tokens automatically.
 * - 3 primary tabs (Dashboard, Operations, Billing) plus Reminders are
 *   surfaced from the More sheet.
 *
 * Hidden on md+; desktop owners use the sidebar.
 */

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
	{ href: "/design", label: "Design", icon: Palette },
	{ href: "/warehouse", label: "Warehouse", icon: Package },
	{ href: "/finance", label: "Finance", icon: Wallet },
	{ href: "/reminders", label: "Reminders", icon: MessageCircle },
	{ href: "/notifications", label: "Notifications", icon: Bell },
	{ href: "/reports", label: "Reports", icon: FileText },
	{ href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function OwnerBottomNav() {
	const pathname = usePathname();
	const haptic = useHaptics();
	const [moreOpen, setMoreOpen] = useState(false);

	const moreActive = MORE.some((item) => isActive(pathname, item.href));

	// Close the sheet whenever route changes (post-navigation).
	useEffect(() => {
		setMoreOpen(false);
	}, [pathname]);

	return (
		<>
			<nav
				aria-label="Primary"
				style={{ viewTransitionName: "site-bottom-nav" }}
				className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-card/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-card/70 pb-safe md:hidden"
			>
				<div className="mx-auto flex max-w-[30rem] items-stretch justify-around px-2">
					{PRIMARY.map((item) => {
						const active = isActive(pathname, item.href);
						const Icon = item.icon;
						return (
							<Link
								key={item.href}
								href={item.href}
								onClick={() => haptic("select")}
								aria-current={active ? "page" : undefined}
								className="press-sm tap group relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5"
							>
								<span
									className={cn(
										"flex h-8 w-[3.25rem] items-center justify-center rounded-full transition-colors duration-base ease-out-expo",
										active ? "bg-primary/10" : "bg-transparent",
									)}
								>
									<Icon
										className={cn(
											"size-[1.4rem] transition-[transform,color] duration-base ease-spring-snappy",
											active
												? "scale-105 text-primary"
												: "text-muted-foreground group-active:text-foreground",
										)}
										strokeWidth={active ? 2.3 : 1.85}
										aria-hidden="true"
									/>
								</span>
								<span
									className={cn(
										"text-[0.6875rem] leading-none tracking-tight transition-colors",
										active
											? "font-semibold text-primary"
											: "font-medium text-muted-foreground",
									)}
								>
									{item.label}
								</span>
							</Link>
						);
					})}
					<button
						type="button"
						onClick={() => {
							haptic("tap");
							setMoreOpen(true);
						}}
						aria-label="More"
						aria-expanded={moreOpen}
						aria-haspopup="dialog"
						className="press-sm tap group relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5"
					>
						<span
							className={cn(
								"flex h-8 w-[3.25rem] items-center justify-center rounded-full transition-colors duration-base ease-out-expo",
								moreActive || moreOpen ? "bg-primary/10" : "bg-transparent",
							)}
						>
							<Ellipsis
								className={cn(
									"size-[1.4rem] transition-[transform,color] duration-base ease-spring-snappy",
									moreActive || moreOpen
										? "scale-105 text-primary"
										: "text-muted-foreground group-active:text-foreground",
								)}
								strokeWidth={moreActive || moreOpen ? 2.3 : 1.85}
								aria-hidden="true"
							/>
						</span>
						<span
							className={cn(
								"text-[0.6875rem] leading-none tracking-tight transition-colors",
								moreActive || moreOpen
									? "font-semibold text-primary"
									: "font-medium text-muted-foreground",
							)}
						>
							More
						</span>
					</button>
				</div>
			</nav>

			<Sheet open={moreOpen} onOpenChange={setMoreOpen}>
				<SheetContent side="bottom" className="md:hidden">
					<SheetHeader>
						<SheetTitle>Menu</SheetTitle>
					</SheetHeader>
					<nav className="grid grid-cols-2 gap-2">
						{MORE.map((item) => {
							const active = isActive(pathname, item.href);
							const Icon = item.icon;
							return (
								<Link
									key={item.href}
									href={item.href}
									onClick={() => haptic("select")}
									aria-current={active ? "page" : undefined}
									className={cn(
										"press tap flex min-h-[4rem] flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center transition-colors",
										active
											? "border-transparent bg-primary/10"
											: "border-border-default bg-card active:bg-surface-3",
									)}
								>
									<Icon
										className={cn(
											"size-[1.45rem]",
											active ? "text-primary" : "text-muted-foreground",
										)}
										aria-hidden="true"
									/>
									<span
										className={cn(
											"type-label",
											active ? "text-primary" : "text-foreground",
										)}
									>
										{item.label}
									</span>
								</Link>
							);
						})}
					</nav>
				</SheetContent>
			</Sheet>
		</>
	);
}
