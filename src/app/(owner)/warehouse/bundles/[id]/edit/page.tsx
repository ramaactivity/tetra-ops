import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import type { BundleComponentItem } from "@/components/warehouse/bundles/bundle-component-picker";
import {
	type BundleDefaults,
	BundleForm,
} from "@/components/warehouse/bundles/bundle-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditBundlePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const [{ data: bundle }, { data: items }] = await Promise.all([
		supabase
			.from("item_bundles")
			.select(
				`id, sku, name, notes, is_active,
				 components:bundle_components(item_id, qty, notes, line_order)`,
			)
			.eq("id", id)
			.is("deleted_at", null)
			.maybeSingle(),
		supabase
			.from("inventory_items")
			.select(
				`id, sku, name, unit, purchase_price_avg,
				 config:items_inventory_config!inner(is_bom_component)`,
			)
			.eq("category", "inventory")
			.eq("is_active", true)
			.is("deleted_at", null)
			.eq("config.is_bom_component", true)
			.order("name"),
	]);

	if (!bundle) notFound();

	type RawComp = {
		item_id: string;
		qty: number | string;
		notes: string | null;
		line_order: number;
	};
	type RawItem = {
		id: string;
		sku: string;
		name: string;
		unit: string;
		purchase_price_avg: number | string | null;
	};

	const components = ((bundle.components ?? []) as RawComp[])
		.sort((a, b) => a.line_order - b.line_order)
		.map((c) => ({
			item_id: c.item_id,
			qty: Number(c.qty),
			notes: c.notes,
		}));

	const itemOptions: BundleComponentItem[] = ((items ?? []) as RawItem[]).map(
		(i) => ({
			id: i.id,
			sku: i.sku,
			name: i.name,
			unit: i.unit,
			purchase_price_avg: Number(i.purchase_price_avg ?? 0),
		}),
	);

	// Pastikan komponen yang sudah dipilih ada di options (kalau is_bom_component
	// dimatikan setelah bundle dibuat, item tetap tampil supaya bisa di-keep / hapus)
	const optionIds = new Set(itemOptions.map((i) => i.id));
	const missingIds = components
		.map((c) => c.item_id)
		.filter((id) => !optionIds.has(id));
	if (missingIds.length > 0) {
		const { data: extra } = await supabase
			.from("inventory_items")
			.select("id, sku, name, unit, purchase_price_avg")
			.in("id", missingIds);
		for (const i of (extra ?? []) as RawItem[]) {
			itemOptions.push({
				id: i.id,
				sku: i.sku,
				name: `${i.name} ⚠ (flag BOM dimatikan)`,
				unit: i.unit,
				purchase_price_avg: Number(i.purchase_price_avg ?? 0),
			});
		}
	}

	const defaults: BundleDefaults = {
		name: bundle.name,
		sku: bundle.sku,
		notes: bundle.notes ?? "",
		is_active: bundle.is_active,
		components,
	};

	return (
		<Container size="lg" className="space-y-5">
			<PageHeader
				title={`Edit: ${bundle.name}`}
				backHref="/warehouse/bundles"
				backLabel="Bundle / Set"
				description={
					<span className="tabular font-mono text-xs">{bundle.sku}</span>
				}
			/>
			<div className="rounded-xl bg-surface-2 p-6 sm:p-8 lg:p-10">
				<BundleForm
					mode="edit"
					id={bundle.id}
					defaults={defaults}
					items={itemOptions}
				/>
			</div>
		</Container>
	);
}
