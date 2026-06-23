"use client";

import { AlertTriangle, CalendarClock, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import type {
	PembelianItemOption,
	PembelianSupplierOption,
} from "@/components/warehouse/pembelian/pembelian-dialog";
import { PembelianDialog } from "@/components/warehouse/pembelian/pembelian-dialog";
import type { ForecastResult, ForecastRow } from "@/lib/actions/forecast";
import { formatRupiah } from "@/lib/format";

function fmt(n: number, max = 0) {
	return n.toLocaleString("id-ID", { maximumFractionDigits: max });
}

export function ForecastView({
	result,
	pembelianItems,
	pembelianSuppliers,
}: {
	result: ForecastResult;
	pembelianItems: PembelianItemOption[];
	pembelianSuppliers: PembelianSupplierOption[];
}) {
	const { upcoming_count, events_observed, rows, stock_unknown } = result;

	// ── Honest empty / edge states ───────────────────────────────────────────
	if (stock_unknown) {
		return (
			<EmptyState
				icon={AlertTriangle}
				title="Stok gagal dimuat"
				description="Estimasi kekurangan tidak bisa dihitung tanpa data stok. Muat ulang halaman; kalau tetap, cek koneksi database."
			/>
		);
	}
	if (upcoming_count === 0) {
		return (
			<EmptyState
				icon={CalendarClock}
				title="Tidak ada event mendatang"
				description="Belum ada event berstatus 'upcoming'. Stok aman — tidak ada kebutuhan yang harus disiapkan."
			/>
		);
	}
	if (events_observed === 0) {
		return (
			<EmptyState
				icon={CalendarClock}
				title="Belum ada riwayat pemakaian"
				description="Estimasi kebutuhan dihitung dari rata-rata pemakaian event sebelumnya. Setelah beberapa event selesai & rekap-nya disetujui, perkiraan akan muncul di sini."
			/>
		);
	}
	if (rows.length === 0) {
		return (
			<EmptyState
				icon={ShoppingCart}
				title="Stok cukup untuk semua event mendatang"
				description={`Perkiraan kebutuhan ${upcoming_count} event mendatang masih tertutup stok yang ada. Tidak ada yang perlu dibeli sekarang.`}
			/>
		);
	}

	const columns: ResponsiveTableColumn<ForecastRow>[] = [
		{
			key: "name",
			header: "Item",
			render: (r) => (
				<div className="space-y-0.5">
					<div className="font-medium text-foreground">{r.name}</div>
					<div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
						<span>{r.sku}</span>
						{r.preferred_supplier_name && (
							<>
								<span className="text-muted-foreground/40">·</span>
								<span>{r.preferred_supplier_name}</span>
							</>
						)}
					</div>
				</div>
			),
		},
		{
			key: "demand",
			header: "Perkiraan butuh",
			align: "right",
			width: "150px",
			render: (r) => (
				<span className="tabular whitespace-nowrap text-foreground">
					{fmt(r.projected_demand)} {r.unit}
				</span>
			),
		},
		{
			key: "on_hand",
			header: "Stok ada",
			align: "right",
			width: "120px",
			hideOnMobile: true,
			render: (r) => (
				<span
					className={`tabular ${r.on_hand < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
				>
					{fmt(r.on_hand, 1)} {r.unit}
				</span>
			),
		},
		{
			key: "shortfall",
			header: "Kurang",
			align: "right",
			width: "120px",
			render: (r) => (
				<Badge
					variant="outline"
					className="h-5 border-rose-500/30 bg-rose-500/10 px-1.5 text-[11px] tabular text-rose-700 dark:text-rose-300"
				>
					{fmt(r.shortfall)} {r.unit}
				</Badge>
			),
		},
		{
			key: "suggested",
			header: "Saran beli",
			align: "right",
			width: "150px",
			render: (r) => (
				<span className="tabular font-medium text-foreground">
					{r.bulk_label
						? `${fmt(r.bulk_qty ?? 0)} ${r.bulk_label}`
						: `${fmt(r.suggested_buy_base)} ${r.unit}`}
				</span>
			),
		},
		{
			key: "est_cost",
			header: "Estimasi",
			align: "right",
			width: "160px",
			hideOnMobile: true,
			render: (r) =>
				r.est_cost > 0 ? (
					<span className="tabular whitespace-nowrap text-muted-foreground">
						{formatRupiah(r.est_cost)}
					</span>
				) : (
					<span className="text-foreground/20">—</span>
				),
		},
	];

	const shortfallItemIds = rows.map((r) => r.item_id);

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-[12.5px] text-muted-foreground">
					Estimasi dari rata-rata pemakaian {events_observed} event sebelumnya ×{" "}
					{upcoming_count} event mendatang.{" "}
					<span className="text-muted-foreground/70">
						Angka perkiraan — bukan pasti.
					</span>
				</p>
				<PembelianDialog
					trigger={
						<span className="press-down inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90">
							<ShoppingCart className="size-4" />
							Belanja kekurangan
							<span className="tabular text-[11px] opacity-80">
								{rows.length}
							</span>
						</span>
					}
					items={pembelianItems}
					suppliers={pembelianSuppliers}
					initialItemIds={shortfallItemIds}
				/>
			</div>

			<ResponsiveTable
				className="md:overflow-hidden md:rounded-2xl md:border md:border-border-subtle md:bg-card"
				columns={columns}
				rows={rows}
				keyExtractor={(r) => r.item_id}
			/>
		</div>
	);
}
