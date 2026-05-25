import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { WastageForm } from "@/components/warehouse/wastage/wastage-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewWastagePage() {
	const supabase = await createClient();

	const [{ data: items }, { data: suppliers }, { data: events }] =
		await Promise.all([
			supabase
				.from("inventory_items")
				.select(
					`id, sku, name, unit,
					 config:items_inventory_config!inner(purchase_price_avg)`,
				)
				.eq("category", "inventory")
				.eq("is_active", true)
				.is("deleted_at", null)
				.order("name"),
			supabase
				.from("suppliers")
				.select("id, name")
				.is("deleted_at", null)
				.eq("is_active", true)
				.order("name"),
			supabase
				.from("events")
				.select("id, project_id, client_name, event_date")
				.gte("event_date", new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10))
				.order("event_date", { ascending: false })
				.limit(50),
		]);

	type RawItem = {
		id: string;
		sku: string;
		name: string;
		unit: string;
		config:
			| { purchase_price_avg: number | string | null }
			| Array<{ purchase_price_avg: number | string | null }>
			| null;
	};

	const itemOptions = ((items ?? []) as RawItem[]).map((i) => {
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
				title="Catat Wastage"
				backHref="/warehouse/wastage"
				backLabel="Wastage Log"
				description="Keluarkan stok karena rusak/testing/defective. Sistem otomatis jurnal Dr Beban Wastage / Cr Persediaan."
			/>
			<div className="max-w-2xl rounded-lg bg-surface-2 p-5">
				<WastageForm
					items={itemOptions}
					suppliers={(suppliers ?? []) as { id: string; name: string }[]}
					events={
						(events ?? []) as {
							id: string;
							project_id: string;
							client_name: string;
							event_date: string;
						}[]
					}
				/>
			</div>
		</Container>
	);
}
