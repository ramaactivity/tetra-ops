import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { VendorForm } from "@/components/vendors/vendor-form";
import { createVendor } from "@/lib/actions/vendors";

export default function NewVendorPage() {
	return (
		<Container size="lg" className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/vendors"
					className="inline-flex items-center gap-1 text-fluid-caption font-medium text-muted-foreground hover:text-foreground"
				>
					<ChevronLeft className="size-3.5" />
					Vendor
				</Link>
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
