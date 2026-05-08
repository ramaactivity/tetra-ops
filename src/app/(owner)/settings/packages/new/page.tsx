import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SectionHeader } from "@/components/layout/section-header";
import { PackageForm } from "@/components/packages/package-form";
import { createPackage } from "@/lib/actions/packages";

export default function NewPackagePage() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/settings/packages"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Packages
				</Link>
				<SectionHeader
					as="h2"
					title="New Package"
					description="Tambah paket baru ke pricelist Tetra."
				/>
			</div>
			<div className="border-border-default bg-surface-2 rounded-xl border p-6">
				<PackageForm action={createPackage} submitLabel="Create package" />
			</div>
		</div>
	);
}
