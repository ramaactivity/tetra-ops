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
						{addons.length} add-on tersedia · seeded dari pricelist Tetra 2026
					</p>
				</div>
			</div>

			<div className="border-border bg-card overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Unit</TableHead>
							<TableHead className="text-right">Price</TableHead>
							<TableHead className="text-right">Extra Crew</TableHead>
							<TableHead className="text-right">Status</TableHead>
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
								<TableCell className="text-right">
									{addon.is_active ? (
										<Badge variant="default">Active</Badge>
									) : (
										<Badge variant="secondary">Inactive</Badge>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
