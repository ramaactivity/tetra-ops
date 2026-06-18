import { BackdropForm } from "@/components/backdrops/backdrop-form";
import {
	CatalogFormCard,
	CatalogFormHeader,
} from "@/components/catalog/form-kit";
import { Container } from "@/components/layout/container";

export default function NewBackdropPage() {
	return (
		<Container size="lg" className="space-y-3">
			<CatalogFormHeader
				backHref="/operations/backdrops"
				backLabel="Backdrop"
				eyebrow="Katalog baru"
				title="Backdrop Baru"
				description="Tambah backdrop ke katalog supaya muncul di booking form."
			/>
			<CatalogFormCard>
				<BackdropForm mode="create" />
			</CatalogFormCard>
		</Container>
	);
}
