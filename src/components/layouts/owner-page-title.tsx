"use client";

import { usePathname } from "next/navigation";

/**
 * <OwnerPageTitle /> — shows the current page name in the topbar (replaces the
 * non-functional search). Resolves the most specific route match so sub-pages
 * read their own label (e.g. /finance/accounting → "Akuntansi"). Mirrors the
 * sidebar nav labels.
 */
const TITLES: Array<[string, string]> = [
	["/dashboard", "Dashboard"],
	["/operations/packages", "Paket"],
	["/operations/addons", "Add-on"],
	["/operations/backdrops", "Backdrop"],
	["/operations/calendar", "Kalender"],
	["/operations/board", "Board"],
	["/operations/team", "Team"],
	["/operations", "Operations"],
	["/design", "Asset & Design"],
	["/billing", "Billing"],
	["/warehouse/purchases", "Pembelian"],
	["/warehouse/suppliers", "Supplier"],
	["/warehouse/purchase-requests", "Permintaan"],
	["/warehouse/stock-take", "Stock Opname"],
	["/warehouse/wastage", "Wastage"],
	["/warehouse/assets", "Aset Tetap"],
	["/warehouse", "Warehouse"],
	["/finance/reports", "Laporan"],
	["/finance/accounting", "Akuntansi"],
	["/finance/arsip-nota", "Arsip Nota"],
	["/finance/payables", "Hutang Dagang"],
	["/finance/vendors", "Komisi Vendor"],
	["/finance/bank-accounts", "Rekening Bank"],
	["/finance/sinking-funds", "Dana Cadangan"],
	["/finance/wastage-report", "Laporan Wastage"],
	["/finance", "Finance"],
	["/contacts", "Kontak"],
	["/vendors", "Vendor"],
	["/reminders", "Reminders"],
	["/notifications", "Notifications"],
	["/reports", "Reports"],
	["/settings", "Settings"],
];

export function OwnerPageTitle() {
	const pathname = usePathname();
	const match = TITLES.find(
		([href]) => pathname === href || pathname.startsWith(`${href}/`),
	);
	const title = match?.[1] ?? "Tetra Ops";
	return (
		<h1 className="truncate text-[20px] font-bold tracking-tight text-foreground">
			{title}
		</h1>
	);
}
