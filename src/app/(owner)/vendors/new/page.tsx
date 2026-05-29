import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { VendorForm } from "@/components/vendors/vendor-form";
import { createVendor } from "@/lib/actions/vendors";

export default function NewVendorPage() {
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
					title="Vendor Baru"
					description="Daftarkan vendor / partner organizer. Setelah save, vendor langsung muncul di booking form autocomplete."
				/>
			</div>
			<VendorForm action={createVendor} submitLabel="Save vendor" />
		</div>
	);
}
