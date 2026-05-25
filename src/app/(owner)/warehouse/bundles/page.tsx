import { Boxes, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type RawBundle = {
	id: string;
	sku: string;
	name: string;
	notes: string | null;
	is_active: boolean;
	updated_at: string;
	components: Array<{
		qty: number | string;
		item: { sku: string; name: string; unit: string } | null;
		config:
			| { purchase_price_avg: number | string | null }
			| Array<{ purchase_price_avg: number | string | null }>
			| null;
	}>;
};

export default async function BundlesListPage() {
	const supabase = await createClient();

	const { data } = await supabase
		.from("item_bundles")
		.select(
			`id, sku, name, notes, is_active, updated_at,
			 components:bundle_components(
			   qty,
			   item:inventory_items!bundle_components_item_id_fkey(sku, name, unit),
			   config:items_inventory_config!bundle_components_item_id_fkey(purchase_price_avg)
			 )`,
		)
		.is("deleted_at", null)
		.order("name");

	const bundles = ((data ?? []) as unknown as RawBundle[]).map((b) => {
		const comps = (b.components ?? []).map((c) => {
			const cfg = Array.isArray(c.config) ? c.config[0] : c.config;
			const avg = Number(cfg?.purchase_price_avg ?? 0);
			const qty = Number(c.qty);
			return {
				qty,
				item: c.item,
				avg,
				lineCost: avg * qty,
			};
		});
		const totalHpp = comps.reduce((s, c) => s + c.lineCost, 0);
		return {
			id: b.id,
			sku: b.sku,
			name: b.name,
			notes: b.notes,
			is_active: b.is_active,
			updated_at: b.updated_at,
			componentCount: comps.length,
			totalHpp,
			components: comps,
		};
	});

	return (
		<Container size="lg" className="space-y-5">
			<PageHeader
				title="Bundle / Set"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Recipe paket: 1 bundle = N komponen yang dideduct otomatis saat dipakai event. Tidak punya stok sendiri — selalu resolve ke komponen."
				actions={
					<Link
						href="/warehouse/bundles/new"
						className={buttonVariants({ variant: "default", size: "sm" })}
					>
						<Plus className="size-4" />
						Tambah Bundle
					</Link>
				}
			/>

			{bundles.length === 0 ? (
				<EmptyState
					icon={Boxes}
					title="Belum ada bundle"
					description="Tambah bundle pertama, mis. 'Set Kemasan Flashdisk' = 1 FLASHDISK + 1 FD-BOX + 1 POUCH."
				/>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{bundles.map((b) => (
						<div
							key={b.id}
							className="bg-surface-2 rounded-xl border border-foreground/[0.06] p-5"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-base font-semibold">{b.name}</span>
										{!b.is_active && (
											<Badge
												variant="outline"
												className="h-4 px-1 text-[9px]"
											>
												nonaktif
											</Badge>
										)}
									</div>
									<div className="tabular text-muted-foreground mt-0.5 text-[11px]">
										{b.sku} · {b.componentCount} komponen
									</div>
								</div>
								<Link
									href={`/warehouse/bundles/${b.id}/edit`}
									className="text-muted-foreground hover:text-foreground hover:bg-surface-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md"
									title="Edit"
								>
									<Pencil className="size-3.5" />
								</Link>
							</div>

							<ul className="mt-3 space-y-1.5">
								{b.components.map((c, idx) => (
									<li
										key={idx}
										className="flex items-center justify-between gap-2 text-[12px]"
									>
										<span className="min-w-0">
											<span className="tabular text-muted-foreground">
												{c.qty.toLocaleString("id-ID", {
													maximumFractionDigits: 4,
												})}{" "}
												{c.item?.unit ?? ""}
											</span>{" "}
											· {c.item?.name ?? "—"}
										</span>
										<span className="tabular text-muted-foreground/80 text-[11px]">
											{formatRupiah(c.lineCost)}
										</span>
									</li>
								))}
							</ul>

							<div className="mt-3 flex items-center justify-between border-t border-foreground/[0.04] pt-2.5 text-[12px]">
								<span className="text-muted-foreground">
									Estimasi HPP / bundle
								</span>
								<strong className="tabular text-foreground">
									{formatRupiah(b.totalHpp)}
								</strong>
							</div>
						</div>
					))}
				</div>
			)}
		</Container>
	);
}
