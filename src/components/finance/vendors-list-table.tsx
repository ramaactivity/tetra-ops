"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { formatDateID, formatRupiah } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

/**
 * <VendorsListTable /> — client wrapper for finance/vendors aggregate.
 */

export type VendorStats = {
	name: string;
	contactId: string | null;
	contactPhone: string | null;
	totalEvents: number;
	totalCommission: number;
	mtdCommission: number;
	lastEventDate: string | null;
	upcomingCount: number;
};

export function VendorsListTable({ vendors }: { vendors: VendorStats[] }) {
	const columns: ResponsiveTableColumn<VendorStats>[] = [
		{
			key: "name",
			header: "Vendor",
			render: (v) => (
				<div className="space-y-0.5">
					<Link
						href={`/operations?q=${encodeURIComponent(v.name)}`}
						className="text-fluid-body font-medium text-foreground hover:underline"
					>
						{v.name}
					</Link>
					{v.contactId && (
						<p className="text-[10px] text-muted-foreground">
							Linked contact: yes
						</p>
					)}
				</div>
			),
		},
		{
			key: "totalEvents",
			header: "Total event",
			align: "right",
			hideOnMobile: true,
			render: (v) => (
				<span className="tabular text-foreground">{v.totalEvents}</span>
			),
		},
		{
			key: "upcomingCount",
			header: "Upcoming",
			align: "right",
			render: (v) => (
				<span
					className={`tabular ${
						v.upcomingCount > 0
							? "font-semibold text-amber-600 dark:text-amber-400"
							: "text-muted-foreground"
					}`}
				>
					{v.upcomingCount > 0 ? v.upcomingCount : "—"}
				</span>
			),
		},
		{
			key: "mtdCommission",
			header: "Komisi MTD",
			align: "right",
			hideOnMobile: true,
			render: (v) => (
				<span
					className={`tabular ${
						v.mtdCommission > 0
							? "font-medium text-emerald-600 dark:text-emerald-400"
							: "text-muted-foreground"
					}`}
				>
					{v.mtdCommission > 0 ? formatRupiah(v.mtdCommission) : "—"}
				</span>
			),
		},
		{
			key: "totalCommission",
			header: "Komisi total",
			align: "right",
			render: (v) => (
				<span className="tabular font-semibold text-foreground">
					{v.totalCommission > 0 ? formatRupiah(v.totalCommission) : "—"}
				</span>
			),
		},
		{
			key: "lastEventDate",
			header: "Last event",
			hideOnMobile: true,
			render: (v) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{v.lastEventDate ? formatDateID(v.lastEventDate) : "—"}
				</span>
			),
		},
		{
			key: "contact",
			header: "Contact",
			render: (v) =>
				v.contactPhone ? (
					<a
						href={waLink(v.contactPhone) ?? undefined}
						target="_blank"
						rel="noopener noreferrer"
						className="tabular inline-flex items-center gap-1 text-fluid-caption text-primary hover:underline"
					>
						{v.contactPhone}
						<ExternalLink className="size-3" />
					</a>
				) : (
					<span className="text-fluid-caption text-muted-foreground/60">—</span>
				),
		},
	];

	return (
		<div className="overflow-hidden rounded-lg border border-border-default bg-card">
			<ResponsiveTable<VendorStats>
				keyExtractor={(v) => v.name}
				rows={vendors}
				columns={columns}
				rowClassName="transition-colors hover:bg-secondary/40"
			/>
		</div>
	);
}
