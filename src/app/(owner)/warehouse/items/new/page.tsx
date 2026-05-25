import { Container } from "@/components/layout/container";
import { NewItemFlow } from "@/components/items/new-item-flow";
import { PageHeader } from "@/components/operations/_shared/page-header";

export default function WarehouseNewItemPage() {
	return (
		<Container size="lg" className="space-y-6">
			<PageHeader
				title="Tambah Item"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Pilih dulu jenis item — sistem akan menampilkan form yg sesuai cara item dicatat di akuntansi."
			/>
			<div className="rounded-xl bg-surface-2 p-6 sm:p-8 lg:p-10">
				<NewItemFlow returnTo="/warehouse" />
			</div>
		</Container>
	);
}
