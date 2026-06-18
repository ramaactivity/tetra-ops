import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { VendorForm } from "@/components/vendors/vendor-form";
import { createVendor } from "@/lib/actions/vendors";

export default function NewVendorPage() {
	return (
		<Container size="lg" className="space-y-3">
			<div className="space-y-2">
				<SectionHeader
					as="h1"
					title="Vendor Baru"
					description="Daftarkan vendor / partner organizer. Setelah save, vendor langsung muncul di booking form autocomplete."
				/>
			</div>
			<VendorForm action={createVendor} submitLabel="Simpan Vendor" />
		</Container>
	);
}
