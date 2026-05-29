"use client";

import {
	AlertTriangle,
	Bell,
	BookOpen,
	Box,
	Briefcase,
	ChevronRight,
	ClipboardCheck,
	ClipboardList,
	Contact,
	FileBarChart,
	FileText,
	Frame,
	Handshake,
	Landmark,
	Layers,
	LayoutDashboard,
	type LucideIcon,
	MessageCircle,
	Package,
	Palette,
	PiggyBank,
	Receipt,
	Scale,
	Settings,
	ShoppingCart,
	Sparkles,
	Truck,
	Users,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * <OwnerSidebar /> — Vercel dashboard lineage + collapsible groups.
 *
 * - 260px wide, white card surface, hairline right border.
 * - Items boleh punya `children`. Parent dengan children:
 *   chevron di kanan, klik toggle collapse. Sub-items rendered indented
 *   dengan vertical rail-line di kiri (tree-style).
 * - Collapse state persisted ke localStorage per parent href.
 * - Auto-expand kalau pathname matches salah satu child (sehingga user
 *   tidak kehilangan context saat navigate via deep-link).
 *
 * Mobile: hidden (md:block). Primary nav on mobile = OwnerBottomNav.
 */

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	children?: NavItem[];
};

type NavSection = {
	items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
	{
		items: [
			{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
			{
				href: "/operations",
				label: "Operations",
				icon: Briefcase,
				children: [
					{ href: "/operations", label: "Event", icon: Briefcase },
					{ href: "/operations/packages", label: "Paket", icon: Box },
					{ href: "/operations/addons", label: "Add-on", icon: Sparkles },
					{ href: "/operations/backdrops", label: "Backdrop", icon: Frame },
				],
			},
			{ href: "/design", label: "Design", icon: Palette },
			{ href: "/billing", label: "Billing", icon: Receipt },
			{
				href: "/warehouse",
				label: "Warehouse",
				icon: Package,
				children: [
					{ href: "/warehouse", label: "Inventaris", icon: Package },
					{
						href: "/warehouse/purchases",
						label: "Pembelian",
						icon: ShoppingCart,
					},
					{
						href: "/warehouse/suppliers",
						label: "Supplier",
						icon: Truck,
					},
					{
						href: "/warehouse/purchase-requests",
						label: "Permintaan",
						icon: ClipboardCheck,
					},
					{
						href: "/warehouse/stock-take",
						label: "Stock Opname",
						icon: ClipboardList,
					},
					{
						href: "/warehouse/wastage",
						label: "Wastage",
						icon: AlertTriangle,
					},
					{
						href: "/warehouse/rekap-mapping",
						label: "Rekap Mapping",
						icon: Layers,
					},
				],
			},
			{
				href: "/finance",
				label: "Finance",
				icon: Wallet,
				children: [
					{ href: "/finance", label: "Ringkasan", icon: Wallet },
					{
						href: "/finance/reports",
						label: "Laporan",
						icon: FileBarChart,
					},
					{
						href: "/finance/accounting",
						label: "Akuntansi",
						icon: BookOpen,
					},
					{
						href: "/finance/payables",
						label: "Hutang Dagang",
						icon: Scale,
					},
					{
						href: "/finance/vendors",
						label: "Komisi Vendor",
						icon: Handshake,
					},
					{
						href: "/finance/bank-accounts",
						label: "Rekening Bank",
						icon: Landmark,
					},
					{
						href: "/finance/sinking-funds",
						label: "Dana Cadangan",
						icon: PiggyBank,
					},
					{
						href: "/finance/wastage-report",
						label: "Laporan Wastage",
						icon: AlertTriangle,
					},
				],
			},
			{
				href: "/contacts",
				label: "Kontak",
				icon: Contact,
				children: [
					{ href: "/contacts", label: "Daftar Kontak", icon: Users },
					{ href: "/vendors", label: "Vendor", icon: Handshake },
				],
			},
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

const STORAGE_KEY = "tetra-sidebar-collapsed";

export function OwnerSidebar() {
	const pathname = usePathname();

	function isActive(href: string): boolean {
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	// Persisted collapsed state: Set of parent hrefs that are MANUALLY collapsed.
	// Manual intent always wins — kalau user collapse, tetap collapsed walaupun
	// lagi di salah satu sub-route. Parent expanded by default (tidak di set).
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

	useEffect(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const arr = JSON.parse(raw) as string[];
			setCollapsed(new Set(arr));
		} catch {
			// localStorage unavailable or corrupt — start fresh
		}
	}, []);

	function toggle(href: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(href)) next.delete(href);
			else next.add(href);
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
			} catch {
				// ignore
			}
			return next;
		});
	}

	function isExpanded(parent: NavItem): boolean {
		// Expanded by default; collapse hanya kalau user explicitly toggle.
		return !collapsed.has(parent.href);
	}

	return (
		<aside
			style={{ viewTransitionName: "site-sidebar" }}
			className="hidden w-[260px] shrink-0 border-r border-border-default bg-card md:sticky md:top-14 md:flex md:h-[calc(100dvh-3.5rem)] md:flex-col md:self-start"
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
								if (item.children && item.children.length > 0) {
									return (
										<NavParent
											key={item.href}
											item={item}
											expanded={isExpanded(item)}
											onToggle={() => toggle(item.href)}
											isActive={isActive}
										/>
									);
								}
								return (
									<NavLeaf
										key={item.href}
										item={item}
										active={isActive(item.href)}
									/>
								);
							})}
						</ul>
					))}
				</div>
			</nav>
		</aside>
	);
}

