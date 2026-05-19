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

	const [{ data: vendor, error }, { data: aggregate }] = await Promise.all([
		supabase
			.from("contacts")
			.select(
				"id, type, name, phone, email, notes, is_active, default_pic_name, default_pic_contact, commission_rate_default, payment_terms, company_address",
			)
			.eq("id", id)
			.eq("type", "vendor")
			.maybeSingle(),
		supabase
			.from("vendor_summary_v")
			.select(
				"event_count, event_count_ytd, commission_ytd, gross_revenue_ytd, last_event_date",
			)
			.eq("vendor_id", id)
			.maybeSingle(),
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

	const action = updateVendor.bind(null, vendor.id as string);

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<Link
					href="/settings/vendors"
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
					commission_rate_default: vendor.commission_rate_default ?? 10,
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
