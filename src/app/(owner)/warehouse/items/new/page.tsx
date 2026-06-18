import { Container } from "@/components/layout/container";
import { NewItemFlow } from "@/components/items/new-item-flow";
import { PageHeader } from "@/components/operations/_shared/page-header";
import type { ItemCategory } from "@/lib/inventory/item-loader";
import { createClient } from "@/lib/supabase/server";

export default async function WarehouseNewItemPage({
	searchParams,
}: {
	searchParams: Promise<{ category?: string }>;
}) {
	const params = await searchParams;
	const initialCategory: ItemCategory | undefined =
		params.category === "inventory" || params.category === "fixed_asset"
			? params.category
			: undefined;

	const supabase = await createClient();
	const { data: suppliers } = await supabase
		.from("suppliers")
		.select("id, name")
		.is("deleted_at", null)
		.eq("is_active", true)
		.order("name");

	return (
		<Container size="lg" className="space-y-3">
			<PageHeader
				title="Tambah Item"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Pilih dulu jenis item — sistem akan menampilkan form yg sesuai cara item dicatat di akuntansi."
			/>
			<div className="rounded-xl bg-surface-2 p-6 sm:p-8 lg:p-10">
				<NewItemFlow
					returnTo="/warehouse"
					suppliers={(suppliers ?? []) as { id: string; name: string }[]}
					initialCategory={initialCategory}
				/>
			</div>
		</Container>
	);
}
