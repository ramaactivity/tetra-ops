"use client";

import {
	Archive,
	Bell,
	BookOpen,
	Box,
	Briefcase,
	Calendar,
	ClipboardList,
	Contact,
	FileBarChart,
	FileText,
	Frame,
	Handshake,
	KanbanSquare,
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
	UsersRound,
	Wallet,
} from "lucide-react";
import { usePathname } from "next/navigation";

/**
 * <OwnerPageTitle /> — current page name shown as a soft pill (icon + label) in
 * the topbar, replacing the non-functional search. Resolves the most specific
 * route match so sub-pages read their own label/icon. Mirrors the sidebar.
 */
const ROUTES: Array<[string, string, LucideIcon]> = [
	["/dashboard", "Dashboard", LayoutDashboard],
	["/operations/packages", "Paket", Box],
	["/operations/addons", "Add-on", Sparkles],
	["/operations/backdrops", "Backdrop", Frame],
	["/operations/calendar", "Kalender", Calendar],
	["/operations/board", "Board", KanbanSquare],
	["/operations/team", "Team", UsersRound],
	["/operations", "Operations", Briefcase],
	["/design", "Asset & Design", Palette],
	["/billing", "Billing", Receipt],
	["/warehouse/purchases", "Pembelian", ShoppingCart],
	["/warehouse/suppliers", "Supplier", Truck],
	["/warehouse/purchase-requests", "Permintaan", ClipboardList],
	["/warehouse/stock-take", "Stock Opname", ClipboardList],
	["/warehouse", "Warehouse", Package],
	["/finance/reports", "Laporan", FileBarChart],
	["/finance/accounting", "Akuntansi", BookOpen],
	["/finance/arsip-nota", "Arsip Nota", Archive],
	["/finance/payables", "Hutang Dagang", Scale],
	["/finance/vendors", "Komisi Vendor", Handshake],
	["/finance/bank-accounts", "Rekening Bank", Landmark],
	["/finance/sinking-funds", "Dana Cadangan", PiggyBank],
	["/finance", "Finance", Wallet],
	["/contacts", "Kontak", Contact],
	["/vendors", "Vendor", Handshake],
	["/reminders", "Reminders", MessageCircle],
	["/notifications", "Notifications", Bell],
	["/reports", "Reports", FileText],
	["/settings", "Settings", Settings],
];

export function OwnerPageTitle() {
	const pathname = usePathname();
	const match = ROUTES.find(
		([href]) => pathname === href || pathname.startsWith(`${href}/`),
	);
	const [, label, Icon] = match ?? ["", "Tetra Ops", LayoutDashboard];
	return (
		<span className="inline-flex h-9 items-center gap-2 rounded-full bg-secondary pl-3 pr-4">
			<Icon className="size-[17px] shrink-0 text-muted-foreground" strokeWidth={2} />
			<span className="truncate text-[14px] font-semibold text-foreground">
				{label}
			</span>
		</span>
	);
}