function NavLeaf({ item, active }: { item: NavItem; active: boolean }) {
	const Icon = item.icon;
	return (
		<li>
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
}

function NavParent({
	item,
	expanded,
	onToggle,
	isActive,
}: {
	item: NavItem;
	expanded: boolean;
	onToggle: () => void;
	isActive: (href: string) => boolean;
}) {
	const Icon = item.icon;
	const pathname = usePathname();
	// Parent label header doesn't get its own "active" highlight — child rows
	// handle that. Otherwise both would highlight when on a sub-route.

	return (
		<li>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				className={cn(
					"group/nav flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] font-medium leading-none transition-colors duration-fast ease-out-expo",
					"text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
				)}
			>
				<Icon
					className="size-[18px] shrink-0 text-muted-foreground/70 group-hover/nav:text-foreground/80"
					aria-hidden
					strokeWidth={2}
				/>
				<span className="flex-1 text-left">{item.label}</span>
				<ChevronRight
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-fast ease-out-expo",
						expanded && "rotate-90",
					)}
					aria-hidden
					strokeWidth={2.5}
				/>
			</button>

			{expanded && item.children && (
				<ul className="relative ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-border-default/60 pl-2">
					{item.children.map((child) => {
						// Special-case: parent's own href appears as first child labeled
						// differently (e.g. "Warehouse" → "Inventaris"). Match strictly
						// supaya nggak ke-highlight saat user di sub-route lain.
						const strictActive =
							child.href === item.href
								? pathname === child.href
								: isActive(child.href);
						const ChildIcon = child.icon;
						return (
							<li key={child.href}>
								<Link
									href={child.href}
									aria-current={strictActive ? "page" : undefined}
									className={cn(
										"group/nav flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium leading-none transition-colors duration-fast ease-out-expo",
										strictActive
											? "bg-secondary text-foreground"
											: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
									)}
								>
									<ChildIcon
										className={cn(
											"size-4 shrink-0",
											strictActive
												? "text-foreground"
												: "text-muted-foreground/70 group-hover/nav:text-foreground/80",
										)}
										aria-hidden
										strokeWidth={2}
									/>
									{child.label}
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</li>
	);
}
