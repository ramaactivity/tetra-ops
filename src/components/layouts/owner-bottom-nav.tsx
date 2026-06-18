"use client";

import {
	Bell,
	Briefcase,
	Ellipsis,
	FileText,
	LayoutDashboard,
	LogOut,
	type LucideIcon,
	MessageCircle,
	Moon,
	Package,
	Palette,
	Plus,
	Receipt,
	Settings,
	Sun,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { type Theme, toggleTheme } from "@/lib/actions/theme";
import { createClient } from "@/lib/supabase/client";
import { useHaptics } from "@/lib/use-haptics";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";
import { cn } from "@/lib/utils";

/**
 * <OwnerBottomNav /> — sticky bottom nav for owner mobile.
 *
 * The "More" tab is the hub for everything secondary: it carries the unread
 * notification badge, and the sheet holds the account block (theme + sign out)
 * + the rest of the sections. This keeps the mobile top-bar slim (just the page
 * title) — no avatar/bell up top. Hidden on md+; desktop owners use the sidebar.
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
	{ href: "/leads", label: "Leads", icon: MessageCircle },
	{ href: "/notifications", label: "Notifications", icon: Bell },
	{ href: "/design", label: "Design", icon: Palette },
	{ href: "/warehouse", label: "Warehouse", icon: Package },
	{ href: "/finance", label: "Finance", icon: Wallet },
	{ href: "/reminders", label: "Reminders", icon: MessageCircle },
	{ href: "/reports", label: "Reports", icon: FileText },
	{ href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

export function OwnerBottomNav({
	name,
	email,
	role,
	theme,
}: {
	name: string;
	email: string;
	role: string;
	theme: Theme;
}) {
	const pathname = usePathname();
	const haptic = useHaptics();
	const router = useRouter();
	const [moreOpen, setMoreOpen] = useState(false);
	const [signingOut, startSignOut] = useTransition();
	const [, startThemeToggle] = useTransition();
	const unread = useUnreadNotifications();

	const moreActive = MORE.some((item) => isActive(pathname, item.href));

	// Close the sheet whenever route changes (post-navigation).
	useEffect(() => {
		setMoreOpen(false);
	}, [pathname]);

	function handleSignOut() {
		startSignOut(async () => {
			const supabase = createClient();
			await supabase.auth.signOut();
			router.push("/login");
			router.refresh();
		});
	}

	function handleToggleTheme() {
		startThemeToggle(async () => {
			await toggleTheme(theme);
			router.refresh();
		});
	}

	const unreadDisplay = unread > 99 ? "99+" : String(unread);

	return (
		<>
			<nav
				aria-label="Primary"
				style={{ viewTransitionName: "site-bottom-nav" }}
				className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-card/95 backdrop-blur-2xl supports-[backdrop-filter]:bg-card/85 pb-safe md:hidden"
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
										active ? "bg-[#059669]" : "bg-transparent",
									)}
								>
									<Icon
										className={cn(
											"size-[1.4rem] transition-[transform,color] duration-base ease-spring-snappy",
											active
												? "scale-105 text-white"
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
											? "font-semibold text-foreground"
											: "font-medium text-muted-foreground",
									)}
								>
									{item.label}
								</span>
							</Link>
						);
					})}
					<Link
						href="/finance?catat=1"
						onClick={() => haptic("tap")}
						aria-label="Catat transaksi"
						className="press-sm tap group relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5"
					>
						<span className="flex h-8 w-[3.25rem] items-center justify-center rounded-full bg-[#059669] shadow-[var(--shadow-level-1)]">
							<Plus
								className="size-[1.4rem] text-white"
								strokeWidth={2.4}
								aria-hidden="true"
							/>
						</span>
						<span className="text-[0.6875rem] font-medium leading-none tracking-tight text-foreground">
							Catat
						</span>
					</Link>
					<button
						type="button"
						onClick={() => {
							haptic("tap");
							setMoreOpen(true);
						}}
						aria-label={`More${unread > 0 ? ` — ${unread} notifikasi belum dibaca` : ""}`}
						aria-expanded={moreOpen}
						aria-haspopup="dialog"
						className="press-sm tap group relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5"
					>
						<span
							className={cn(
								"relative flex h-8 w-[3.25rem] items-center justify-center rounded-full transition-colors duration-base ease-out-expo",
								moreActive || moreOpen ? "bg-[#059669]" : "bg-transparent",
							)}
						>
							<Ellipsis
								className={cn(
									"size-[1.4rem] transition-[transform,color] duration-base ease-spring-snappy",
									moreActive || moreOpen
										? "scale-105 text-white"
										: "text-muted-foreground group-active:text-foreground",
								)}
								strokeWidth={moreActive || moreOpen ? 2.3 : 1.85}
								aria-hidden="true"
							/>
							{unread > 0 && (
								<span
									aria-hidden="true"
									className="bg-rose-500 text-white tabular pointer-events-none absolute -right-0.5 top-0 inline-flex min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-[1.125rem] ring-2 ring-card"
								>
									{unreadDisplay}
								</span>
							)}
						</span>
						<span
							className={cn(
								"text-[0.6875rem] leading-none tracking-tight transition-colors",
								moreActive || moreOpen
									? "font-semibold text-foreground"
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

					{/* Account block (replaces the top-bar avatar on mobile) */}
					<div className="mb-3 flex items-center gap-3 rounded-2xl border border-border-subtle bg-card p-3">
						<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#059669] text-[13px] font-semibold text-white">
							{initialsOf(name)}
						</span>
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold text-foreground">
								{name}
							</p>
							<p className="truncate text-xs text-muted-foreground">{email}</p>
							<p className="text-[11px] font-medium text-primary">{role}</p>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<button
								type="button"
								onClick={handleToggleTheme}
								aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}
								className="press tap inline-flex size-9 items-center justify-center rounded-full border border-border-default bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							>
								{theme === "dark" ? (
									<Sun className="size-4" />
								) : (
									<Moon className="size-4" />
								)}
							</button>
							<button
								type="button"
								onClick={handleSignOut}
								disabled={signingOut}
								aria-label="Keluar"
								className="press tap inline-flex size-9 items-center justify-center rounded-full border border-destructive/30 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
							>
								<LogOut className="size-4" />
							</button>
						</div>
					</div>

					<nav className="grid grid-cols-2 gap-2">
						{MORE.map((item) => {
							const active = isActive(pathname, item.href);
							const Icon = item.icon;
							const isNotifications = item.href === "/notifications";
							return (
								<Link
									key={item.href}
									href={item.href}
									onClick={() => haptic("select")}
									aria-current={active ? "page" : undefined}
									className={cn(
										"press tap relative flex min-h-[4rem] flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center transition-colors",
										active
											? "border-transparent bg-[#059669] shadow-[var(--shadow-soft)]"
											: "border-border-subtle bg-card active:bg-surface-3",
									)}
								>
									{isNotifications && unread > 0 && (
										<span
											aria-hidden="true"
											className="bg-rose-500 text-white tabular absolute right-2 top-2 inline-flex min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-[1.125rem]"
										>
											{unreadDisplay}
										</span>
									)}
									<Icon
										className={cn(
											"size-[1.45rem]",
											active ? "text-white" : "text-muted-foreground",
										)}
										aria-hidden="true"
									/>
									<span
										className={cn(
											"type-label",
											active ? "font-semibold text-white" : "text-foreground",
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
