import { FileSpreadsheet, Layers, Package, Plus } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type ItemRow,
	ItemsListTable,
} from "@/components/items/items-list-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function ItemsListPage({
	searchParams,
}: {
	searchParams: Promise<{ category?: string }>;
}) {
	const params = await searchParams;
	const category = params.category?.trim() || "";

	const supabase = await createClient();
	let query = supabase
		.from("inventory_items")
		.select(
			"id, sku, name, category, unit, min_stock_alert, purchase_price_avg, condition, current_location, is_active",
		)
		.is("deleted_at", null)
		.order("category", { ascending: true })
		.order("name", { ascending: true });

	if (category === "inventory" || category === "fixed_asset") {
		query = query.eq("category", category);
	}

	const { data, error } = await query;

	if (error) {
		return (
			<div className="rounded-md border border-destructive bg-destructive/10 p-4">
				<p className="text-fluid-body font-medium text-destructive">
					Gagal memuat items: {error.message}
				</p>
			</div>
		);
	}

	const items = (data ?? []) as ItemRow[];
	const consumablesCount = items.filter(
		(i) => i.category === "inventory",
	).length;
	const equipmentCount = items.filter((i) => i.category === "fixed_asset").length;

	return (
		<div className="space-y-4">
			<SectionHeader
				as="h2"
				title="Inventory Items"
				description={`${items.length} item · ${consumablesCount} consumable · ${equipmentCount} equipment`}
				actions={
					<>
						<Link
							href="/settings/items/mapping"
							className={buttonVariants({ variant: "ghost", size: "sm" })}
							title="Map rekap fields to inventory SKUs"
						>
							<Layers className="size-4" />
							<span className="hidden sm:inline">Rekap Mapping</span>
						</Link>
						<Link
							href="/settings/items/import"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<FileSpreadsheet className="size-4" />
							<span className="hidden sm:inline">Bulk import</span>
						</Link>
						<Link
							href="/settings/items/new"
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							<Plus className="size-4" />
							<span className="hidden sm:inline">New item</span>
						</Link>
					</>
				}
			/>

			<div className="flex items-center gap-1">
				<FilterChip href="/settings/items" active={!category} label="Semua" />
				<FilterChip
					href="/settings/items?category=consumable"
					active={category === "inventory"}
					label="Consumable"
				/>
				<FilterChip
					href="/settings/items?category=equipment"
					active={category === "fixed_asset"}
					label="Equipment"
				/>
			</div>

			{items.length === 0 ? (
				<EmptyState
					icon={Package}
					title={
						category ? `Belum ada ${category}` : "Belum ada inventory item"
					}
					description="Klik New item untuk tambah item baru."
					action={
						<Link
							href="/settings/items/new"
							className={buttonVariants({ variant: "default" })}
						>
							<Plus className="size-4" />
							New item
						</Link>
					}
				/>
			) : (
				<ItemsListTable items={items} />
			)}
		</div>
	);
}

function FilterChip({
	href,
	active,
	label,
}: {
	href: string;
	active: boolean;
	label: string;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"inline-flex h-7 items-center rounded-full border px-3 text-fluid-caption font-medium transition-colors duration-fast ease-out-expo",
				active
					? "border-primary bg-primary/10 text-primary"
					: "border-border-default bg-surface-2 text-muted-foreground hover:bg-surface-3",
			)}
		>
			{label}
		</Link>
	);
}
