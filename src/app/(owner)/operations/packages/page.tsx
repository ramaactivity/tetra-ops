import { Layers, Package, PackageCheck, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type PackageRow,
	PackagesExplorer,
} from "@/components/packages/packages-explorer";
import { buttonVariants } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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

	const activeCount = packages.filter((p) => p.is_active).length;
	const categoryCount = new Set(packages.map((p) => p.category)).size;
	const minPrice = packages.length
		? Math.min(...packages.map((p) => p.base_price))
		: 0;

	const stats: StatItem[] = [
		{
			label: "Total Paket",
			value: String(packages.length),
			hint: "di pricelist",
			icon: Package,
		},
		{
			label: "Aktif",
			value: String(activeCount),
			hint: `${packages.length - activeCount} arsip`,
			icon: PackageCheck,
			accent: "emerald",
		},
		{
			label: "Kategori",
			value: String(categoryCount),
			hint: "jenis layanan",
			icon: Layers,
		},
		{
			label: "Mulai Dari",
			value: formatRupiah(minPrice),
			hint: "harga terendah",
			icon: Tag,
		},
	];

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Pricelist"
				title="Paket"
				description={`${packages.length} paket tersedia untuk booking`}
				actions={
					<Link
						href="/operations/packages/new"
						className={buttonVariants({ variant: "default" })}
					>
						<Plus className="size-4" />
						Tambah Paket
					</Link>
				}
			/>

			<StatRow stats={stats} />

			<PackagesExplorer packages={packages} />
		</Container>
	);
}
