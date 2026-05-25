import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/section-header";
import { ItemForm } from "@/components/items/item-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditItemPage({
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
		category: item.category as "inventory" | "fixed_asset",
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
		<div className="space-y-4">
			<Link
				href="/settings/items"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Items
			</Link>
			<SectionHeader
				as="h2"
				title={`Edit: ${item.name}`}
				description={<span className="tabular">{item.sku}</span>}
			/>
			<div className="border-border-default bg-surface-2 max-w-3xl rounded-xl border p-5">
				<ItemForm mode="edit" id={item.id} defaults={defaults} />
			</div>
		</div>
	);
}
