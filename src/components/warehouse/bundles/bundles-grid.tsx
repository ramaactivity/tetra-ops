import { Boxes, Pencil } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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

const qty = (n: number) =>
	n.toLocaleString("id-ID", { maximumFractionDigits: 4 });

/**
 * Bundle list — speaks the same visual language as the other warehouse tables
 * (ResponsiveTable): card on bg-card with rounded-2xl, `.eyebrow` column labels,
 * hairline row dividers, pill Badge for status, tabular numbers.
 *
 * Each bundle is a master row (name · komponen · siap pakai · HPP) with an
 * inline tabular component breakdown beneath it.
 */
export function BundlesGrid({ rows }: { rows: BundleRow[] }) {
	if (rows.length === 0) {
		return (
			<EmptyState
				icon={Boxes}
				title="Belum ada bundle"
				description="Bundle = recipe paket yang otomatis ter-deduct ke komponennya saat dipakai event. Contoh: Set Kemasan Flashdisk = 1 Flashdisk + 1 Box Custom + 1 Pouch."
				action={
					<Link
						href="/warehouse/bundles/new"
						className={buttonVariants({ variant: "default", size: "sm" })}
					>
						Tambah Bundle Pertama
					</Link>
				}
			/>
		);
	}

	return (
		<div className="space-y-3">
			{rows.map((b) => (
				<BundleCard key={b.id} bundle={b} />
			))}
		</div>
	);
}

const PARENT_GRID =
	"grid items-center gap-3 grid-cols-[minmax(0,1fr)_88px_132px_minmax(150px,190px)_40px]";
const INNER_GRID =
	"grid items-center gap-3 grid-cols-[minmax(0,1fr)_84px_120px_132px_132px]";

function BundleCard({ bundle: b }: { bundle: BundleRow }) {
	const bottleneck = b.components.reduce(
		(min, c) => (min === null || c.buildable < min.buildable ? c : min),
		null as BundleRow["components"][number] | null,
	);
	// Same outline+tint badge family the forecast/consumables tables use.
	const buildableTone =
		b.maxBuildable === 0
			? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
			: b.maxBuildable < 5
				? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
				: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

	return (
		<div className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-1)]">
			{/* Master row */}
			<div className={`${PARENT_GRID} px-4 py-3`}>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span
							className="truncate font-medium text-foreground"
							title={b.name}
						>
							{b.name}
						</span>
						{!b.is_active && (
							<Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
								Nonaktif
							</Badge>
						)}
					</div>
					<div className="mt-0.5 truncate tabular text-[11px] text-muted-foreground">
						{b.sku}
					</div>
				</div>

				<div className="space-y-0.5">
					<div className="eyebrow text-muted-foreground">Komponen</div>
					<div className="tabular text-[13px] text-foreground">
						{b.componentCount} item
					</div>
				</div>

				<div className="space-y-0.5">
					<div className="eyebrow text-muted-foreground">Siap pakai</div>
					<Badge
						variant="outline"
						className={`h-5 px-1.5 text-[11px] tabular ${buildableTone}`}
						title={
							b.maxBuildable === 0 && bottleneck?.item
								? `Bottleneck: ${bottleneck.item.name} stok ${bottleneck.componentStock}, butuh ${bottleneck.qty}`
								: undefined
						}
					>
						{b.maxBuildable}
						<span className="ml-1 font-normal opacity-80">paket</span>
					</Badge>
				</div>

				<div className="space-y-0.5 text-right">
					<div className="eyebrow text-muted-foreground">HPP / bundle</div>
					<div className="whitespace-nowrap tabular text-[13px] font-medium text-foreground">
						{formatRupiah(b.totalHpp)}
					</div>
				</div>

				<div className="flex items-center justify-end">
					<Link
						href={`/warehouse/bundles/${b.id}/edit`}
						title={`Edit ${b.name}`}
						aria-label={`Edit ${b.name}`}
						className="press-down inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<Pencil className="size-4" aria-hidden />
					</Link>
				</div>
			</div>

			{/* Component breakdown */}
			{b.componentCount > 0 && (
				<div className="border-t border-border-subtle bg-secondary/30">
					<div
						className={`${INNER_GRID} eyebrow px-4 py-2 text-muted-foreground`}
					>
						<span>Komponen</span>
						<span className="text-right">Butuh</span>
						<span className="text-right">Stok</span>
						<span className="text-right">Avg / unit</span>
						<span className="text-right">Subtotal</span>
					</div>

					{b.components.map((c, idx) => {
						const short = c.componentStock < c.qty;
						return (
							<div
								key={c.item?.sku ?? `comp-${idx}`}
								className={`${INNER_GRID} border-t border-border-subtle px-4 py-2.5 ${
									b.maxBuildable === 0 && c.buildable === b.maxBuildable
										? "bg-rose-500/[0.04]"
										: ""
								}`}
							>
								<div className="min-w-0">
									<span
										className="block truncate text-[13px] text-foreground"
										title={c.item?.name ?? "—"}
									>
										{c.item?.name ?? "—"}
									</span>
								</div>
								<div className="whitespace-nowrap text-right tabular text-[13px] text-foreground">
									{qty(c.qty)}
									<span className="ml-1 text-[11px] text-muted-foreground">
										{c.item?.unit}
									</span>
								</div>
								<div
									className={`whitespace-nowrap text-right tabular text-[13px] ${
										short
											? "text-rose-600 dark:text-rose-400"
											: "text-foreground"
									}`}
								>
									{qty(c.componentStock)}
									<span className="ml-1 text-[11px] text-muted-foreground">
										{c.item?.unit}
									</span>
								</div>
								<div className="whitespace-nowrap text-right tabular text-[13px] text-muted-foreground">
									{formatRupiah(c.avg)}
								</div>
								<div className="whitespace-nowrap text-right tabular text-[13px] font-medium text-foreground">
									{formatRupiah(c.lineCost)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
