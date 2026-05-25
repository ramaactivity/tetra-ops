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
import {
	listUnitsByKind,
	normalizeConversion,
} from "@/lib/inventory/unit-conversion";
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
		loaded.kind === "inventory" ? "Persediaan" : "Aset Tetap";

	// Fetch suppliers only when inventory (fixed-asset form doesn't use it)
	let suppliers: Array<{ id: string; name: string }> = [];
	if (loaded.kind === "inventory") {
		const { data } = await supabase
			.from("suppliers")
			.select("id, name")
			.is("deleted_at", null)
			.eq("is_active", true)
			.order("name");
		suppliers = (data ?? []) as { id: string; name: string }[];
	}

	return (
		<Container size="lg" className="space-y-6">
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
			<div className="rounded-xl bg-surface-2 p-6 sm:p-8 lg:p-10">
				{loaded.kind === "inventory" ? (
					<InventoryItemForm
						mode="edit"
						id={loaded.base.id}
						defaults={inventoryDefaultsFrom(loaded)}
						returnTo="/warehouse"
						suppliers={suppliers}
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
	// Derive purchase_unit + conversion_factor from existing unit_conversion JSONB
	const map = normalizeConversion(
		loaded.config.unit_conversion,
		loaded.config.base_unit,
	);
	const purchaseUnits = listUnitsByKind(map, "purchase");
	const firstPurchase = purchaseUnits[0];
	const conversionFactor =
		firstPurchase?.def.multiplier != null
			? String(firstPurchase.def.multiplier)
			: "";

	return {
		name: loaded.base.name,
		sku: loaded.base.sku,
		base_unit: loaded.config.base_unit,
		purchase_unit: firstPurchase?.code ?? "",
		conversion_factor: conversionFactor,
		min_stock_alert: String(loaded.config.min_stock_alert ?? 0),
		preferred_supplier_id:
			(loaded.config as { preferred_supplier_id?: string | null })
				.preferred_supplier_id ?? "",
		is_bom_component:
			(loaded.config as { is_bom_component?: boolean }).is_bom_component ??
			false,
		notes: loaded.base.notes ?? "",
		is_active: loaded.base.is_active,
		purchase_price_avg: loaded.config.purchase_price_avg ?? 0,
	};
}

function fixedAssetDefaultsFrom(
	loaded: Extract<
		Awaited<ReturnType<typeof getItemWithConfig>>,
		{ kind: "fixed_asset" }
	>,
): FixedAssetItemDefaults {
	return {
		name: loaded.base.name,
		sku: loaded.base.sku,
		unit: loaded.base.unit,
		asset_number: loaded.config.asset_number ?? "",
		serial_number: loaded.config.serial_number ?? "",
		acquisition_type:
			((loaded.config as { acquisition_type?: string }).acquisition_type as
				| "new_commercial"
				| "used_commercial"
				| "owner_contribution") ?? "new_commercial",
		purchase_price: String(loaded.config.purchase_price ?? 0),
		purchase_date: loaded.config.purchase_date ?? "",
		salvage_value: String(loaded.config.salvage_value ?? 0),
		useful_life_months: loaded.config.useful_life_months
			? String(loaded.config.useful_life_months)
			: "",
		depreciation_start_date: loaded.config.depreciation_start_date ?? "",
		condition: loaded.config.condition ?? "normal",
		current_location: loaded.config.current_location ?? "gudang_pusat",
		image_url: loaded.base.image_url ?? "",
		notes: loaded.base.notes ?? "",
		is_active: loaded.base.is_active,
	};
}
