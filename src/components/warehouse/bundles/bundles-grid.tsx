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
	components: Array<{
		qty: number;
		item: { sku: string; name: string; unit: string } | null;
		avg: number;
		lineCost: number;
	}>;
};

/**
 * Bundle list grid — dipakai inline di /warehouse?tab=bundles.
 * Tampil sebagai card 2-kolom dengan komponen sebagai badge tags.
 * Empty state embedded di container yang sama (bukan EmptyState terpisah).
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
						= 1 FLASHDISK + 1 FD-BOX + 1 POUCH.
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
		<div className="grid gap-4 md:grid-cols-2">
			{rows.map((b) => (
				<div
					key={b.id}
					className="bg-surface-2 rounded-xl p-5 ring-1 ring-foreground/[0.04] transition-all duration-200 hover:ring-foreground/15"
				>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
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
							className="text-muted-foreground hover:text-foreground hover:bg-surface-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-all duration-200"
							title="Edit"
						>
							<Pencil className="size-3.5" />
						</Link>
					</div>

					{/* Component badge tags */}
					<div className="mt-3 flex flex-wrap gap-1.5">
						{b.components.map((c, idx) => (
							<span
								key={idx}
								className="bg-surface-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
								title={
									c.item
										? `${c.item.name} · ${formatRupiah(c.lineCost)}`
										: undefined
								}
							>
								<span className="tabular text-muted-foreground">
									{c.qty.toLocaleString("id-ID", {
										maximumFractionDigits: 4,
									})}
									×
								</span>
								<span>{c.item?.sku ?? "—"}</span>
							</span>
						))}
					</div>

					<div className="mt-4 flex items-center justify-between border-t border-foreground/[0.04] pt-3 text-[12px]">
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
	);
}
