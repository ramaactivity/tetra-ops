import { CheckCircle2, Layers, Plus, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import {
	type AddonRow,
	AddonsExplorer,
} from "@/components/addons/addons-explorer";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { buttonVariants } from "@/components/ui/button";
import { ADDON_CATEGORY_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type RawAddon = {
	id: string;
	name: string;
	unit: string;
	price: number;
	category: string;
	requires_extra_crew: boolean;
	is_active: boolean;
	inventory_item:
		| { sku: string; name: string }
		| Array<{ sku: string; name: string }>
		| null;
};

export default async function AddonsListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("addons")
		.select(
			"id, name, unit, price, category, requires_extra_crew, is_active, inventory_item:inventory_items(sku, name)",
		)
		.is("deleted_at", null)
		.order("category", { ascending: true })
		.order("price", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat add-ons: {error.message}
				</p>
			</div>
		);
	}

	const addons: AddonRow[] = ((data ?? []) as RawAddon[]).map((a) => {
		const inv = Array.isArray(a.inventory_item)
			? a.inventory_item[0]
			: a.inventory_item;
		return {
			id: a.id,
			name: a.name,
			unit: a.unit,
			price: a.price,
			category: a.category,
			requires_extra_crew: a.requires_extra_crew,
			is_active: a.is_active,
			inventory_sku: inv?.sku ?? null,
			inventory_name: inv?.name ?? null,
		};
	});

	const activeCount = addons.filter((a) => a.is_active).length;
	const categoryCount = new Set(addons.map((a) => a.category)).size;
	const crewCount = addons.filter((a) => a.requires_extra_crew).length;

	const stats: StatItem[] = [
		{
			label: "Total Add-on",
			value: String(addons.length),
			hint: "di katalog",
			icon: Sparkles,
		},
		{
			label: "Aktif",
			value: String(activeCount),
			hint: `${addons.length - activeCount} arsip`,
			icon: CheckCircle2,
			accent: "emerald",
		},
		{
			label: "Kategori",
			value: String(categoryCount),
			hint: `dari ${Object.keys(ADDON_CATEGORY_LABELS).length} jenis`,
			icon: Layers,
		},
		{
			label: "Butuh Crew",
			value: String(crewCount),
			hint: "perlu personel tambahan",
			icon: Users,
			accent: "amber",
		},
	];

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Pricelist"
				title="Add-on"
				description={`${addons.length} add-on tersedia untuk booking`}
				actions={
					<Link
						href="/operations/addons/new"
						className={buttonVariants({ variant: "default" })}
					>
						<Plus className="size-4" />
						Tambah Add-on
					</Link>
				}
			/>

			<StatRow stats={stats} />

			<AddonsExplorer addons={addons} />
		</Container>
	);
}
