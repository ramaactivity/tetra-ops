import {
	CheckCircle2,
	Image as ImageIcon,
	Layers,
	Plus,
	Tag,
} from "lucide-react";
import Link from "next/link";
import {
	type BackdropRow,
	BackdropsExplorer,
} from "@/components/backdrops/backdrops-explorer";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function BackdropsListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("backdrops")
		.select(
			"id, code, name, type, rental_price, is_active, display_order, description",
		)
		.order("display_order", { ascending: true })
		.order("name", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat backdrops: {error.message}
				</p>
			</div>
		);
	}

	const rows = (data ?? []) as BackdropRow[];
	const activeCount = rows.filter((r) => r.is_active).length;
	const basicCount = rows.filter((r) => r.type === "basic_included").length;
	const rentalCount = rows.filter((r) => r.type === "rental_owned").length;

	const stats: StatItem[] = [
		{
			label: "Total Backdrop",
			value: String(rows.length),
			hint: "di katalog",
			icon: ImageIcon,
		},
		{
			label: "Aktif",
			value: String(activeCount),
			hint: `${rows.length - activeCount} nonaktif`,
			icon: CheckCircle2,
			accent: "emerald",
		},
		{
			label: "Basic",
			value: String(basicCount),
			hint: "gratis di booking",
			icon: Layers,
		},
		{
			label: "Rental",
			value: String(rentalCount),
			hint: "auto-add ke addons",
			icon: Tag,
			accent: "info",
		},
	];

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				as="h1"
				eyebrow="Katalog"
				title="Backdrop"
				description={`${rows.length} backdrop di katalog booking`}
				actions={
					<Link
						href="/operations/backdrops/new"
						className={buttonVariants({ variant: "default" })}
					>
						<Plus className="size-4" />
						Tambah Backdrop
					</Link>
				}
			/>

			<StatRow stats={stats} />

			<BackdropsExplorer backdrops={rows} />

			<p className="text-muted-foreground text-xs">
				<span className="font-medium">Basic</span> ikut gratis di booking ·{" "}
				<span className="font-medium">Rental</span> auto-add ke addons_total ·{" "}
				<span className="font-medium">Vendor Decor</span> minta owner isi field
				markup di booking form.
			</p>
		</Container>
	);
}
