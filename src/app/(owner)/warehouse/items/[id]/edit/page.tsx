import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import {
	type FixedAssetItemDefaults,
	FixedAssetItemForm,
} from "@/components/items/fixed-asset-item-form";
import {
	type InventoryItemDefaults,
	InventoryItemForm,
} from "@/components/items/inventory-item-form";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { getItemWithConfig } from "@/lib/inventory/item-loader";
import { createClient } from "@/lib/supabase/server";

export default async function WarehouseEditItemPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const loaded = await getItemWithConfig(supabase, id);
	if (!loaded || loaded.base.deleted_at) notFound();

	const categoryLabel =
		loaded.kind === "inventory" ? "Persediaan" : "Aktiva Tetap";

	return (
		<Container size="xl" className="space-y-5">
			<PageHeader
				title={`Edit: ${loaded.base.name}`}
				backHref="/warehouse"
				backLabel="Warehouse"
				description={
					<span className="flex items-center gap-2">
						<span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
							{categoryLabel}
						</span>
						<span className="tabular font-mono text-xs">
							{loaded.base.sku}
						</span>
					</span>
				}
			/>
			<div className="max-w-3xl rounded-lg bg-surface-2 p-5">
				{loaded.kind === "inventory" ? (
					<InventoryItemForm
						mode="edit"
						id={loaded.base.id}
						defaults={inventoryDefaultsFrom(loaded)}
						returnTo="/warehouse"
					/>
				) : (
					<FixedAssetItemForm
						mode="edit"
						id={loaded.base.id}
						defaults={fixedAssetDefaultsFrom(loaded)}
						returnTo="/warehouse"
					/>
				)}
			</div>
		</Container>
	);
}

function inventoryDefaultsFrom(
	loaded: Extract<
		Awaited<ReturnType<typeof getItemWithConfig>>,
		{ kind: "inventory" }
	>,
): InventoryItemDefaults {
	return {
		sku: loaded.base.sku,
		name: loaded.base.name,
		base_unit: loaded.config.base_unit,
		min_stock_alert: String(loaded.config.min_stock_alert ?? 0),
		selling_price: loaded.config.selling_price
			? String(loaded.config.selling_price)
			: "",
		coa_account_inventory: loaded.config.coa_account_inventory ?? "",
		coa_account_cogs: loaded.config.coa_account_cogs ?? "",
		coa_account_wastage: loaded.config.coa_account_wastage ?? "",
		notes: loaded.base.notes ?? "",
		is_active: loaded.base.is_active,
	};
}

function fixedAssetDefaultsFrom(
	loaded: Extract<
		Awaited<ReturnType<typeof getItemWithConfig>>,
		{ kind: "fixed_asset" }
	>,
): FixedAssetItemDefaults {
	return {
		sku: loaded.base.sku,
		name: loaded.base.name,
		unit: loaded.base.unit,
		asset_number: loaded.config.asset_number ?? "",
		serial_number: loaded.config.serial_number ?? "",
		purchase_price: String(loaded.config.purchase_price ?? 0),
		purchase_date: loaded.config.purchase_date ?? "",
		salvage_value: String(loaded.config.salvage_value ?? 0),
		useful_life_months: loaded.config.useful_life_months
			? String(loaded.config.useful_life_months)
			: "",
		depreciation_method: loaded.config.depreciation_method ?? "straight_line",
		depreciation_start_date: loaded.config.depreciation_start_date ?? "",
		condition: loaded.config.condition ?? "normal",
		current_location: loaded.config.current_location ?? "gudang_pusat",
		coa_account_asset: loaded.config.coa_account_asset ?? "",
		coa_account_accum_depr: loaded.config.coa_account_accum_depr ?? "",
		coa_account_depr_expense: loaded.config.coa_account_depr_expense ?? "",
		image_url: loaded.base.image_url ?? "",
		notes: loaded.base.notes ?? "",
		is_active: loaded.base.is_active,
	};
}
