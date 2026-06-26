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
	const [{ data: addon, error }, { data: inventoryItems }, { data: comps }] =
		await Promise.all([
			supabase
				.from("addons")
				.select(
					"id, name, category, unit, price, requires_extra_crew, is_active",
				)
				.eq("id", id)
				.is("deleted_at", null)
				.maybeSingle(),
			supabase
				.from("inventory_items")
				.select("id, sku, name, unit, purchase_price_avg")
				.eq("category", "inventory")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("sku", { ascending: true }),
			supabase
				.from("addon_components")
				.select("inventory_item_id, qty_per_unit, sort_order")
				.eq("addon_id", id)
				.order("sort_order", { ascending: true }),
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
					defaultComponents={(comps ?? []).map(
						(c: { inventory_item_id: string; qty_per_unit: number }) => ({
							item_id: c.inventory_item_id,
							qty: Number(c.qty_per_unit),
						}),
					)}
					defaults={{
						name: addon.name,
						category: addon.category as never,
						unit: addon.unit,
						price: addon.price,
						requires_extra_crew: addon.requires_extra_crew,
						is_active: addon.is_active,
					}}
				/>
			</CatalogFormCard>
		</Container>
	);
}
