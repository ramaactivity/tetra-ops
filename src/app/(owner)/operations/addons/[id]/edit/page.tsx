import { notFound } from "next/navigation";
import {
	AddonForm,
	type InventoryItemOption,
} from "@/components/addons/addon-form";
import {
	CatalogFormCard,
	CatalogFormHeader,
} from "@/components/catalog/form-kit";
import { Container } from "@/components/layout/container";
import { updateAddon } from "@/lib/actions/addons";
import { createClient } from "@/lib/supabase/server";

export default async function EditAddonPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const [{ data: addon, error }, { data: inventoryItems }] = await Promise.all([
		supabase
			.from("addons")
			.select(
				"id, name, category, unit, price, requires_extra_crew, is_active, inventory_item_id",
			)
			.eq("id", id)
			.is("deleted_at", null)
			.maybeSingle(),
		supabase
			.from("inventory_items")
			.select("id, sku, name, unit")
			.eq("category", "inventory")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("sku", { ascending: true }),
	]);

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat add-on: {error.message}
				</p>
			</div>
		);
	}

	if (!addon) notFound();

	const action = updateAddon.bind(null, addon.id);

	return (
		<Container size="lg" className="space-y-3">
			<CatalogFormHeader
				backHref="/operations/addons"
				backLabel="Add-on"
				eyebrow="Edit add-on"
				title={addon.name}
				description="Perubahan harga TIDAK menyentuh booking yang sudah ada."
			/>
			<CatalogFormCard>
				<AddonForm
					action={action}
					submitLabel="Simpan Perubahan"
					inventoryItems={(inventoryItems ?? []) as InventoryItemOption[]}
					defaults={{
						name: addon.name,
						category: addon.category as never,
						unit: addon.unit,
						price: addon.price,
						requires_extra_crew: addon.requires_extra_crew,
						is_active: addon.is_active,
						inventory_item_id: addon.inventory_item_id ?? "",
					}}
				/>
			</CatalogFormCard>
		</Container>
	);
}
