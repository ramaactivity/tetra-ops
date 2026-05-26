import { Boxes, CheckCircle2, Gift, Info, PackageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
	RekapContextAddon,
	RekapContextBonus,
	RekapContextBundle,
} from "@/lib/actions/rekap";

type Props = {
	includeFlashdiskPouch: boolean | null;
	paidAddons: RekapContextAddon[];
	bonuses: RekapContextBonus[];
	bundle?: RekapContextBundle | null;
};

/**
 * <RekapContextCard /> — info block read-only above the rekap form.
 * Surfaces paket spec, bonus items (so crew remembers to actually give
 * them), and paid add-ons (so crew knows expected qty to count).
 */
export function RekapContextCard({
	includeFlashdiskPouch,
	paidAddons,
	bonuses,
	bundle,
}: Props) {
	const hasAnything =
		includeFlashdiskPouch !== null ||
		paidAddons.length > 0 ||
		bonuses.length > 0 ||
		(bundle?.components.length ?? 0) > 0;
	if (!hasAnything) return null;

	return (
		<section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4 dark:border-sky-900 dark:bg-sky-950/20">
			<div className="flex items-center gap-2">
				<Info className="h-4 w-4 text-sky-700 dark:text-sky-300" />
				<h3 className="text-sm font-semibold tracking-tight text-sky-900 dark:text-sky-100">
					Konteks Event
				</h3>
			</div>

			{/* Flashdisk + Pouch indicator */}
			{includeFlashdiskPouch !== null && (
				<div className="flex items-center gap-2 text-fluid-caption">
					<PackageIcon className="h-3.5 w-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
					<span className="text-foreground/80">
						{includeFlashdiskPouch ? (
							<>
								Paket{" "}
								<span className="font-medium text-foreground">
									include flashdisk + pouch
								</span>{" "}
								— biasanya 1 set per event.
							</>
						) : (
							<>
								Paket{" "}
								<span className="font-medium text-foreground">
									tidak include flashdisk/pouch
								</span>{" "}
								— skip kecuali emang dipakai.
							</>
						)}
					</span>
				</div>
			)}

			{/* Package bundle BOM (auto-deduct items) */}
			{bundle && bundle.components.length > 0 && (
				<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
					<div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
						<Boxes className="h-4 w-4 shrink-0" />
						<p className="text-sm font-semibold">
							Package bundle: {bundle.name}
						</p>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{bundle.components.map((c) => (
							<Badge
								key={c.item_id}
								variant="outline"
								className="border-amber-300 bg-white text-foreground dark:border-amber-800 dark:bg-surface-2"
							>
								{c.qty}× {c.name}
							</Badge>
						))}
					</div>
					<p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
						Auto-deduct dari stok saat owner approve rekap. Item yang sudah
						ke-track via field cetak/flashdisk/dll TIDAK di-double-deduct.
					</p>
				</div>
			)}

			{/* Paid add-ons summary */}
			{paidAddons.length > 0 && (
				<div className="space-y-1.5">
					<p className="text-[11px] font-semibold uppercase tracking-wider text-sky-900/70 dark:text-sky-300/70">
						Add-on dibayar klien ({paidAddons.length})
					</p>
					<div className="flex flex-wrap gap-1.5">
						{paidAddons.map((a) => (
							<Badge
								key={a.addon_id}
								variant="outline"
								className="border-sky-300 bg-white text-foreground dark:border-sky-800 dark:bg-surface-2"
							>
								{a.quantity}× {a.name}
							</Badge>
						))}
					</div>
				</div>
			)}

			{/* Bonuses — emerald accent + give reminder */}
			{bonuses.length > 0 && (
				<div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
					<div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
						<Gift className="h-4 w-4 shrink-0" />
						<p className="text-sm font-semibold">
							Bonus untuk klien ({bonuses.length})
						</p>
					</div>
					<ul className="space-y-1.5">
						{bonuses.map((b) => (
							<li
								key={b.addon_id}
								className="flex items-start gap-2 text-fluid-caption"
							>
								<CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
								<div className="flex-1">
									<span className="font-medium text-foreground">
										{b.quantity}× {b.name}
									</span>
									{b.notes && (
										<p className="text-muted-foreground text-[11px] italic">
											{b.notes}
										</p>
									)}
								</div>
							</li>
						))}
					</ul>
					<p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
						Pastikan sudah dikasih ke klien hari-H. Stok bonus akan
						auto-deduct saat owner approve rekap.
					</p>
				</div>
			)}
		</section>
	);
}
