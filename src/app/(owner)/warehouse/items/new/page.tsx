import { Container } from "@/components/layout/container";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/operations/_shared/page-header";

export default function WarehouseNewItemPage() {
	return (
		<Container size="xl" className="space-y-5">
			<PageHeader
				title="Tambah Item"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Tambah consumable (sleeve, FD, mediaset) atau equipment (kamera, printer, light) ke master inventory. Setelah simpan, kembali ke warehouse list."
			/>
			<div className="max-w-3xl rounded-lg border border-border-default bg-surface-2 p-5">
				<ItemForm mode="create" returnTo="/warehouse" />
			</div>
		</Container>
	);
}
