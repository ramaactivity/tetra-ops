import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	AddonForm,
	type InventoryItemOption,
} from "@/components/addons/addon-form";
import { SectionHeader } from "@/components/layout/section-header";
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
		<div className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/settings/addons"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Add-ons
				</Link>
				<SectionHeader
					as="h2"
					title={`Edit: ${addon.name}`}
					description="Perubahan harga TIDAK menyentuh booking yang sudah ada."
				/>
			</div>
			<div className="border-border-default bg-surface-2 rounded-xl border p-6">
				<AddonForm
					action={action}
					submitLabel="Save changes"
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
			</div>
		</div>
	);
}
