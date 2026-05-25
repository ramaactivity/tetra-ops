import { Camera, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DisposeAssetDialog } from "@/components/warehouse/assets/dispose-asset-dialog";
import { PostDepreciationButton } from "@/components/warehouse/assets/post-depreciation-button";
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

const DISPOSAL_LABELS: Record<string, string> = {
	sold: "Sold",
	scrapped: "Scrapped",
	lost: "Lost",
	donated: "Donated",
	transferred: "Transferred",
};

export default async function AssetRegisterPage({
	searchParams,
}: {
	searchParams: Promise<{ show?: string }>;
}) {
	const params = await searchParams;
	const showDisposed = params.show === "disposed";

	const supabase = await createClient();

	const baseQuery = supabase
		.from("inventory_items")
		.select(
			`id, sku, name, unit, image_url, is_active,
			 config:items_fixed_asset_config!inner(
			   asset_number, serial_number, purchase_price, purchase_date,
			   salvage_value, useful_life_months, depreciation_method,
			   depreciation_start_date, condition, current_location,
			   current_event_id, current_crew_id,
			   disposed_at, disposal_method, disposal_sale_price
			 ),
			 event:events!inventory_items_current_event_id_fkey(project_id, client_name)`,
		)
		.eq("category", "fixed_asset")
		.is("deleted_at", null)
		.order("name");

	const { data: items } = showDisposed
		? await baseQuery.not("config.disposed_at", "is", null)
		: await baseQuery.is("config.disposed_at", null);

	// Accumulated depreciation per item (sum of all postings up to now)
	const itemIds = (items ?? []).map((i) => i.id as string);
	const accumByItem = new Map<string, number>();
	if (itemIds.length > 0) {
		const { data: postings } = await supabase
			.from("depreciation_postings")
			.select("item_id, monthly_amount")
			.in("item_id", itemIds);
		for (const p of (postings ?? []) as Array<{
			item_id: string;
			monthly_amount: number | string;
		}>) {
			accumByItem.set(
				p.item_id,
				(accumByItem.get(p.item_id) ?? 0) + Number(p.monthly_amount ?? 0),
			);
		}
	}

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
		disposed_at: string | null;
		disposal_method: string | null;
		disposal_sale_price: number | string | null;
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

			// Prefer actual posted depreciation over computed; fallback to computed
			const actualAccum = accumByItem.get(r.id) ?? 0;
			const depr = computeDepreciation({
				purchase_price: purchasePrice,
				salvage_value: salvageValue,
				useful_life_months: cfg.useful_life_months,
				depreciation_method:
					(cfg.depreciation_method as "straight_line" | "none") ?? "none",
				depreciation_start_date: cfg.depreciation_start_date,
			});
			// If real postings exist, use those for accum (source of truth)
			const accumulated = actualAccum > 0 ? actualAccum : depr.accumulated;
			const bookValue = Math.max(purchasePrice - accumulated, salvageValue);

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
				disposed_at: cfg.disposed_at,
				disposal_method: cfg.disposal_method,
				disposal_sale_price: Number(cfg.disposal_sale_price ?? 0),
				accumulated,
				bookValue,
				monthly: depr.monthly,
				monthsElapsed: depr.monthsElapsed,
				isFullyDepreciated: depr.isFullyDepreciated,
			};
		})
		.filter((r): r is NonNullable<typeof r> => r !== null);

	const totalAcquisition = rows.reduce((s, r) => s + r.purchase_price, 0);
	const totalAccumDepr = rows.reduce((s, r) => s + r.accumulated, 0);
	const totalBookValue = rows.reduce((s, r) => s + r.bookValue, 0);
	const totalMonthlyDepr = rows.reduce((s, r) => s + r.monthly, 0);
	const inActiveCount = rows.filter((r) => r.condition === "normal").length;
	const inUseCount = rows.filter((r) => r.location === "event").length;

	return (
		<Container size="xl" className="space-y-5">
			<PageHeader
				title="Asset Register"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Daftar aktiva tetap. Book value = purchase price − accum. depresiasi (sumber: depreciation_postings)."
				actions={
					<>
						<PostDepreciationButton />
						<Link
							href="/warehouse/items/new"
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							<Plus className="size-4" />
							Tambah Asset
						</Link>
					</>
				}
			/>

			{/* Filter strip */}
			<div className="flex items-center gap-2">
				<Link
					href="/warehouse/assets"
					className={`press-down inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors ${
						!showDisposed
							? "bg-primary text-primary-foreground"
							: "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
					}`}
				>
					Aktif
				</Link>
				<Link
					href="/warehouse/assets?show=disposed"
					className={`press-down inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors ${
						showDisposed
							? "bg-primary text-primary-foreground"
							: "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
					}`}
				>
					Disposed (Arsip)
				</Link>
			</div>

			{!showDisposed && (
				<KpiRow>
					<KpiCard
						label="Nilai Akuisisi"
						value={formatRupiah(totalAcquisition)}
						hint={`${rows.length} aktiva aktif`}
						icon={Camera}
						accent="primary"
					/>
					<KpiCard
						label="Akum. Penyusutan"
						value={formatRupiah(totalAccumDepr)}
						hint="Σ depreciation_postings"
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
						hint={`${inUseCount} di-event · ${inActiveCount} aktif`}
						accent="sky"
					/>
				</KpiRow>
			)}

			{rows.length === 0 ? (
				<EmptyState
					icon={Camera}
					title={
						showDisposed
							? "Belum ada asset yang di-dispose"
							: "Belum ada aktiva tetap aktif"
					}
					description={
						showDisposed
							? "Asset yang sudah di-dispose (sold/scrapped) akan muncul di sini sebagai arsip."
							: "Tambah kamera/printer/lighting via Tambah Item → Aktiva Tetap."
					}
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
									{!showDisposed && (
										<th className="px-3 py-2.5 text-right font-medium">
											/Bulan
										</th>
									)}
									<th className="px-3 py-2.5 text-right font-medium">
										{showDisposed ? "Sale" : "Sisa"}
									</th>
									<th className="w-20 px-2 py-2.5" />
								</tr>
							</thead>
							<tbody>
								{rows.map((r, idx) => {
									const remainingMonths =
										r.useful_life_months && r.monthsElapsed
											? Math.max(
													0,
													r.useful_life_months - r.monthsElapsed,
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
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-medium">{r.name}</span>
														{r.isFullyDepreciated && !r.disposed_at && (
															<Badge
																variant="outline"
																className="h-4 bg-zinc-500/10 px-1 text-[9px] text-zinc-700 dark:text-zinc-300"
															>
																FULLY DEPRECIATED
															</Badge>
														)}
														{r.disposed_at && (
															<Badge
																variant="outline"
																className="h-4 bg-rose-500/10 px-1 text-[9px] text-rose-700 dark:text-rose-300"
															>
																{DISPOSAL_LABELS[
																	r.disposal_method ?? ""
																] ?? "DISPOSED"}
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
															{r.disposed_at &&
																` · disposed ${new Date(r.disposed_at).toLocaleDateString("id-ID")}`}
														</div>
													)}
												</div>
											</td>
											<td className="px-3 py-2.5 align-top">
												<div className="flex flex-col gap-1">
													{r.condition && !r.disposed_at && (
														<span
															className={`inline-flex h-4 w-max items-center rounded-full px-1.5 text-[9px] font-medium ${
																CONDITION_TONE[r.condition] ??
																CONDITION_TONE.normal
															}`}
														>
															{r.condition}
														</span>
													)}
													{r.location && !r.disposed_at && (
														<span className="text-[10px] text-muted-foreground">
															{LOCATION_LABELS[r.location] ?? r.location}
														</span>
													)}
													{r.event && !r.disposed_at && (
														<Link
															href={`/operations/${r.event.project_id}`}
															className="text-primary text-[10px] hover:underline"
														>
															@ {r.event.project_id}
														</Link>
													)}
													{r.disposed_at && (
														<span className="text-[10px] text-muted-foreground italic">
															archived
														</span>
													)}
												</div>
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top">
												{formatRupiah(r.purchase_price)}
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top text-rose-700 dark:text-rose-300">
												{r.accumulated > 0
													? formatRupiah(r.accumulated)
													: "—"}
											</td>
											<td className="tabular px-3 py-2.5 text-right align-top font-semibold text-emerald-700 dark:text-emerald-300">
												{formatRupiah(r.bookValue)}
											</td>
											{!showDisposed && (
												<td className="tabular px-3 py-2.5 text-right align-top text-muted-foreground">
													{r.monthly > 0 ? formatRupiah(r.monthly) : "—"}
												</td>
											)}
											<td className="tabular px-3 py-2.5 text-right align-top text-muted-foreground">
												{showDisposed
													? r.disposal_sale_price > 0
														? formatRupiah(r.disposal_sale_price)
														: "—"
													: r.depreciation_method === "straight_line" &&
															r.useful_life_months
														? `${remainingMonths}/${r.useful_life_months} bln`
														: "—"}
											</td>
											<td className="px-2 py-2.5 align-top">
												<div className="flex items-center justify-end gap-1">
													{!r.disposed_at && (
														<>
															<Link
																href={`/warehouse/items/${r.id}/edit`}
																className="text-muted-foreground hover:text-foreground hover:bg-surface-1 inline-flex size-7 items-center justify-center rounded-md"
																title="Edit asset"
															>
																<Pencil className="size-3.5" />
															</Link>
															<DisposeAssetDialog
																itemId={r.id}
																itemName={r.name}
																itemSku={r.sku}
																purchasePrice={r.purchase_price}
																bookValue={r.bookValue}
															/>
														</>
													)}
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{!showDisposed && rows.length > 0 && (
				<div className="bg-surface-1 rounded-md px-4 py-3 text-[12px] text-muted-foreground">
					<strong className="text-foreground">Tip:</strong> Klik{" "}
					<strong>Post Depresiasi</strong> di header tiap awal bulan untuk
					generate jurnal Dr 5-500 / Cr 1-401 otomatis. Idempotent — aman
					re-run bulan yang sama.
				</div>
			)}
		</Container>
	);
}
