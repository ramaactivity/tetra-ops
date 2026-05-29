import { Archive, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { VendorForm } from "@/components/vendors/vendor-form";
import { ArchiveVendorButton } from "@/components/vendors/archive-vendor-button";
import { updateVendor } from "@/lib/actions/vendors";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";

export default async function EditVendorPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const [{ data: vendor, error }, { data: eventsData }] = await Promise.all([
		supabase
			.from("contacts")
			.select(
				"id, type, name, phone, email, notes, is_active, default_pic_name, default_pic_contact, commission_rate_default, commission_mode, commission_value_type, commission_value_default, payment_terms, company_address",
			)
			.eq("id", id)
			.eq("type", "vendor")
			.maybeSingle(),
		// Inline aggregate — no view dependency. See note in vendors/page.tsx.
		supabase
			.from("events")
			.select(
				"event_date, vendor_commission_amount, grand_total",
			)
			.eq("vendor_contact_id", id)
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false),
	]);

	if (error || !vendor) {
		if (error) {
			return (
				<div className="rounded-md border border-destructive bg-destructive/10 p-4">
					<p className="text-fluid-body font-medium text-destructive">
						Gagal memuat vendor: {error.message}
					</p>
				</div>
			);
		}
		notFound();
	}

	// Compute aggregates inline (cheap — typically 1-50 events per vendor).
	const ytdStart = `${new Date().getFullYear()}-01-01`;
	const events = (eventsData ?? []) as Array<{
		event_date: string;
		vendor_commission_amount: number | null;
		grand_total: number | null;
	}>;
	const aggregate = events.reduce(
		(acc, e) => {
			acc.event_count += 1;
			if (e.event_date >= ytdStart) {
				acc.event_count_ytd += 1;
				acc.commission_ytd += e.vendor_commission_amount ?? 0;
				acc.gross_revenue_ytd += e.grand_total ?? 0;
			}
			return acc;
		},
		{
			event_count: 0,
			event_count_ytd: 0,
			commission_ytd: 0,
			gross_revenue_ytd: 0,
		},
	);

	const action = updateVendor.bind(null, vendor.id as string);

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<Link
					href="/vendors"
					className="inline-flex items-center gap-1 text-fluid-caption font-medium text-muted-foreground hover:text-foreground"
				>
					<ChevronLeft className="size-3.5" />
					Vendors
				</Link>
				<SectionHeader
					as="h2"
					title={`Edit: ${vendor.name}`}
					description="Update profil vendor. Perubahan apply ke autocomplete booking form & aggregate di /finance/vendors."
					actions={
						!vendor.is_active && (
							<Badge variant="outline" className="text-[11px]">
								<Archive className="size-3" />
								Archived
							</Badge>
						)
					}
				/>
			</div>

			{aggregate && (
				<dl className="grid gap-3 sm:grid-cols-4">
					<MiniStat
						label="Event total"
						value={(aggregate.event_count ?? 0).toLocaleString("id-ID")}
					/>
					<MiniStat
						label="Event YTD"
						value={(aggregate.event_count_ytd ?? 0).toLocaleString("id-ID")}
					/>
					<MiniStat
						label="Gross YTD"
						value={formatRupiah(aggregate.gross_revenue_ytd ?? 0)}
					/>
					<MiniStat
						label="Komisi YTD"
						value={formatRupiah(aggregate.commission_ytd ?? 0)}
					/>
				</dl>
			)}

			<VendorForm
				action={action}
				submitLabel="Save changes"
				successMessage="Perubahan disimpan!"
				defaults={{
					name: vendor.name,
					default_pic_name: vendor.default_pic_name ?? "",
					default_pic_contact: vendor.default_pic_contact ?? "",
					commission_mode:
						(vendor.commission_mode as "commission" | "upfront_cut" | null) ??
						"commission",
					commission_value_type:
						(vendor.commission_value_type as "percent" | "flat" | null) ??
						"percent",
					commission_value_default:
						(vendor.commission_value_default as number | null) ??
						(vendor.commission_rate_default as number | null) ??
						10,
					payment_terms: vendor.payment_terms ?? "",
					company_address: vendor.company_address ?? "",
					email: vendor.email ?? "",
					notes: vendor.notes ?? "",
				}}
			/>

			{vendor.is_active && (
				<div className="rounded-lg border border-border-default bg-surface-2 p-5">
					<h3 className="text-[14px] font-semibold tracking-tight">
						Archive vendor
					</h3>
					<p className="mt-1 text-[12px] text-muted-foreground">
						Vendor archived tidak muncul di booking form autocomplete, tapi
						event history yang sudah link tetap utuh. Bisa di-restore kapan
						saja.
					</p>
					<div className="mt-3">
						<ArchiveVendorButton id={vendor.id as string} mode="archive" />
					</div>
				</div>
			)}
			{!vendor.is_active && (
				<div className="rounded-lg border border-border-default bg-surface-2 p-5">
					<h3 className="text-[14px] font-semibold tracking-tight">
						Restore vendor
					</h3>
					<p className="mt-1 text-[12px] text-muted-foreground">
						Restore → vendor kembali muncul di booking form autocomplete.
					</p>
					<div className="mt-3">
						<ArchiveVendorButton id={vendor.id as string} mode="restore" />
					</div>
				</div>
			)}
		</div>
	);
}

function MiniStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-border-default bg-card p-3">
			<dt className="eyebrow truncate">{label}</dt>
			<dd className="tabular mt-1 text-[18px] font-semibold leading-tight text-foreground">
				{value}
			</dd>
		</div>
	);
}
