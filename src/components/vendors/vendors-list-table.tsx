"use client";

import { ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { formatRupiah } from "@/lib/format";

export type VendorRowDisplay = {
	vendor_id: string;
	name: string;
	default_pic_name: string | null;
	default_pic_contact: string | null;
	commission_mode: "commission" | "upfront_cut" | null;
	commission_value_type: "percent" | "flat" | null;
	commission_value_default: number | null;
	commission_rate_default: number | null;
	payment_terms: string | null;
	is_active: boolean;
	event_count: number;
	event_count_ytd: number;
	commission_ytd: number;
	gross_revenue_ytd: number;
	last_event_date: string | null;
};

/**
 * Format commission scheme for vendor row.
 *
 * commission + percent: "10%"
 * commission + flat:    "Rp 500.000"
 * upfront_cut:          "−Rp 500.000" (negative sign = potongan dari base)
 */
function formatScheme(v: VendorRowDisplay): string {
	const mode = v.commission_mode ?? "commission";
	const valueType = v.commission_value_type ?? "percent";
	const value = v.commission_value_default ?? v.commission_rate_default;
	if (value == null) return "—";

	if (mode === "upfront_cut") {
		return `− ${formatRupiah(value)}`;
	}
	if (valueType === "percent") return `${value}%`;
	return formatRupiah(value);
}

function formatDateID(d: string | null): string {
	if (!d) return "—";
	return new Date(d).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function VendorsListTable({ vendors }: { vendors: VendorRowDisplay[] }) {
	const columns: ResponsiveTableColumn<VendorRowDisplay>[] = [
		{
			key: "name",
			header: "Nama Vendor",
			render: (v) => (
				<div className="space-y-0.5">
					<div className="flex items-center gap-2 font-medium text-foreground">
						{v.name}
						{!v.is_active && (
							<Badge variant="outline" className="text-[10px]">
								Archived
							</Badge>
						)}
					</div>
					{v.default_pic_name && (
						<div className="text-fluid-caption text-muted-foreground">
							PIC: {v.default_pic_name}
						</div>
					)}
				</div>
			),
		},
		{
			key: "contact",
			header: "Kontak",
			hideOnMobile: true,
			render: (v) =>
				v.default_pic_contact ? (
					<a
						href={`https://wa.me/${cleanWaNumber(v.default_pic_contact)}`}
						target="_blank"
						rel="noopener noreferrer"
						className="tabular inline-flex items-center gap-1.5 text-fluid-caption text-link hover:underline"
					>
						<Phone className="size-3.5" aria-hidden />
						{v.default_pic_contact}
					</a>
				) : (
					<span className="text-muted-foreground text-fluid-caption">—</span>
				),
		},
		{
			key: "scheme",
			header: "Skema",
			align: "right",
			render: (v) => {
				const mode = v.commission_mode ?? "commission";
				return (
					<div className="space-y-0.5 text-right">
						<div className="tabular text-fluid-body font-medium">
							{formatScheme(v)}
						</div>
						<div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
							{mode === "upfront_cut"
								? "Potongan dari base"
								: "Komisi langsung"}
						</div>
					</div>
				);
			},
		},
		{
			key: "events",
			header: "Event YTD",
			align: "right",
			hideOnMobile: true,
			render: (v) => (
				<div className="space-y-0.5 text-right">
					<div className="tabular text-fluid-body font-medium">
						{v.event_count_ytd.toLocaleString("id-ID")}
					</div>
					{v.event_count > v.event_count_ytd && (
						<div className="text-muted-foreground text-[11px]">
							total: {v.event_count.toLocaleString("id-ID")}
						</div>
					)}
				</div>
			),
		},
		{
			key: "commission_ytd",
			header: "Komisi YTD",
			align: "right",
			hideOnMobile: true,
			render: (v) => (
				<span className="tabular text-fluid-body">
					{formatRupiah(v.commission_ytd)}
				</span>
			),
		},
		{
			key: "last_event",
			header: "Event Terakhir",
			align: "right",
			hideOnMobile: true,
			render: (v) => (
				<span className="text-muted-foreground text-fluid-caption">
					{formatDateID(v.last_event_date)}
				</span>
			),
		},
		{
			key: "actions",
			header: "",
			align: "right",
			render: (v) => (
				<Link
					href={`/settings/vendors/${v.vendor_id}/edit`}
					className="inline-flex items-center gap-1 text-fluid-caption font-medium text-link hover:underline"
					aria-label={`Edit ${v.name}`}
				>
					Edit
					<ChevronRight className="size-3.5" aria-hidden />
				</Link>
			),
		},
	];

	return (
		<ResponsiveTable
			columns={columns}
			rows={vendors}
			keyExtractor={(v) => v.vendor_id}
		/>
	);
}

/** Strip non-digits + normalize Indonesian 08x → 628x for wa.me URLs. */
function cleanWaNumber(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	if (digits.startsWith("0")) return `62${digits.slice(1)}`;
	if (digits.startsWith("62")) return digits;
	return digits;
}
