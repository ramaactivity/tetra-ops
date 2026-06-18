"use client";

import {
	AlertTriangle,
	Archive,
	Bell,
	BookOpen,
	Box,
	Briefcase,
	Calendar,
	ChevronLeft,
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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
	["/warehouse/wastage", "Wastage", AlertTriangle],
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

const PILL_CLS =
	"inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-card pl-3 pr-4 shadow-[var(--shadow-level-1)] md:border-transparent md:bg-secondary md:shadow-none";

export function OwnerPageTitle() {
	const pathname = usePathname();
	const match = ROUTES.find(
		([href]) => pathname === href || pathname.startsWith(`${href}/`),
	);
	const [href, label, Icon] = match ?? ["", "Tetra Ops", LayoutDashboard];

	// On a sub-page (deeper than its section root) the pill becomes the BACK
	// control → goes to the section root. Keeps the back affordance in the topbar
	// instead of a lone in-page link that leaves a big empty band. Global rule.
	const isSubPage = Boolean(match) && pathname !== href;

	if (isSubPage) {
		return (
			<Link
				href={href}
				aria-label={`Kembali ke ${label}`}
				className={cn(
					PILL_CLS,
					"transition-colors hover:bg-secondary md:hover:bg-muted",
				)}
			>
				<ChevronLeft
					className="size-[17px] shrink-0 text-muted-foreground"
					strokeWidth={2}
				/>
				<span className="truncate text-[14px] font-semibold text-foreground">
					{label}
				</span>
			</Link>
		);
	}

	return (
		<span className={PILL_CLS}>
			<Icon
				className="size-[17px] shrink-0 text-muted-foreground"
				strokeWidth={2}
			/>
			<span className="truncate text-[14px] font-semibold text-foreground">
				{label}
			</span>
		</span>
	);
}
