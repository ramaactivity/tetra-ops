import { Container } from "@/components/layout/container";
import { NewItemFlow } from "@/components/items/new-item-flow";
import { PageHeader } from "@/components/operations/_shared/page-header";

export default function WarehouseNewItemPage() {
	return (
		<Container size="xl" className="space-y-5">
			<PageHeader
				title="Tambah Item"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Pilih dulu jenis item — sistem akan menampilkan form yg sesuai cara item dicatat di akuntansi."
			/>
			<div className="max-w-3xl rounded-lg bg-surface-2 p-5">
				<NewItemFlow returnTo="/warehouse" />
			</div>
		</Container>
	);
}
