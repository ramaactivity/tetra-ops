import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { BundleForm } from "@/components/warehouse/bundles/bundle-form";
import type { BundleComponentItem } from "@/components/warehouse/bundles/bundle-component-picker";
import { createClient } from "@/lib/supabase/server";

export default async function NewBundlePage() {
	const supabase = await createClient();

	// Hanya item Persediaan yg flagged is_bom_component muncul di picker
	const { data } = await supabase
		.from("inventory_items")
		.select(
			`id, sku, name, unit,
			 config:items_inventory_config!inner(purchase_price_avg, is_bom_component)`,
		)
		.eq("category", "inventory")
		.eq("is_active", true)
		.is("deleted_at", null)
		.eq("config.is_bom_component", true)
		.order("name");

	type Raw = {
		id: string;
		sku: string;
		name: string;
		unit: string;
		config:
			| { purchase_price_avg: number | string | null }
			| Array<{ purchase_price_avg: number | string | null }>
			| null;
	};

	const items: BundleComponentItem[] = ((data ?? []) as Raw[]).map((i) => {
		const cfg = Array.isArray(i.config) ? i.config[0] : i.config;
		return {
			id: i.id,
			sku: i.sku,
			name: i.name,
			unit: i.unit,
			purchase_price_avg: Number(cfg?.purchase_price_avg ?? 0),
		};
	});

	return (
		<Container size="lg" className="space-y-5">
			<PageHeader
				title="Tambah Bundle"
				backHref="/warehouse/bundles"
				backLabel="Bundle / Set"
				description="Tentukan recipe paket: nama + komponen + qty. SKU otomatis dengan prefix BUNDLE-."
			/>
			<div className="rounded-xl bg-surface-2 p-6 sm:p-8 lg:p-10">
				<BundleForm mode="create" items={items} />
			</div>
		</Container>
	);
}
