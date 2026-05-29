import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { ArchiveAddonButton } from "@/components/addons/archive-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ADDON_CATEGORY_LABELS, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type AddonRow = {
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

	const addons = (data ?? []) as AddonRow[];

	return (
		<div className="space-y-4">
			<SectionHeader
				as="h2"
				title="Add-on"
				description={`${addons.length} add-on tersedia`}
				actions={
					<Link
						href="/operations/addons/new"
						className={buttonVariants({ variant: "default" })}
					>
						<Plus className="size-4" />
						New add-on
					</Link>
				}
			/>

			<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Inventory</TableHead>
							<TableHead>Unit</TableHead>
							<TableHead className="text-right">Price</TableHead>
							<TableHead className="text-right">Extra Crew</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-[80px] text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{addons.map((addon) => {
							const invItem = Array.isArray(addon.inventory_item)
								? addon.inventory_item[0]
								: addon.inventory_item;
							return (
							<TableRow key={addon.id}>
								<TableCell className="font-medium">{addon.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{ADDON_CATEGORY_LABELS[addon.category] ?? addon.category}
								</TableCell>
								<TableCell>
									{invItem ? (
										<Badge
											variant="outline"
											className="tabular max-w-[180px] truncate text-[10px]"
											title={`${invItem.sku} · ${invItem.name}`}
										>
											{invItem.sku}
										</Badge>
									) : (
										<span className="text-muted-foreground text-xs">—</span>
									)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{addon.unit}
								</TableCell>
								<TableCell className="tabular text-right font-medium">
									{formatRupiah(addon.price)}
								</TableCell>
								<TableCell className="text-right">
									{addon.requires_extra_crew ? (
										<Badge variant="outline">Yes</Badge>
									) : (
										<span className="text-muted-foreground text-sm">—</span>
									)}
								</TableCell>
								<TableCell>
									{addon.is_active ? (
										<Badge variant="default">Active</Badge>
									) : (
										<Badge variant="secondary">Inactive</Badge>
									)}
								</TableCell>
								<TableCell>
									<div className="flex items-center justify-end gap-1">
										<Link
											href={`/operations/addons/${addon.id}/edit`}
											title="Edit"
											className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
										>
											<Pencil className="h-4 w-4" />
										</Link>
										<ArchiveAddonButton id={addon.id} name={addon.name} />
									</div>
								</TableCell>
							</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
