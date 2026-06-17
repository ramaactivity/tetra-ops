import {
	CatalogFormCard,
	CatalogFormHeader,
} from "@/components/catalog/form-kit";
import { Container } from "@/components/layout/container";
import { PackageForm } from "@/components/packages/package-form";
import { createPackage } from "@/lib/actions/packages";

export default function NewPackagePage() {
	return (
		<Container size="lg" className="space-y-6">
			<CatalogFormHeader
				backHref="/operations/packages"
				backLabel="Paket"
				eyebrow="Pricelist baru"
				title="Paket Baru"
				description="Tambah paket baru ke pricelist Tetra."
			/>
			<CatalogFormCard>
				<PackageForm action={createPackage} submitLabel="Simpan Paket" />
			</CatalogFormCard>
		</Container>
	);
}
