import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type RawRow = {
	id: string;
	qty_base: number | string;
	reason: string;
	cost_at_time: number | string | null;
	created_at: string;
	item:
		| { id: string; sku: string; name: string; unit: string }
		| Array<{ id: string; sku: string; name: string; unit: string }>
		| null;
	supplier: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

const REASON_LABELS: Record<string, string> = {
	testing: "Testing",
	defective_on_arrival: "Defective on Arrival",
	handling_damage: "Handling Damage",
	production_reject: "Production Reject",
	expired: "Expired",
	customer_returned: "Customer Returned",
	opname_shortage: "Opname Shortage",
	other: "Lainnya",
};

const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];

function ymKey(iso: string): string {
	return iso.slice(0, 7); // YYYY-MM
}

function ymLabel(key: string): string {
	const [y, m] = key.split("-");
	return `${MONTH_LABELS[Number(m) - 1] ?? m} ${y}`;
}

export default async function WastageReportPage({
	searchParams,
}: {
	searchParams: Promise<{ months?: string }>;
}) {
	const params = await searchParams;
	const monthsBack = Math.min(Math.max(Number(params.months ?? 6), 1), 24);
	const cutoff = new Date();
	cutoff.setMonth(cutoff.getMonth() - monthsBack);
	cutoff.setDate(1);
	cutoff.setHours(0, 0, 0, 0);

	const supabase = await createClient();

	const { data } = await supabase
		.from("wastage_logs")
		.select(
			`id, qty_base, reason, cost_at_time, created_at,
			 item:inventory_items!wastage_logs_item_id_fkey(id, sku, name, unit),
			 supplier:suppliers!wastage_logs_supplier_id_fkey(id, name)`,
		)
		.gte("created_at", cutoff.toISOString())
		.order("created_at", { ascending: false })
		.limit(5000);

	const rows = ((data ?? []) as RawRow[]).map((r) => ({
		id: r.id,
		qty: Number(r.qty_base),
		reason: r.reason,
		cost: Number(r.cost_at_time ?? 0),
		ym: ymKey(r.created_at),
		item: Array.isArray(r.item) ? r.item[0] : r.item,
		supplier: Array.isArray(r.supplier) ? r.supplier[0] : r.supplier,
	}));

	// Build pivot: row = reason, col = YYYY-MM, value = cost
	const monthSet = new Set<string>();
	const reasonByMonth = new Map<string, Map<string, number>>();
	const monthTotals = new Map<string, number>();
	const reasonTotals = new Map<string, number>();
	let grand = 0;

	for (const r of rows) {
		monthSet.add(r.ym);
		if (!reasonByMonth.has(r.reason)) {
			reasonByMonth.set(r.reason, new Map());
		}
		const inner = reasonByMonth.get(r.reason)!;
		inner.set(r.ym, (inner.get(r.ym) ?? 0) + r.cost);
		monthTotals.set(r.ym, (monthTotals.get(r.ym) ?? 0) + r.cost);
		reasonTotals.set(r.reason, (reasonTotals.get(r.reason) ?? 0) + r.cost);
		grand += r.cost;
	}

	const months = Array.from(monthSet).sort();
	const reasons = Array.from(reasonByMonth.keys()).sort(
		(a, b) => (reasonTotals.get(b) ?? 0) - (reasonTotals.get(a) ?? 0),
	);

	// Top items by total loss
	const itemAgg = new Map<
		string,
		{ id: string; sku: string; name: string; qty: number; cost: number }
	>();
	for (const r of rows) {
		if (!r.item) continue;
		const cur = itemAgg.get(r.item.id) ?? {
			id: r.item.id,
			sku: r.item.sku,
			name: r.item.name,
			qty: 0,
			cost: 0,
		};
		cur.qty += r.qty;
		cur.cost += r.cost;
		itemAgg.set(r.item.id, cur);
	}
	const topItems = Array.from(itemAgg.values())
		.sort((a, b) => b.cost - a.cost)
		.slice(0, 10);

	// Top suppliers (only entries with supplier — usually DOA)
	const supplierAgg = new Map<string, { name: string; qty: number; cost: number }>();
	for (const r of rows) {
		if (!r.supplier) continue;
		const cur = supplierAgg.get(r.supplier.id) ?? {
			name: r.supplier.name,
			qty: 0,
			cost: 0,
		};
		cur.qty += r.qty;
		cur.cost += r.cost;
		supplierAgg.set(r.supplier.id, cur);
	}
	const topSuppliers = Array.from(supplierAgg.values())
		.sort((a, b) => b.cost - a.cost)
		.slice(0, 5);

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Laporan Wastage"
				description={`Akumulasi kerugian wastage ${monthsBack} bulan terakhir. Sumber: tabel wastage_logs (Dr 5-510 Beban Wastage).`}
				actions={
					<Link
						href="/warehouse/wastage"
						className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
					>
						<ArrowLeft className="size-3.5" />
						Detail log
					</Link>
				}
			/>

			{/* Period filter */}
			<div className="flex flex-wrap items-center gap-2">
				{[3, 6, 12, 24].map((m) => (
					<Link
						key={m}
						href={`/finance/wastage-report?months=${m}`}
						className={`press-down inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors ${
							m === monthsBack
								? "bg-primary text-primary-foreground"
								: "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
						}`}
					>
						{m} bulan
					</Link>
				))}
				<span className="ml-auto text-[12px] text-muted-foreground">
					{rows.length} entries · total loss{" "}
					<strong className="tabular text-rose-700 dark:text-rose-300">
						{formatRupiah(grand)}
					</strong>
				</span>
			</div>

			{rows.length === 0 ? (
				<div className="bg-surface-2 flex flex-col items-center gap-2 rounded-lg p-10 text-center">
					<AlertTriangle className="text-muted-foreground/40 size-10" />
					<p className="text-sm font-medium">Belum ada wastage di periode ini</p>
					<p className="text-muted-foreground text-[12px]">
						Catat wastage saat ada barang rusak/testing/defective di{" "}
						<Link
							href="/warehouse/wastage/new"
							className="text-primary hover:underline"
						>
							/warehouse/wastage/new
						</Link>
					</p>
				</div>
			) : (
				<>
					{/* Pivot reason × month */}
					<div className="bg-surface-2 overflow-hidden rounded-lg">
						<div className="border-b border-foreground/[0.04] px-4 py-3">
							<h3 className="text-sm font-semibold">
								Loss per Alasan × Bulan
							</h3>
							<p className="text-muted-foreground text-[11px]">
								Cost dalam Rupiah · baris di-rank by total terbesar
							</p>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full text-[12px]">
								<thead>
									<tr className="text-muted-foreground/80 text-left text-[10px] uppercase tracking-wider">
										<th className="px-4 py-2 font-medium">Alasan</th>
										{months.map((m) => (
											<th
												key={m}
												className="px-3 py-2 text-right font-medium"
											>
												{ymLabel(m)}
											</th>
										))}
										<th className="px-4 py-2 text-right font-semibold">
											Total
										</th>
									</tr>
								</thead>
								<tbody>
									{reasons.map((reason, idx) => (
										<tr
											key={reason}
											className={
												idx > 0
													? "border-t border-foreground/[0.04]"
													: ""
											}
										>
											<td className="px-4 py-2 font-medium">
												{REASON_LABELS[reason] ?? reason}
											</td>
											{months.map((m) => {
												const v =
													reasonByMonth.get(reason)?.get(m) ?? 0;
												return (
													<td
														key={m}
														className="tabular px-3 py-2 text-right"
													>
														{v > 0
															? formatRupiah(v)
															: <span className="text-muted-foreground/40">—</span>}
													</td>
												);
											})}
											<td className="tabular px-4 py-2 text-right font-semibold text-rose-700 dark:text-rose-300">
												{formatRupiah(reasonTotals.get(reason) ?? 0)}
											</td>
										</tr>
									))}
									<tr className="bg-surface-1 border-t border-foreground/[0.04]">
										<td className="px-4 py-2 font-semibold">Total</td>
										{months.map((m) => (
											<td
												key={m}
												className="tabular px-3 py-2 text-right font-semibold"
											>
												{formatRupiah(monthTotals.get(m) ?? 0)}
											</td>
										))}
										<td className="tabular px-4 py-2 text-right font-bold text-rose-700 dark:text-rose-300">
											{formatRupiah(grand)}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{/* Top items */}
						<div className="bg-surface-2 overflow-hidden rounded-lg">
							<div className="border-b border-foreground/[0.04] px-4 py-3">
								<h3 className="text-sm font-semibold">
									Top Item by Loss
								</h3>
								<p className="text-muted-foreground text-[11px]">
									10 item dengan kerugian wastage terbesar
								</p>
							</div>
							{topItems.length === 0 ? (
								<div className="text-muted-foreground p-6 text-center text-[12px]">
									—
								</div>
							) : (
								<ul>
									{topItems.map((it, idx) => (
										<li
											key={it.id}
											className={`flex items-center justify-between px-4 py-2.5 text-[12px] ${
												idx > 0
													? "border-t border-foreground/[0.04]"
													: ""
											}`}
										>
											<div className="min-w-0">
												<div className="truncate font-medium">
													{it.name}
												</div>
												<div className="tabular text-muted-foreground text-[10px]">
													{it.sku} · qty {it.qty.toLocaleString("id-ID")}
												</div>
											</div>
											<div className="tabular font-semibold text-rose-700 dark:text-rose-300">
												{formatRupiah(it.cost)}
											</div>
										</li>
									))}
								</ul>
							)}
						</div>

						{/* Top suppliers (defective) */}
						<div className="bg-surface-2 overflow-hidden rounded-lg">
							<div className="border-b border-foreground/[0.04] px-4 py-3">
								<h3 className="text-sm font-semibold">
									Top Supplier by Defective Cost
								</h3>
								<p className="text-muted-foreground text-[11px]">
									Supplier dengan kontribusi loss (terutama DOA & shortage)
								</p>
							</div>
							{topSuppliers.length === 0 ? (
								<div className="text-muted-foreground p-6 text-center text-[12px]">
									Tidak ada wastage dengan supplier tagged. Pakai field
									"Supplier" saat catat wastage DOA untuk track ini.
								</div>
							) : (
								<ul>
									{topSuppliers.map((sup, idx) => (
										<li
											key={sup.name}
											className={`flex items-center justify-between px-4 py-2.5 text-[12px] ${
												idx > 0
													? "border-t border-foreground/[0.04]"
													: ""
											}`}
										>
											<div className="min-w-0">
												<div className="truncate font-medium">{sup.name}</div>
												<div className="tabular text-muted-foreground text-[10px]">
													{sup.qty.toLocaleString("id-ID")} qty (mixed
													units)
												</div>
											</div>
											<div className="tabular font-semibold text-rose-700 dark:text-rose-300">
												{formatRupiah(sup.cost)}
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</>
			)}
		</Container>
	);
}
