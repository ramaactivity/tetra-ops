import { Disc, Gift, Package2, Printer, Sparkles } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import type { DeductionLine } from "@/lib/rekap/project-demand";
import type { HppBucket } from "@/lib/rekap/recipe";
import { cn } from "@/lib/utils";

type RekapData = {
	cetak_total: number;
	media_set_used: number;
	sleeve_used: number;
	flashdisk_used: number;
	pouch_used: number;
	photomagnet_used: number;
	keychain_used: number;
	custom_materials: Record<string, number> | null;
};

/**
 * <RekapSummaryTab /> — owner-facing "Ringkasan" tab. One structured card
 * (header → grouped item rows with qty + HPP → footer total), mirroring the
 * project-page Recap Event card. Reads top-to-bottom like an itemized receipt.
 *
 * v3 (2026-06-29): driven by the CANONICAL plan lines (planRekapDeduction),
 * the SAME array the "Stok" tab + settlement use — not the old field-based
 * computeRekapCost which ignored assembly expansion (flashdisk → FLASHDISK +
 * FD-BOX + POUCH). That divergence made the two tabs disagree: e.g. the pouch
 * bundled with a flashdisk showed −1 in Stok but 0 here, and Mediaset/total
 * HPP differed by per-bucket rounding. Now both render the exact same numbers.
 */
