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
				className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border-default bg-surface-1/85 supports-[backdrop-filter]:bg-surface-1/65 backdrop-blur-xl pb-safe md:hidden"
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
								"flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-fluid-caption font-medium transition-colors duration-fast ease-out-expo",
								active
									? "text-primary"
									: "text-muted-foreground active:text-foreground",
							)}
						>
							<Icon
								className="size-6"
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
						"flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-fluid-caption font-medium transition-colors duration-fast ease-out-expo",
						moreActive || moreOpen
							? "text-primary"
							: "text-muted-foreground active:text-foreground",
					)}
				>
					<Ellipsis
						className="size-6"
						strokeWidth={moreActive || moreOpen ? 2.25 : 1.75}
						aria-hidden="true"
					/>
					<span className="leading-none">More</span>
				</button>
			</nav>

			<Sheet open={moreOpen} onOpenChange={setMoreOpen}>
				<SheetContent side="bottom" className="md:hidden">
					<SheetHeader>
						<SheetTitle>More</SheetTitle>
					</SheetHeader>
					<nav className="flex flex-col gap-0.5">
						{MORE.map((item) => {
							const active = isActive(pathname, item.href);
							const Icon = item.icon;
							return (
								<Link
									key={item.href}
									href={item.href}
									aria-current={active ? "page" : undefined}
									className={cn(
										"flex min-h-[3rem] items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors duration-fast ease-out-expo",
										active
											? "bg-accent text-foreground"
											: "text-foreground active:bg-surface-4",
									)}
								>
									<Icon
										className={cn(
											"size-5",
											active ? "text-primary" : "text-muted-foreground",
										)}
										aria-hidden="true"
									/>
									{item.label}
								</Link>
							);
						})}
					</nav>
				</SheetContent>
			</Sheet>
		</>
	);
}
