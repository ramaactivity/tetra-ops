import { Camera, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRupiah } from "@/lib/format";
import { computeDepreciation } from "@/lib/inventory/depreciation";
import { createClient } from "@/lib/supabase/server";

const CONDITION_TONE: Record<string, string> = {
	normal: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	service: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	damaged: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	lost: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

const LOCATION_LABELS: Record<string, string> = {
	gudang_pusat: "Gudang",
	event: "Sedang di Event",
	service_center: "Service Center",
	crew_carry: "Dibawa Crew",
	lost: "Lost",
};

export default async function AssetRegisterPage() {
	const supabase = await createClient();

	const { data: items } = await supabase
		.from("inventory_items")
		.select(
			`id, sku, name, unit, image_url, is_active,
			 config:items_fixed_asset_config!inner(
			   asset_number, serial_number, purchase_price, purchase_date,
			   salvage_value, useful_life_months, depreciation_method,
			   depreciation_start_date, condition, current_location,
			   current_event_id, current_crew_id
			 ),
			 event:events!inventory_items_current_event_id_fkey(project_id, client_name)`,
		)
		.eq("category", "fixed_asset")
		.is("deleted_at", null)
		.order("name");

	type RawConfig = {
		asset_number: string | null;
		serial_number: string | null;
		purchase_price: number | string | null;
		purchase_date: string | null;
		salvage_value: number | string | null;
		useful_life_months: number | null;
		depreciation_method: string;
		depreciation_start_date: string | null;
		condition: string | null;
		current_location: string | null;
		current_event_id: string | null;
		current_crew_id: string | null;
	};
	type Raw = {
		id: string;
		sku: string;
		name: string;
		unit: string;
		image_url: string | null;
		is_active: boolean;
		config: RawConfig | RawConfig[] | null;
		event:
			| { project_id: string; client_name: string }
			| Array<{ project_id: string; client_name: string }>
			| null;
	};

	const rows = ((items ?? []) as Raw[])
		.map((r) => {
			const cfg = Array.isArray(r.config) ? r.config[0] : r.config;
			if (!cfg) return null;
			const evt = Array.isArray(r.event) ? r.event[0] : r.event;
			const purchasePrice = Number(cfg.purchase_price ?? 0);
			const salvageValue = Number(cfg.salvage_value ?? 0);
			const depr = computeDepreciation({
				purchase_price: purchasePrice,
				salvage_value: salvageValue,
				useful_life_months: cfg.useful_life_months,
				depreciation_method:
					(cfg.depreciation_method as "straight_line" | "none") ?? "none",
				depreciation_start_date: cfg.depreciation_start_date,
			});
			return {
				id: r.id,
				sku: r.sku,
				name: r.name,
				unit: r.unit,
				image_url: r.image_url,
				is_active: r.is_active,
				asset_number: cfg.asset_number,
				serial_number: cfg.serial_number,
				purchase_price: purchasePrice,
				purchase_date: cfg.purchase_date,
				salvage_value: salvageValue,
				useful_life_months: cfg.useful_life_months,
				depreciation_method: cfg.depreciation_method,
				condition: cfg.condition,
				location: cfg.current_location,
				event: evt,
				depr,
			};
		})
		.filter((r): r is NonNullable<typeof r> => r !== null);

	const totalAcquisition = rows.reduce((s, r) => s + r.purchase_price, 0);
	const totalAccumDepr = rows.reduce((s, r) => s + r.depr.accumulated, 0);
	const totalBookValue = rows.reduce((s, r) => s + r.depr.bookValue, 0);
	const totalMonthlyDepr = rows.reduce((s, r) => s + r.depr.monthly, 0);
	const inActiveCount = rows.filter((r) => r.condition === "normal").length;
	const inUseCount = rows.filter((r) => r.location === "event").length;

	return (
		<Container size="xl" className="space-y-5">
			<PageHeader
				title="Asset Register"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Daftar aktiva tetap (kamera, printer, lighting, dll). Book value = purchase price − accum. depresiasi (straight-line)."
				actions={
					<Link
						href="/warehouse/items/new"
						className={buttonVariants({ variant: "default", size: "sm" })}
					>
						<Plus className="size-4" />
						Tambah Asset
					</Link>
				}
			/>

			<KpiRow>
				<KpiCard
					label="Nilai Akuisisi"
					value={formatRupiah(totalAcquisition)}
					hint={`${rows.length} aktiva`}
					icon={Camera}
					accent="primary"
				/>
				<KpiCard
					label="Akum. Penyusutan"
					value={formatRupiah(totalAccumDepr)}
					hint="Σ depresiasi sampai hari ini"
					accent="rose"
				/>
				<KpiCard
					label="Nilai Buku"
					value={formatRupiah(totalBookValue)}
					hint="Acquisition − accum. depr."
					accent="emerald"
				/>
				<KpiCard
					label="Beban Bulanan"
					value={formatRupiah(totalMonthlyDepr)}
					hint={`${inUseCount} sedang di-event · ${inActiveCount} aktif`}
					accent="sky"
				/>
			</KpiRow>

			{rows.length === 0 ? (
				<EmptyState
					icon={Camera}
					title="Belum ada aktiva tetap"
					description="Tambah kamera/printer/lighting via Tambah Item → Aktiva Tetap."
				/>
			) : (
				<div className="bg-surface-2 overflow-hidden rounded-lg">
					<div className="overflow-x-auto">
						<table className="w-full text-[12px]">
							<thead>
								<tr className="text-muted-foreground/80 text-left text-[10px] uppercase tracking-wider">
									<th className="px-4 py-2.5 font-medium">Asset</th>
									<th className="px-3 py-2.5 font-medium">Status</th>
									<th className="px-3 py-2.5 text-right font-medium">
										Harga Beli
									</th>
									<th className="px-3 py-2.5 text-right font-medium">
										Akum. Depr.
									</th>
									<th className="px-3 py-2.5 text-right font-medium">
										Nilai Buku
									</th>
									<th className="px-3 py-2.5 text-right font-medium">
										/Bulan
									</th>
									<th className="px-3 py-2.5 text-right font-medium">
										Sisa
									</th>
									<th className="w-10 px-2 py-2.5" />
								</tr>
							</thead>
							<tbody>
								{rows.map((r, idx) => {
									const remainingMonths =
										r.useful_life_months && r.depr.monthsElapsed
											? Math.max(
													0,
													r.useful_life_months - r.depr.monthsElapsed,
												)
											: r.useful_life_months ?? 0;
									return (
										<tr
											key={r.id}
											className={
												idx > 0
													? "border-t border-foreground/[0.04]"
													: ""
											}
										>
											<td className="px-4 py-2.5 align-top">
												<div className="space-y-0.5">
													<div className="flex items-center gap-2">
														<span className="font-medium">
															{r.name}
														</span>
														{r.depr.isFullyDepreciated && (
															<Badge
																variant="outline"
																className="h-4 px-1 text-[9px] bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
															>
																FULLY DEPRECIATED
															</Badge>
														)}
													</div>
													<div className="tabular text-muted-foreground text-[10px]">
														{r.sku}
														{r.asset_number ? ` · ${r.asset_number}` : ""}
														{r.serial_number ? ` · S/N ${r.serial_number}` : ""}
													</div>
													{r.purchase_date && (
														<div className="text-muted-foreground/80 text-[10px]">
															Beli{" "}
															{new Date(r.purchase_date).toLocaleDateString(
																"id-ID",
																{ year: "numeric", month: "short" },
															)}
															{r.useful_life_months
																? ` · ${r.useful_life_months} bln`
																: ""}
														</div>
													)}
												</div>
											</td>
											<td className="px-3 py-2.5 align-top">
												<div className="flex flex-col gap-1">
													{r.condition && (
														<span
															className={`inline-flex h-4 w-max items-center rounded-full px-1.5 text-[9px] font-medium ${
																CONDITION_TONE[r.condition] ??
																CONDITION_TONE.normal
															}`}
														>
															{r.condition}
														</span>
													)}
													{r.location && (
														<span className="text-[10px] text-muted-foreground">
															{LOCATION_LABELS[r.location] ?? r.location}
														</span>
													)}
													{r.event && (
														<Link
															href={`/operations/${r.event.project_id}`}
															className="text-primary text-[10px] hover:underline"
														>
															@ {r.event.project_id}
														</Link>
													)}
												</div>
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top">
												{formatRupiah(r.purchase_price)}
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top text-rose-700 dark:text-rose-300">
												{r.depr.accumulated > 0
													? formatRupiah(r.depr.accumulated)
													: "—"}
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top font-semibold text-emerald-700 dark:text-emerald-300">
												{formatRupiah(r.depr.bookValue)}
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top text-muted-foreground">
												{r.depr.monthly > 0
													? formatRupiah(r.depr.monthly)
													: "—"}
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top text-muted-foreground">
												{r.depreciation_method === "straight_line" &&
												r.useful_life_months
													? `${remainingMonths}/${r.useful_life_months} bln`
													: "—"}
											</td>
											<td className="px-2 py-2.5 align-top text-right">
												<Link
													href={`/warehouse/items/${r.id}/edit`}
													className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md hover:bg-surface-1"
													title="Edit asset"
												>
													<Pencil className="size-3.5" />
												</Link>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{rows.length > 0 && (
				<div className="bg-surface-1 rounded-md px-4 py-3 text-[12px] text-muted-foreground">
					<strong className="text-foreground">Note:</strong> Beban depresiasi
					bulanan belum auto-posted ke jurnal. Owner perlu post manual via{" "}
					<Link
						href="/finance/accounting"
						className="text-primary hover:underline"
					>
						Finance → Akuntansi → Manual Journal
					</Link>
					{" "}dengan template Dr 5-500 Penyusutan / Cr 1-401 Akum. Penyusutan.
				</div>
			)}
		</Container>
	);
}