export function RekapSummaryTab({
	rekap,
	lines,
}: {
	rekap: RekapData;
	/** Canonical consumption lines from planRekapDeduction (one per SKU). */
	lines: DeductionLine[];
}) {
	// Raw per-line cost — summed without per-bucket rounding so this tab matches
	// the "Stok" tab's "Total HPP terdeduksi" to the rupiah (it sums the same way).
	const costOf = (l: DeductionLine) => l.qty * l.unit_cost;
	const bucketLines = (b: HppBucket) => lines.filter((l) => l.bucket === b);
	const sumBucket = (b: HppBucket) =>
		bucketLines(b).reduce((s, l) => s + costOf(l), 0);
	const sumSku = (predicate: (sku: string) => boolean) =>
		lines.filter((l) => predicate(l.sku)).reduce((s, l) => s + costOf(l), 0);
	const qtySku = (predicate: (sku: string) => boolean) =>
		lines.filter((l) => predicate(l.sku)).reduce((s, l) => s + l.qty, 0);

	const total = lines.reduce((s, l) => s + costOf(l), 0);

	// Flashdisk bucket holds both the drive (FLASHDISK) and its box (FD-BOX).
	// Split them into their own rows so the receipt mirrors the Stok tab.
	const isBox = (sku: string) => sku.toUpperCase().startsWith("FD-BOX");
	const flashdiskCost = sumSku((s) => {
		const u = s.toUpperCase();
		return (u.startsWith("FLASHDISK") || u.startsWith("FD")) && !isBox(s);
	});
	const boxCost = sumSku(isBox);
	const boxQty = qtySku(isBox);
	// Pouch consumed = standalone pouch_used + any bundled with a flashdisk.
	// This is why Stok showed −1 while the old Ringkasan showed 0.
	const pouchQty = qtySku((s) => s.toUpperCase().startsWith("POUCH"));

	const bonusLines = bucketLines("bonus");
	const customLines = bucketLines("other");

	return (
		<div className="overflow-hidden rounded-xl border border-border-default bg-card">
			{/* HEADER */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
				<div className="min-w-0">
					<h2 className="text-[14px] font-semibold leading-tight text-foreground">
						Material &amp; estimasi HPP
					</h2>
					<p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
						Qty terpakai + estimasi biaya pokok per item.
					</p>
				</div>
				<Badge
					variant="outline"
					className="border-primary/40 bg-primary/10 text-primary"
				>
					{lines.length} baris konsumsi
				</Badge>
			</div>

			{/* ITEM BREAKDOWN */}
			<div className="px-5">
				<Section icon={Printer} title="Cetak">
					<ItemRow name="Total cetak" qty={rekap.cetak_total} unit="pcs" />
					<ItemRow
						name="Mediaset"
						qty={rekap.media_set_used}
						unit="set"
						cost={sumBucket("mediaset")}
					/>
					<ItemRow
						name="Sleeve"
						qty={rekap.sleeve_used}
						unit="pcs"
						cost={sumBucket("sleeve")}
					/>
				</Section>

				<Section icon={Package2} title="Flashdisk & Pouch">
					<ItemRow
						name="Flashdisk"
						qty={rekap.flashdisk_used}
						unit="pcs"
						cost={flashdiskCost}
					/>
					{boxQty > 0 && (
						<ItemRow
							name="Box flashdisk"
							qty={boxQty}
							unit="pcs"
							cost={boxCost}
							note="otomatis ikut flashdisk"
						/>
					)}
					<ItemRow
						name="Pouch"
						qty={pouchQty}
						unit="pcs"
						cost={sumBucket("pouch")}
						note={
							pouchQty > rekap.pouch_used
								? "termasuk paket flashdisk"
								: undefined
						}
					/>
				</Section>

				<Section icon={Disc} title="Add-on">
					<ItemRow
						name="Photomagnet"
						qty={rekap.photomagnet_used}
						unit="pcs"
						cost={sumBucket("photomagnet")}
					/>
					<ItemRow
						name="Keychain"
						qty={rekap.keychain_used}
						unit="pcs"
						cost={sumBucket("keychain")}
					/>
				</Section>

				{bonusLines.length > 0 && (
					<Section icon={Gift} title="Bonus klien (gratis)">
						{bonusLines.map((l) => (
							<ItemRow
								key={`${l.item_id}-${l.source_label}`}
								name={l.name}
								qty={l.qty}
								unit="pcs"
								cost={costOf(l)}
								tone="emerald"
							/>
						))}
					</Section>
				)}

				{customLines.length > 0 && (
					<Section icon={Sparkles} title="Item tambahan">
						{customLines.map((l) => (
							<ItemRow
								key={`${l.item_id}-${l.source_label}`}
								name={l.name}
								qty={l.qty}
								unit="pcs"
								cost={costOf(l)}
							/>
						))}
					</Section>
				)}
			</div>

			{/* FOOTER TOTAL */}
			<div className="space-y-1.5 border-t border-border-subtle bg-secondary/30 px-5 py-4">
				<div className="flex items-center justify-between gap-3">
					<span className="text-[13px] font-semibold text-foreground">
						Total estimasi HPP
					</span>
					<span className="tabular text-[22px] font-semibold leading-none text-primary">
						{formatRupiah(total)}
					</span>
				</div>
				<p className="text-[11.5px] italic text-muted-foreground">
					Estimasi pakai harga rata-rata pembelian saat ini. HPP final
					di-snapshot saat settle event. Angka di sini = tab Stok.
				</p>
			</div>
		</div>
	);
}

// ============== Helpers ==============

function Section({
	icon: Icon,
	title,
	children,
}: {
	icon: typeof Printer;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border-b border-border-subtle py-2 last:border-b-0">
			<div className="flex items-center gap-2 px-1 pb-1 pt-1.5">
				<Icon className="size-3.5 text-muted-foreground" aria-hidden />
				<h3 className="eyebrow text-muted-foreground">{title}</h3>
			</div>
			<div className="divide-y divide-border-subtle/60">{children}</div>
		</section>
	);
}

function ItemRow({
	name,
	qty,
	unit,
	cost,
	tone = "default",
	note,
}: {
	name: string;
	qty: number;
	unit: string;
	/** Omit for info-only rows (e.g. "Total cetak") that carry no HPP. */
	cost?: number;
	tone?: "default" | "emerald";
	note?: string;
}) {
	const isZero = qty === 0;
	const hasCost = cost != null;
	const costColor =
		hasCost && cost > 0
			? tone === "emerald"
				? "text-emerald-700 dark:text-emerald-300"
				: "text-foreground"
			: "text-muted-foreground/50";
	return (
		<div className="grid grid-cols-[1fr_auto_6.5rem] items-baseline gap-3 px-1 py-2">
			<div className="min-w-0">
				<span
					className={cn(
						"text-[13px]",
						isZero ? "text-muted-foreground" : "text-foreground",
					)}
				>
					{name}
				</span>
				{note ? (
					<span className="ml-1.5 text-[11px] italic text-muted-foreground/70">
						{note}
					</span>
				) : null}
			</div>
			<span className="tabular text-right text-[12px] text-muted-foreground">
				{qty.toLocaleString("id-ID")}
				<span className="ml-0.5 text-muted-foreground/60">{unit}</span>
			</span>
			<span
				className={cn("tabular text-right text-[13px] font-medium", costColor)}
			>
				{hasCost ? (cost > 0 ? formatRupiah(cost) : "—") : "—"}
			</span>
		</div>
	);
}
