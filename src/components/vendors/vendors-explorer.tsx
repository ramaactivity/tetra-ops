"use client";

import { Building2, Phone } from "lucide-react";
import Link from "next/link";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { EditLink } from "@/components/catalog/form-kit";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import { toWaPhone } from "@/lib/whatsapp";

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

function formatScheme(v: VendorRowDisplay): string {
	const mode = v.commission_mode ?? "commission";
	const valueType = v.commission_value_type ?? "percent";
	const value = v.commission_value_default ?? v.commission_rate_default;
	if (value == null) return "—";
	if (mode === "upfront_cut") return `− ${formatRupiah(value)}`;
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

const columns: CatalogColumn<VendorRowDisplay>[] = [
	{
		key: "name",
		header: "Nama Vendor",
		cell: (v) => (
			<div className="min-w-0">
				<div className="text-foreground flex items-center gap-2 font-medium">
					{v.name}
					{!v.is_active && (
						<Badge variant="outline" className="text-[10px]">
							Arsip
						</Badge>
					)}
				</div>
				{v.default_pic_name && (
					<div className="text-muted-foreground mt-0.5 text-xs">
						PIC: {v.default_pic_name}
					</div>
				)}
			</div>
		),
	},
	{
		key: "contact",
		header: "Kontak",
		cell: (v) =>
			v.default_pic_contact ? (
				<a
					href={`https://wa.me/${toWaPhone(v.default_pic_contact)}`}
					target="_blank"
					rel="noopener noreferrer"
					className="tabular text-link inline-flex items-center gap-1.5 text-sm hover:underline"
				>
					<Phone className="size-3.5" aria-hidden />
					{v.default_pic_contact}
				</a>
			) : (
				<span className="text-muted-foreground">—</span>
			),
	},
	{
		key: "scheme",
		header: "Skema",
		align: "right",
		cell: (v) => (
			<div className="flex flex-col items-end gap-0.5">
				<span className="tabular text-foreground font-medium">
					{formatScheme(v)}
				</span>
				<span className="eyebrow text-muted-foreground/70">
					{(v.commission_mode ?? "commission") === "upfront_cut"
						? "Potongan base"
						: "Komisi langsung"}
				</span>
			</div>
		),
	},
	{
		key: "events",
		header: "Event YTD",
		align: "right",
		cell: (v) => (
			<div className="flex flex-col items-end gap-0.5">
				<span className="tabular text-foreground font-medium">
					{v.event_count_ytd.toLocaleString("id-ID")}
				</span>
				{v.event_count > v.event_count_ytd && (
					<span className="text-muted-foreground text-[11px]">
						total {v.event_count.toLocaleString("id-ID")}
					</span>
				)}
			</div>
		),
	},
	{
		key: "commission_ytd",
		header: "Komisi YTD",
		align: "right",
		cell: (v) => (
			<span className="tabular text-foreground">
				{formatRupiah(v.commission_ytd)}
			</span>
		),
	},
	{
		key: "last_event",
		header: "Event Terakhir",
		align: "right",
		cell: (v) => (
			<span className="text-muted-foreground text-sm">
				{formatDateID(v.last_event_date)}
			</span>
		),
	},
];

export function VendorsExplorer({
	vendors,
	toolbar,
}: {
	vendors: VendorRowDisplay[];
	toolbar?: React.ReactNode;
}) {
	return (
		<CatalogExplorer
			rows={vendors}
			columns={columns}
			getId={(v) => v.vendor_id}
			titleKey="name"
			cardSubtitle={(v) =>
				v.default_pic_name ? `PIC: ${v.default_pic_name}` : null
			}
			searchText={(v) =>
				`${v.name} ${v.default_pic_name ?? ""} ${v.default_pic_contact ?? ""}`
			}
			searchPlaceholder="Cari nama vendor…"
			toolbar={toolbar}
			renderActions={(v) => (
				<EditLink href={`/vendors/${v.vendor_id}/edit`} label={v.name} />
			)}
			emptyIcon={Building2}
			emptyTitle="Belum ada vendor terdaftar"
			emptyDescription="Tambah vendor baru, atau biarkan otomatis terbuat saat owner input booking dengan channel = Vendor."
		/>
	);
}
