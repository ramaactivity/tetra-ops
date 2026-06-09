import { Disc, Gift, Package2, Printer, Sparkles } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { RekapContext } from "@/lib/actions/rekap";
import { formatRupiah } from "@/lib/format";
import {
	computeRekapCost,
	deriveRekapRatio,
	sumBuckets,
} from "@/lib/rekap/cost";
import type { RekapField } from "@/lib/rekap-mapping/types";
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
 * Numbers use computeRekapCost() (same as the crew form live preview) so the
 * displayed totals match what the owner settles.
 */
export function RekapSummaryTab({
	rekap,
	context,
}: {
	rekap: RekapData;
	context: RekapContext;
}) {
	const quantities = {
		cetak_total: rekap.cetak_total,
		media_set_used: rekap.media_set_used,
		sleeve_used: rekap.sleeve_used,
		flashdisk_used: rekap.flashdisk_used,
		pouch_used: rekap.pouch_used,
		photomagnet_used: rekap.photomagnet_used,
		keychain_used: rekap.keychain_used,
	};

	const mappedItems = context.mappings
		.filter((m) => m.item)
		.map((m) => ({
			rekap_field: m.rekap_field,
			frame_size: m.frame_size,
			item_id: m.item_id ?? "",
			qty_per_unit: m.qty_per_unit,
			purchase_price_avg: m.item?.purchase_price_avg ?? 0,
			base_unit: m.item?.unit,
			unit_conversion: m.item?.unit_conversion,
		}));

	const bonusLines = context.bonuses.map((b) => ({
		addon_id: b.addon_id,
		quantity: b.quantity,
		purchase_price_avg: b.inventory_item?.purchase_price_avg ?? 0,
	}));

	const customInventoryBySku = new Map(
		context.custom_inventory.map((it) => [it.sku, it]),
	);

	const customMaterialsEntries = Object.entries(rekap.custom_materials ?? {})
		.map(([sku, qty]) => ({ sku, qty: Number(qty) || 0 }))
		.filter((e) => e.qty > 0);

	const customLines = customMaterialsEntries.map((e) => {
		const it = customInventoryBySku.get(e.sku);
		return {
			sku: e.sku,
			quantity: e.qty,
			purchase_price_avg: it?.purchase_price_avg ?? 0,
		};
	});

	const frameSize = context.pkg.frame_size ?? "";
	const buckets = computeRekapCost(
		quantities,
		mappedItems,
		bonusLines,
		customLines,
		frameSize,
	);
	const total = sumBuckets(buckets);
	const mappedCount = context.mappings.filter((m) => m.item).length;

	function costFor(field: RekapField, qty: number): number {
		// Size-aware: exact match on frame_size wins, fallback to ''
		const exact = context.mappings.find(
			(m) => m.rekap_field === field && m.frame_size === frameSize,
		);
		const fallback = context.mappings.find(
			(m) => m.rekap_field === field && m.frame_size === "",
		);
		const map = exact ?? fallback;
		if (!map?.item) return 0;
		// derived ratio for media/sleeve (matches backend); raw for others.
		const ratio = deriveRekapRatio(field, frameSize, {
			rekap_field: map.rekap_field,
			frame_size: map.frame_size,
			item_id: map.item_id ?? "",
			qty_per_unit: map.qty_per_unit,
			purchase_price_avg: map.item.purchase_price_avg,
			base_unit: map.item.unit,
			unit_conversion: map.item.unit_conversion,
		});
		return Math.round(qty * ratio * map.item.purchase_price_avg);
	}

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
					{mappedCount} field ter-mapped
				</Badge>
			</div>

			{/* ITEM BREAKDOWN */}
			<div className="px-5">
				<Section icon={Printer} title="Cetak">
					<ItemRow
						name="Total cetak"
						qty={rekap.cetak_total}
						unit="pcs"
						cost={costFor("cetak_total", rekap.cetak_total)}
					/>
					<ItemRow
						name="Mediaset"
						qty={rekap.media_set_used}
						unit="set"
						cost={costFor("media_set_used", rekap.media_set_used)}
					/>
					<ItemRow
						name="Sleeve"
						qty={rekap.sleeve_used}
						unit="pcs"
						cost={costFor("sleeve_used", rekap.sleeve_used)}
					/>
				</Section>

				<Section icon={Package2} title="Flashdisk & Pouch">
					<ItemRow
						name="Flashdisk"
						qty={rekap.flashdisk_used}
						unit="pcs"
						cost={costFor("flashdisk_used", rekap.flashdisk_used)}
					/>
					<ItemRow
						name="Pouch"
						qty={rekap.pouch_used}
						unit="pcs"
						cost={costFor("pouch_used", rekap.pouch_used)}
					/>
				</Section>

				<Section icon={Disc} title="Add-on">
					<ItemRow
						name="Photomagnet"
						qty={rekap.photomagnet_used}
						unit="pcs"
						cost={costFor("photomagnet_used", rekap.photomagnet_used)}
					/>
					<ItemRow
						name="Keychain"
						qty={rekap.keychain_used}
						unit="pcs"
						cost={costFor("keychain_used", rekap.keychain_used)}
					/>
				</Section>

				{context.bonuses.length > 0 && (
					<Section icon={Gift} title="Bonus klien (gratis)">
						{context.bonuses.map((b) => {
							const inv = b.inventory_item;
							const cost = inv ? b.quantity * inv.purchase_price_avg : 0;
							return (
								<ItemRow
									key={b.addon_id}
									name={b.name}
									qty={b.quantity}
									unit={b.unit}
									cost={cost}
									tone="emerald"
									note={b.notes ?? undefined}
								/>
							);
						})}
					</Section>
				)}

				{customMaterialsEntries.length > 0 && (
					<Section icon={Sparkles} title="Item tambahan">
						{customMaterialsEntries.map((e) => {
							const it = customInventoryBySku.get(e.sku);
							const cost = e.qty * (it?.purchase_price_avg ?? 0);
							return (
								<ItemRow
									key={e.sku}
									name={it?.name ?? e.sku}
									qty={e.qty}
									unit={it?.unit ?? "pcs"}
									cost={cost}
									note={it ? undefined : "item dihapus dari master"}
								/>
							);
						})}
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
					di-snapshot saat settle event.
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
	cost: number;
	tone?: "default" | "emerald";
	note?: string;
}) {
	const isZero = qty === 0;
	const costColor =
		cost > 0
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
				{cost > 0 ? formatRupiah(cost) : "—"}
			</span>
		</div>
	);
}
