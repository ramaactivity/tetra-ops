import { Archive, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { Badge } from "@/components/ui/badge";
import { ArchiveVendorButton } from "@/components/vendors/archive-vendor-button";
import { VendorForm } from "@/components/vendors/vendor-form";
import { updateVendor } from "@/lib/actions/vendors";
import { createClient } from "@/lib/supabase/server";

export default async function EditVendorPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const [{ data: vendor, error }] = await Promise.all([
		supabase
			.from("contacts")
			.select(
				"id, type, name, phone, email, notes, is_active, default_pic_name, default_pic_contact, commission_rate_default, commission_mode, commission_value_type, commission_value_default, payment_terms, company_address",
			)
			.eq("id", id)
			.eq("type", "vendor")
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
		<Container size="lg" className="space-y-3">
			<TopbarEntityPortal name={vendor.name as string} />
			<div className="space-y-2">
				<Link
					href={`/vendors/${vendor.id}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[13px] font-medium"
				>
					<ArrowLeft className="size-4 shrink-0" /> Pusat Vendor
				</Link>
				<SectionHeader
					as="h1"
					title={`Ubah profil & komisi · ${vendor.name}`}
					description="Data ini dipakai di form booking dan jadi bawaan booking baru vendor. Acara yang sudah ada tidak berubah."
					actions={
						!vendor.is_active && (
							<Badge variant="outline" className="text-[11px]">
								<Archive className="size-3" />
								Diarsipkan
							</Badge>
						)
					}
				/>
			</div>

			<VendorForm
				action={action}
				submitLabel="Simpan perubahan"
				successMessage="Perubahan disimpan!"
				doneHref={`/vendors/${vendor.id}`}
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
				<div className="rounded-2xl border border-border-default bg-card p-5 shadow-[var(--shadow-level-2)]">
					<h3 className="type-heading">Arsipkan vendor</h3>
					<p className="type-secondary mt-0.5">
						Vendor yang diarsipkan tidak muncul lagi di pilihan form booking.
						Riwayat acaranya tetap utuh dan bisa dipulihkan kapan saja.
					</p>
					<div className="mt-3">
						<ArchiveVendorButton id={vendor.id as string} mode="archive" />
					</div>
				</div>
			)}
			{!vendor.is_active && (
				<div className="rounded-2xl border border-border-default bg-card p-5 shadow-[var(--shadow-level-2)]">
					<h3 className="type-heading">Pulihkan vendor</h3>
					<p className="type-secondary mt-0.5">
						Vendor kembali muncul di pilihan form booking.
					</p>
					<div className="mt-3">
						<ArchiveVendorButton id={vendor.id as string} mode="restore" />
					</div>
				</div>
			)}
		</Container>
	);
}
