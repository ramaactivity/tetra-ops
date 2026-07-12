"use client";

import {
	AlertTriangle,
	Archive,
	Bell,
	BookOpen,
	Box,
	Boxes,
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
	Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * <OwnerSidebar /> — UpGradely DNA: a floating white card that frames the left
 * edge over the ambient gradient. Logo top, then a flat nav with chunky ink
 * active rows; parents with children expand inline. Hidden < md (mobile uses
 * OwnerBottomNav).
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
			{ href: "/design", label: "Asset & Design", icon: Palette },
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
						href: "/warehouse/asset-check",
						label: "Cek Alat",
						icon: Wrench,
					},
					// Wastage hidden until owners are ready to use it (2026-06-24).
					// Route + page still live; restore this item to re-expose.
					// {
					// 	href: "/warehouse/wastage",
					// 	label: "Wastage",
					// 	icon: AlertTriangle,
					// },
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
						href: "/finance/arsip-nota",
						label: "Arsip Nota",
						icon: Archive,
					},
					{
						href: "/finance/payables",
						label: "Hutang Dagang",
						icon: Scale,
					},
					{
						href: "/finance/vendors",
						label: "Komisi",
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
					{
						href: "/finance/persediaan-report",
						label: "Persediaan & COGS",
						icon: Boxes,
					},
					{
						href: "/finance/reconciliation",
						label: "Rekonsiliasi",
						icon: Scale,
					},
				],
			},
			{ href: "/leads", label: "Leads", icon: MessageCircle },
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
		return !collapsed.has(parent.href);
	}

	return (
		<aside
			style={{ viewTransitionName: "site-sidebar" }}
			className="hidden w-[256px] shrink-0 md:sticky md:top-3 md:flex md:h-[calc(100dvh-1.5rem)] md:flex-col md:self-start"
		>
			<div className="flex flex-1 flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
				<div className="flex h-[60px] shrink-0 items-center px-6">
					<Link
						href="/dashboard"
						className="text-[18px] font-bold tracking-tight text-foreground"
					>
						Tetra Ops
					</Link>
				</div>
				<nav className="scrollbar-vercel flex-1 overflow-y-auto px-3.5 pb-4">
					<div className="flex flex-col gap-4">
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
			</div>
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
					"group/nav flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[14.5px] leading-none transition-colors duration-fast ease-out-expo",
					active
						? "bg-[#059669] font-semibold text-white"
						: "font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
				)}
			>
				<Icon
					className={cn(
						"size-[18px] shrink-0",
						active
							? "text-white"
							: "text-muted-foreground/80 group-hover/nav:text-foreground",
					)}
					aria-hidden
					strokeWidth={1.85}
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

	return (
		<li>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				className={cn(
					"group/nav flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[14.5px] font-medium leading-none transition-colors duration-fast ease-out-expo",
					"text-muted-foreground hover:bg-secondary hover:text-foreground",
				)}
			>
				<Icon
					className="size-[18px] shrink-0 text-muted-foreground/80 group-hover/nav:text-foreground"
					aria-hidden
					strokeWidth={1.85}
				/>
				<span className="flex-1 text-left">{item.label}</span>
				<ChevronRight
					className={cn(
						"size-4 shrink-0 text-muted-foreground/60 transition-transform duration-fast ease-out-expo",
						expanded && "rotate-90",
					)}
					aria-hidden
					strokeWidth={2.25}
				/>
			</button>

			{expanded && item.children && (
				<ul className="relative ml-[26px] mt-0.5 flex flex-col gap-0.5 border-l border-border-default pl-2.5">
					{item.children.map((child) => {
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
										"group/nav flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] leading-none transition-colors duration-fast ease-out-expo",
										strictActive
											? "bg-[#059669] font-semibold text-white"
											: "font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
									)}
								>
									<ChildIcon
										className={cn(
											"size-[16px] shrink-0",
											strictActive
												? "text-white"
												: "text-muted-foreground/80 group-hover/nav:text-foreground",
										)}
										aria-hidden
										strokeWidth={1.85}
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
