"use client";

import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { Badge } from "@/components/ui/badge";
import { formatDateID, formatRupiah, formatRupiahCompact } from "@/lib/format";
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
	owe: number;
	payable: number;
	last_event_date: string | null;
};

function formatScheme(v: VendorRowDisplay): string {
	const value = v.commission_value_default ?? v.commission_rate_default;
	if (value == null) return "Belum diatur";
	const amount =
		(v.commission_value_type ?? "percent") === "percent"
			? `${value}%`
			: formatRupiah(value);
	return v.commission_mode === "upfront_cut"
		? `Potongan ${amount}`
		: `Komisi ${amount}`;
}

const pill =
	"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none whitespace-nowrap";

function MoneyStatus({ v }: { v: VendorRowDisplay }) {
	if (v.owe === 0 && v.payable === 0)
		return (
			<span className={`${pill} bg-secondary text-muted-foreground`}>
				Beres
			</span>
		);
	return (
		<div className="flex flex-col items-end gap-1">
			{v.owe > 0 && (
				<span
					className={`${pill} bg-amber-500/14 text-amber-800 dark:text-amber-400`}
				>
					Belum setor
					<span className="tabular" data-nominal>
						{formatRupiahCompact(v.owe)}
					</span>
				</span>
			)}
			{v.payable > 0 && (
				<span
					className={`${pill} bg-rose-500/12 text-rose-700 dark:text-rose-400`}
				>
					Komisi siap bayar
					<span className="tabular" data-nominal>
						{formatRupiahCompact(v.payable)}
					</span>
				</span>
			)}
		</div>
	);
}

const columns: CatalogColumn<VendorRowDisplay>[] = [
	{
		key: "name",
		header: "Vendor",
		cell: (v) => (
			<div className="min-w-0">
				<Link
					href={`/vendors/${v.vendor_id}`}
					className="text-foreground flex items-center gap-2 font-medium hover:underline"
				>
					{v.name}
					{!v.is_active && (
						<Badge variant="outline" className="text-[10px]">
							Arsip
						</Badge>
					)}
				</Link>
				{(v.default_pic_name || v.default_pic_contact) && (
					<div className="text-muted-foreground mt-0.5 text-xs">
						{v.default_pic_name}
						{v.default_pic_name && v.default_pic_contact ? " · " : ""}
						{v.default_pic_contact && (
							<a
								href={`https://wa.me/${toWaPhone(v.default_pic_contact)}`}
								target="_blank"
								rel="noopener noreferrer"
								className="tabular hover:text-foreground hover:underline"
							>
								{v.default_pic_contact}
							</a>
						)}
					</div>
				)}
			</div>
		),
	},
	{
		key: "scheme",
		header: "Kerja sama",
		cell: (v) => (
			<div className="flex flex-col gap-0.5">
				<span className="tabular text-foreground font-medium" data-nominal>
					{formatScheme(v)}
				</span>
				<span className="text-muted-foreground text-[11.5px]">
					{v.commission_mode === "upfront_cut"
						? "Vendor setor ke Tetra"
						: "Tetra bayar ke vendor"}
				</span>
			</div>
		),
	},
	{
		key: "events",
		header: "Acara",
		align: "right",
		cell: (v) => (
			<div className="flex flex-col items-end gap-0.5">
				<span className="tabular text-foreground font-medium">
					{v.event_count_ytd.toLocaleString("id-ID")} tahun ini
				</span>
				<span className="text-muted-foreground text-[11.5px]">
					{v.event_count.toLocaleString("id-ID")} total
				</span>
			</div>
		),
	},
	{
		key: "money",
		header: "Status uang",
		align: "right",
		cell: (v) => <MoneyStatus v={v} />,
	},
	{
		key: "last_event",
		header: "Acara terakhir",
		align: "right",
		cell: (v) => (
			<span className="text-muted-foreground text-sm">
				{v.last_event_date ? formatDateID(v.last_event_date) : "—"}
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
			searchText={(v) =>
				`${v.name} ${v.default_pic_name ?? ""} ${v.default_pic_contact ?? ""}`
			}
			searchPlaceholder="Cari nama vendor…"
			toolbar={toolbar}
			renderActions={(v) => (
				<Link
					href={`/vendors/${v.vendor_id}`}
					aria-label={`Buka ${v.name}`}
					className="border-border-default hover:bg-secondary inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium"
				>
					Buka <ChevronRight className="size-3.5 shrink-0" />
				</Link>
			)}
			emptyIcon={Building2}
			emptyTitle="Belum ada vendor terdaftar"
			emptyDescription="Tambah vendor baru, atau vendor otomatis terbuat saat booking memakai channel Vendor."
		/>
	);
}
