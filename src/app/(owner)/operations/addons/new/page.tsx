import {
	AddonForm,
	type InventoryItemOption,
} from "@/components/addons/addon-form";
import {
	CatalogFormCard,
	CatalogFormHeader,
} from "@/components/catalog/form-kit";
import { Container } from "@/components/layout/container";
import { createAddon } from "@/lib/actions/addons";
import { createClient } from "@/lib/supabase/server";

export default async function NewAddonPage() {
	const supabase = await createClient();
	const { data: inventoryItems } = await supabase
		.from("inventory_items")
		.select("id, sku, name, unit")
		.eq("category", "inventory")
		.eq("is_active", true)
		.is("deleted_at", null)
		.order("sku", { ascending: true });

	return (
		<Container size="lg" className="space-y-6">
			<CatalogFormHeader
				backHref="/operations/addons"
				backLabel="Add-on"
				eyebrow="Pricelist baru"
				title="Add-on Baru"
				description="Tambah add-on yang bisa dipilih saat booking."
			/>
			<CatalogFormCard>
				<AddonForm
					action={createAddon}
					submitLabel="Simpan Add-on"
					inventoryItems={(inventoryItems ?? []) as InventoryItemOption[]}
				/>
			</CatalogFormCard>
		</Container>
	);
}
