import { Boxes, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";

export type BundleRow = {
	id: string;
	sku: string;
	name: string;
	is_active: boolean;
	componentCount: number;
	totalHpp: number;
	maxBuildable: number; // min(stock_per_component / qty_per_recipe)
	components: Array<{
		qty: number;
		item: { sku: string; name: string; unit: string } | null;
		avg: number;
		lineCost: number;
		componentStock: number;
		buildable: number; // floor(componentStock / qty)
	}>;
};

/**
 * Bundle list — columnar layout sama spirit dengan Market List ItemCard.
 * Parent row: Nama bundle · Komponen count · Potensi siap pakai · HPP/bundle · edit
 * Expanded: tabular component breakdown dengan stock + bottleneck flag.
 *
 * Empty state inline di container yang sama.
 */
export function BundlesGrid({ rows }: { rows: BundleRow[] }) {
	if (rows.length === 0) {
		return (
			<div className="bg-surface-2 flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-16 text-center">
				<div className="bg-surface-3 inline-flex size-12 items-center justify-center rounded-full">
					<Boxes className="text-muted-foreground size-5" />
				</div>
				<div className="space-y-1">
					<h3 className="text-sm font-semibold">Belum ada bundle</h3>
					<p className="text-muted-foreground max-w-md text-[12px]">
						Bundle = recipe paket yang otomatis ter-deduct ke komponennya
						saat dipakai event. Contoh:{" "}
						<strong className="text-foreground">
							Set Kemasan Flashdisk
						</strong>{" "}
						= 1 Flashdisk + 1 Box Custom Flashdisk + 1 Pouch.
					</p>
				</div>
				<Link
					href="/warehouse/bundles/new"
					className={buttonVariants({ variant: "default", size: "sm" })}
				>
					<Plus className="size-4" />
					Tambah Bundle Pertama
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			{rows.map((b) => (
				<BundleCard key={b.id} bundle={b} />
			))}
		</div>
	);
}

const PARENT_GRID =
	"grid items-center gap-3 grid-cols-[minmax(0,1fr)_96px_140px_minmax(160px,200px)_40px]";
const INNER_GRID =
	"grid items-center gap-3 grid-cols-[minmax(0,1fr)_72px_120px_140px_140px]";

function BundleCard({ bundle: b }: { bundle: BundleRow }) {
	const bottleneck =
		b.components.reduce(
			(min, c) =>
				min === null || c.buildable < min.buildable ? c : min,
			null as BundleRow["components"][number] | null,
		);
	const buildableTone =
		b.maxBuildable === 0
			? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
			: b.maxBuildable < 5
				? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
				: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

	return (
		<div className="overflow-hidden rounded-lg border border-border-default bg-surface-2 transition-colors hover:bg-surface-2/70">
			{/* Parent row */}
			<div className={`${PARENT_GRID} px-3 py-2.5`}>
				{/* Nama bundle */}
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span
							className="truncate text-[13px] font-semibold text-foreground"
							title={b.name}
						>
							{b.name}
						</span>
						{!b.is_active && (
							<Badge variant="outline" className="h-4 px-1 text-[9px]">
								nonaktif
							</Badge>
						)}
					</div>
					<div className="mt-0.5 truncate text-[10px] tabular text-muted-foreground/70">
						{b.sku}
					</div>
				</div>

				{/* Komponen count */}
				<div>
					<div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
						Komponen
					</div>
					<div className="tabular text-[12px] font-medium text-foreground">
						{b.componentCount} item
					</div>
				</div>

				{/* Potensi Siap Pakai */}
				<div>
					<div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
						Potensi Siap Pakai
					</div>
					<span
						className={`mt-0.5 inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-semibold tabular ${buildableTone}`}
						title={
							b.maxBuildable === 0 && bottleneck?.item
								? `Bottleneck: ${bottleneck.item.name} stok ${bottleneck.componentStock}, butuh ${bottleneck.qty}`
								: undefined
						}
					>
						{b.maxBuildable}
						<span className="ml-1 font-normal opacity-80">paket</span>
					</span>
				</div>

				{/* HPP per bundle */}
				<div className="text-right">
					<div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
						HPP / bundle
					</div>
					<div className="whitespace-nowrap tabular text-[13px] font-semibold text-foreground">
						{formatRupiah(b.totalHpp)}
					</div>
				</div>

				{/* Edit action */}
				<div className="flex items-center justify-end">
					<Link
						href={`/warehouse/bundles/${b.id}/edit`}
						title="Edit bundle"
						aria-label={`Edit ${b.name}`}
						className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
					>
						<Pencil className="size-4" />
					</Link>
				</div>
			</div>

			{/* Expanded — component breakdown */}
			{b.componentCount > 0 && (
				<div className="border-t border-border-default/50 bg-surface-1/40">
					{/* Inner header */}
					<div
						className={`${INNER_GRID} px-3 py-2 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60`}
					>
						<span>Komponen</span>
						<span className="text-right">Butuh</span>
						<span className="text-right">Stok</span>
						<span className="text-right">Avg / unit</span>
						<span className="text-right">Subtotal</span>
					</div>

					<div className="space-y-1 px-1.5 pb-2">
						{b.components.map((c, idx) => {
							const isBottleneck = c.buildable === b.maxBuildable;
							return (
								<div
									key={idx}
									className={`${INNER_GRID} rounded-md px-1.5 py-2.5 transition-colors ${
										b.maxBuildable === 0 && isBottleneck
											? "bg-rose-500/5 ring-1 ring-rose-500/20"
											: "hover:bg-surface-3/50"
									}`}
								>
									<div className="min-w-0">
										<span
											className="block truncate text-[12px] font-medium text-foreground"
											title={c.item?.name ?? "—"}
										>
											{c.item?.name ?? "—"}
										</span>
									</div>
									<div className="whitespace-nowrap text-right tabular text-[12px] font-medium text-foreground">
										{c.qty.toLocaleString("id-ID", {
											maximumFractionDigits: 4,
										})}
										<span className="ml-1 text-[10px] font-normal text-muted-foreground/70">
											{c.item?.unit}
										</span>
									</div>
									<div
										className={`whitespace-nowrap text-right tabular text-[12px] font-medium ${
											c.componentStock < c.qty
												? "text-rose-600 dark:text-rose-400"
												: "text-foreground"
										}`}
									>
										{c.componentStock.toLocaleString("id-ID", {
											maximumFractionDigits: 4,
										})}
										<span className="ml-1 text-[10px] font-normal text-muted-foreground/70">
											{c.item?.unit}
										</span>
									</div>
									<div className="whitespace-nowrap text-right tabular text-[12px] text-muted-foreground">
										{formatRupiah(c.avg)}
									</div>
									<div className="whitespace-nowrap text-right tabular text-[12px] font-semibold text-foreground">
										{formatRupiah(c.lineCost)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
