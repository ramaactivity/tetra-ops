import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { ArchivePackageButton } from "@/components/packages/archive-button";
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
			<SectionHeader
				as="h2"
				title="Packages"
				description={`${packages.length} paket tersedia`}
				actions={
					<Link
						href="/settings/packages/new"
						className={buttonVariants({ variant: "default" })}
					>
						<Plus className="size-4" />
						New package
					</Link>
				}
			/>

			<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Frame</TableHead>
							<TableHead className="text-right">Duration</TableHead>
							<TableHead className="text-right">Base Price</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="w-[80px] text-right">Actions</TableHead>
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
								<TableCell>
									{pkg.is_active ? (
										<Badge variant="default">Active</Badge>
									) : (
										<Badge variant="secondary">Inactive</Badge>
									)}
								</TableCell>
								<TableCell>
									<div className="flex items-center justify-end gap-1">
										<Link
											href={`/settings/packages/${pkg.id}/edit`}
											title="Edit"
											className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
										>
											<Pencil className="h-4 w-4" />
										</Link>
										<ArchivePackageButton id={pkg.id} name={pkg.name} />
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
