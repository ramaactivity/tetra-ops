import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { ArchiveAddonButton } from "@/components/addons/archive-button";
import { Badge } from "@/components/ui/badge";
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
};

export default async function AddonsListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("addons")
		.select("id, name, unit, price, category, requires_extra_crew, is_active")
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
			<div className="flex items-end justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">Add-ons</h2>
					<p className="text-muted-foreground text-sm">
						{addons.length} add-on tersedia
					</p>
				</div>
				<Link
					href="/settings/addons/new"
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
				>
					<Plus className="h-4 w-4" />
					New add-on
				</Link>
			</div>

			<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Unit</TableHead>
							<TableHead className="text-right">Price</TableHead>
							<TableHead className="text-right">Extra Crew</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-[80px] text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{addons.map((addon) => (
							<TableRow key={addon.id}>
								<TableCell className="font-medium">{addon.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{ADDON_CATEGORY_LABELS[addon.category] ?? addon.category}
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
											href={`/settings/addons/${addon.id}/edit`}
											title="Edit"
											className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
										>
											<Pencil className="h-4 w-4" />
										</Link>
										<ArchiveAddonButton id={addon.id} name={addon.name} />
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
