import { Disc, Gift, Image, Package2, Printer, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RekapContext, RekapContextBonus } from "@/lib/actions/rekap";
import { formatRupiah } from "@/lib/format";
import {
	computeRekapCost,
	deriveRekapRatio,
	sumBuckets,
} from "@/lib/rekap/cost";
import type { RekapField } from "@/lib/rekap-mapping/types";

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
 * <RekapSummaryTab /> — read-only summary visible to owner in the
 * "Ringkasan" tab. Groups quantities by category (Cetak / FD&Pouch /
 * Add-on / Custom) into KPI cards with estimated HPP per metric.
 *
 * Numbers use computeRekapCost() (same as crew form live preview) so
 * displayed totals match what owner sees there.
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
		<div className="space-y-4">
			{/* ===== CETAK ===== */}
			<Group icon={Printer} title="Cetak">
				<StatCard
					label="Total cetak"
					value={rekap.cetak_total}
					unit="pcs"
					cost={costFor("cetak_total", rekap.cetak_total)}
				/>
				<StatCard
					label="Media set"
					value={rekap.media_set_used}
					unit="set"
					cost={costFor("media_set_used", rekap.media_set_used)}
					subtitle={
						rekap.media_set_used > 0
							? `≈ ${rekap.media_set_used * 140} cetak`
							: undefined
					}
				/>
				<StatCard
					label="Sleeve"
					value={rekap.sleeve_used}
					unit="pcs"
					cost={costFor("sleeve_used", rekap.sleeve_used)}
				/>
			</Group>

			{/* ===== FD & POUCH ===== */}
			<Group icon={Package2} title="Flashdisk & Pouch">
				<StatCard
					label="Flashdisk"
					value={rekap.flashdisk_used}
					unit="pcs"
					cost={costFor("flashdisk_used", rekap.flashdisk_used)}
				/>
				<StatCard
					label="Pouch"
					value={rekap.pouch_used}
					unit="pcs"
					cost={costFor("pouch_used", rekap.pouch_used)}
				/>
			</Group>

			{/* ===== ADD-ON ===== */}
			<Group icon={Disc} title="Add-on">
				<StatCard
					label="Photomagnet"
					value={rekap.photomagnet_used}
					unit="pcs"
					cost={costFor("photomagnet_used", rekap.photomagnet_used)}
				/>
				<StatCard
					label="Keychain"
					value={rekap.keychain_used}
					unit="pcs"
					cost={costFor("keychain_used", rekap.keychain_used)}
				/>
			</Group>

			{/* ===== BONUS ===== */}
			{context.bonuses.length > 0 && (
				<Group icon={Gift} title="Bonus klien (gratis)" tone="emerald">
					{context.bonuses.map((b) => (
						<BonusCard key={b.addon_id} bonus={b} />
					))}
				</Group>
			)}

			{/* ===== CUSTOM MATERIALS ===== */}
			{customMaterialsEntries.length > 0 && (
				<Group icon={Sparkles} title="Item tambahan (custom)" tone="sky">
					<div className="col-span-full overflow-x-auto rounded-lg border border-border-default bg-surface-3">
						<table className="w-full text-sm">
							<thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
								<tr>
									<th className="px-3 py-2 text-left">SKU</th>
									<th className="px-3 py-2 text-left">Nama</th>
									<th className="px-3 py-2 text-right">Qty</th>
									<th className="px-3 py-2 text-right">Cost</th>
								</tr>
							</thead>
							<tbody>
								{customMaterialsEntries.map((e) => {
									const it = customInventoryBySku.get(e.sku);
									const cost = e.qty * (it?.purchase_price_avg ?? 0);
									return (
										<tr
											key={e.sku}
											className="border-t border-border-default/60"
										>
											<td className="px-3 py-2 font-mono text-[11px]">
												{e.sku}
											</td>
											<td className="px-3 py-2">
												{it?.name ?? (
													<span className="text-muted-foreground italic">
														(item dihapus dari master)
													</span>
												)}
											</td>
											<td className="tabular px-3 py-2 text-right">
												{e.qty.toLocaleString("id-ID")} {it?.unit ?? "pcs"}
											</td>
											<td className="tabular px-3 py-2 text-right font-medium">
												{formatRupiah(cost)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</Group>
			)}

			{/* ===== TOTAL HPP ===== */}
			<div className="space-y-3.5 rounded-xl border border-primary/30 bg-primary/5 p-5">
				<div className="flex items-center justify-between gap-2">
					<h3 className="text-[13.5px] font-semibold text-foreground">
						Estimasi HPP total
					</h3>
					<Badge
						variant="outline"
						className="border-primary/40 bg-primary/10 text-primary"
					>
						{context.mappings.filter((m) => m.item).length} field ter-mapped
					</Badge>
				</div>
				<dl className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
					<BreakdownRow label="Mediaset" value={buckets.mediaset} />
					<BreakdownRow label="Sleeve" value={buckets.sleeve} />
					<BreakdownRow label="Flashdisk" value={buckets.flashdisk} />
					<BreakdownRow label="Pouch" value={buckets.pouch} />
					<BreakdownRow label="Photomagnet" value={buckets.photomagnet} />
					<BreakdownRow label="Keychain" value={buckets.keychain} />
					<BreakdownRow
						label="Bonus klien"
						value={buckets.bonus}
						tone="emerald"
					/>
					<BreakdownRow label="Custom/other" value={buckets.other} tone="sky" />
				</dl>
				<div className="flex items-baseline justify-between border-t border-primary/30 pt-3">
					<p className="text-[13px] font-semibold text-foreground">Total</p>
					<p className="tabular text-[20px] font-semibold leading-none text-primary">
						{formatRupiah(total)}
					</p>
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

function Group({
	icon: Icon,
	title,
	children,
}: {
	icon: typeof Printer;
	title: string;
	tone?: "default" | "emerald" | "sky";
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-2.5">
			<div className="flex items-center gap-2">
				<Icon className="size-3.5 text-muted-foreground" aria-hidden />
				<h3 className="eyebrow text-muted-foreground">{title}</h3>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">{children}</div>
		</section>
	);
}

function StatCard({
	label,
	value,
	unit,
	cost,
	subtitle,
}: {
	label: string;
	value: number;
	unit: string;
	cost: number;
	subtitle?: string;
}) {
	const isZero = value === 0;
	return (
		<div
			className={`flex flex-col gap-1.5 rounded-lg border p-4 ${
				isZero
					? "border-dashed border-border-default bg-card/40"
					: "border-border-default bg-card"
			}`}
		>
			<p className="eyebrow text-muted-foreground">{label}</p>
			<p
				className={`tabular text-[24px] font-semibold leading-none ${
					isZero ? "text-muted-foreground/40" : "text-foreground"
				}`}
			>
				{value.toLocaleString("id-ID")}
				<span className="ml-1 text-[12px] font-normal text-muted-foreground">
					{unit}
				</span>
			</p>
			{cost > 0 ? (
				<p className="tabular text-[12px] font-medium text-muted-foreground">
					{formatRupiah(cost)}
				</p>
			) : subtitle ? (
				<p className="text-[12px] text-muted-foreground">{subtitle}</p>
			) : null}
		</div>
	);
}

function BonusCard({ bonus }: { bonus: RekapContextBonus }) {
	const inv = bonus.inventory_item;
	const cost = inv ? bonus.quantity * inv.purchase_price_avg : 0;
	return (
		<div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
			<div className="flex items-center gap-1.5">
				<Image
					className="size-3 text-emerald-700 dark:text-emerald-300"
					aria-hidden
				/>
				<p className="eyebrow text-emerald-800 dark:text-emerald-200">Bonus</p>
			</div>
			<p className="text-[13px] font-medium text-foreground">{bonus.name}</p>
			<p className="tabular text-[20px] font-semibold leading-none text-foreground">
				{bonus.quantity.toLocaleString("id-ID")}
				<span className="ml-1 text-[12px] font-normal text-muted-foreground">
					{bonus.unit}
				</span>
			</p>
			{inv ? (
				<p className="tabular text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
					{formatRupiah(cost)} · freebie
				</p>
			) : (
				<p className="text-[11.5px] italic text-muted-foreground">
					Belum di-link ke inventory
				</p>
			)}
			{bonus.notes && (
				<p className="text-[11.5px] italic text-emerald-800 dark:text-emerald-300">
					"{bonus.notes}"
				</p>
			)}
		</div>
	);
}

function BreakdownRow({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: number;
	tone?: "default" | "emerald" | "sky";
}) {
	const isZero = value === 0;
	const valueColor = isZero
		? "text-muted-foreground/40"
		: tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "sky"
				? "text-sky-700 dark:text-sky-300"
				: "text-foreground";
	return (
		<div className="flex items-baseline justify-between gap-2">
			<dt className="text-[12px] text-muted-foreground">{label}</dt>
			<dd className={`tabular text-[12px] font-medium ${valueColor}`}>
				{formatRupiah(value)}
			</dd>
		</div>
	);
}
