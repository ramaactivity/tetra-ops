import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function WarehouseEditItemPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: item } = await supabase
		.from("inventory_items")
		.select(
			"id, sku, name, category, unit, min_stock_alert, purchase_price_avg, purchase_price, purchase_date, useful_life_months, condition, current_location, notes, is_active",
		)
		.eq("id", id)
		.is("deleted_at", null)
		.maybeSingle();

	if (!item) notFound();

	const defaults = {
		sku: item.sku,
		name: item.name,
		category: item.category as "consumable" | "equipment",
		unit: item.unit,
		min_stock_alert: String(item.min_stock_alert ?? 0),
		purchase_price_avg: String(item.purchase_price_avg ?? 0),
		purchase_price: item.purchase_price ? String(item.purchase_price) : "",
		purchase_date: item.purchase_date ?? "",
		useful_life_months: item.useful_life_months
			? String(item.useful_life_months)
			: "",
		condition: item.condition ?? "",
		current_location: item.current_location ?? "",
		notes: item.notes ?? "",
		is_active: !!item.is_active,
	};

	return (
		<Container size="xl" className="space-y-5">
			<PageHeader
				title={`Edit: ${item.name}`}
				backHref="/warehouse"
				backLabel="Warehouse"
				description={<span className="tabular font-mono">{item.sku}</span>}
			/>
			<div className="max-w-3xl rounded-lg border border-border-default bg-surface-2 p-5">
				<ItemForm
					mode="edit"
					id={item.id}
					defaults={defaults}
					returnTo="/warehouse"
				/>
			</div>
		</Container>
	);
}
