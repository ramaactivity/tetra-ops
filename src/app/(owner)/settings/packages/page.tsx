import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	FRAME_SIZE_LABELS,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type PackageRow = {
	id: string;
	name: string;
	category: string;
	frame_size: string;
	duration_hours: number;
	base_price: number;
	is_active: boolean;
};

export default async function PackagesListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("packages")
		.select(
			"id, name, category, frame_size, duration_hours, base_price, is_active",
		)
		.is("deleted_at", null)
		.order("category", { ascending: true })
		.order("base_price", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat packages: {error.message}
				</p>
			</div>
		);
	}

	const packages = (data ?? []) as PackageRow[];

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">Packages</h2>
					<p className="text-muted-foreground text-sm">
						{packages.length} paket tersedia · seeded dari pricelist Tetra 2026
					</p>
				</div>
				{/* TODO: "+ New package" button — Phase 1 Week 2 */}
			</div>

			<div className="border-border bg-card overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Frame</TableHead>
							<TableHead className="text-right">Duration</TableHead>
							<TableHead className="text-right">Base Price</TableHead>
							<TableHead className="text-right">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{packages.map((pkg) => (
							<TableRow key={pkg.id}>
								<TableCell className="font-medium">{pkg.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{SERVICE_TYPE_LABELS[pkg.category] ?? pkg.category}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{FRAME_SIZE_LABELS[pkg.frame_size] ?? pkg.frame_size}
								</TableCell>
								<TableCell className="tabular text-right">
									{pkg.duration_hours} jam
								</TableCell>
								<TableCell className="tabular text-right font-medium">
									{formatRupiah(pkg.base_price)}
								</TableCell>
								<TableCell className="text-right">
									{pkg.is_active ? (
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
