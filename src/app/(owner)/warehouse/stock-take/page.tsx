import {
	CheckCircle2,
	ChevronRight,
	ClipboardCheck,
	ListChecks,
	Pencil,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteStockTakeButton } from "@/components/warehouse/delete-stock-take-button";
import { NewStockTakeButton } from "@/components/warehouse/new-stock-take-button";
import { StockTakeFilterTabs } from "@/components/warehouse/stock-take-filter-tabs";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const STATUS_TONE: Record<string, string> = {
	draft: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	committed:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	cancelled: "border-border-default bg-surface-3 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
	draft: "Draft",
	committed: "Committed",
	cancelled: "Cancelled",
};

type FilterKey = "active" | "all" | "committed" | "cancelled";

export default async function StockTakeListPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/warehouse");
	}

	const { filter: filterRaw } = await searchParams;
	const filter: FilterKey = (
		["active", "all", "committed", "cancelled"] as const
	).includes(filterRaw as FilterKey)
		? (filterRaw as FilterKey)
		: "active";

	const supabase = await createClient();
	let query = supabase
		.from("stock_takes")
		.select(
			`id, taken_at, notes, status, committed_at,
			 taken_by_user:users!stock_takes_taken_by_fkey(full_name),
			 lines:stock_take_lines(item_id, counted_qty, variance)`,
		)
		.order("taken_at", { ascending: false })
		.limit(100);

	if (filter === "active") query = query.eq("status", "draft");
	else if (filter === "committed") query = query.eq("status", "committed");
	else if (filter === "cancelled") query = query.eq("status", "cancelled");

	const { data: takes } = await query;

	type RawTake = {
		id: string;
		taken_at: string;
		notes: string | null;
		status: string;
		committed_at: string | null;
		taken_by_user:
			| { full_name: string | null }
			| Array<{ full_name: string | null }>
			| null;
		lines: Array<{
			item_id: string;
			counted_qty: number | string | null;
			variance: number | string | null;
		}> | null;
	};

	const rows = ((takes ?? []) as RawTake[]).map((t) => {
		const u = Array.isArray(t.taken_by_user)
			? t.taken_by_user[0]
			: t.taken_by_user;
		const lines = t.lines ?? [];
		const audited = lines.filter((l) => l.counted_qty !== null).length;
		const nonZero = lines.filter(
			(l) => l.counted_qty !== null && Number(l.variance ?? 0) !== 0,
		).length;
		return {
			id: t.id,
			taken_at: t.taken_at,
			notes: t.notes,
			status: t.status,
			committed_at: t.committed_at,
			taken_by_name: u?.full_name ?? "—",
			total_lines: lines.length,
			audited_lines: audited,
			variance_lines: nonZero,
		};
	});

	// KPI counters across the full set (not filtered, so user always sees real stats)
	const { data: allTakes } = await supabase
		.from("stock_takes")
		.select("status, committed_at, lines:stock_take_lines(variance, counted_qty)")
		.order("taken_at", { ascending: false });

	const allRows = (allTakes ?? []) as RawTake[];
	const draftCount = allRows.filter((t) => t.status === "draft").length;
	const committedCount = allRows.filter((t) => t.status === "committed").length;
	const totalAdjustments = allRows
		.filter((t) => t.status === "committed")
		.reduce((sum, t) => {
			const v = (t.lines ?? []).filter(
				(l) => l.counted_qty !== null && Number(l.variance ?? 0) !== 0,
			).length;
			return sum + v;
		}, 0);

	const counts = {
		active: draftCount,
		all: allRows.length,
		committed: committedCount,
		cancelled: allRows.filter((t) => t.status === "cancelled").length,
	};

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Stock Opname"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Audit fisik inventory. Owner walk warehouse, isi hitung fisik per item, lalu commit — sistem auto-create adjustment movement buat tiap selisih."
				actions={<NewStockTakeButton />}
			/>

			<KpiRow className="lg:grid-cols-3">
				<KpiCard
					label="Draft Aktif"
					value={draftCount.toLocaleString("id-ID")}
					hint={draftCount === 0 ? "tidak ada audit berjalan" : "audit belum di-commit"}
					icon={Pencil}
					accent={draftCount > 0 ? "amber" : "default"}
				/>
				<KpiCard
					label="Total Committed"
					value={committedCount.toLocaleString("id-ID")}
					hint="audit yang sudah jadi adjustment"
					icon={CheckCircle2}
					accent="emerald"
				/>
				<KpiCard
					label="Total Adjustments"
					value={totalAdjustments.toLocaleString("id-ID")}
					hint="stock movements dari opname"
					icon={ListChecks}
				/>
			</KpiRow>

			<StockTakeFilterTabs current={filter} counts={counts} />

			{rows.length === 0 ? (
				<EmptyState
					icon={ClipboardCheck}
					title={
						filter === "active"
							? "Tidak ada draft aktif"
							: filter === "committed"
								? "Belum ada opname yang committed"
								: filter === "cancelled"
									? "Tidak ada opname yang cancelled"
									: "Belum ada stock opname"
					}
					description="Klik Mulai Opname untuk audit fisik. Sistem akan seed semua SKU aktif — owner tinggal isi hitung fisik per item."
				/>
			) : (
				<>
					{/* Desktop / tablet table */}
					<div className="hidden overflow-hidden rounded-lg border border-border-default bg-surface-2 md:block">
						<table className="w-full text-sm">
							<thead className="border-b border-border-default bg-surface-3/40">
								<tr className="text-left">
									<th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Tanggal
									</th>
									<th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										By
									</th>
									<th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Progress
									</th>
									<th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Selisih
									</th>
									<th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Status
									</th>
									<th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Aksi
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border-default/50">
								{rows.map((r) => (
									<tr
										key={r.id}
										className="transition-colors hover:bg-muted/30"
									>
										<td className="px-4 py-3 align-middle">
											<div className="space-y-0.5">
												<div className="tabular text-fluid-caption font-medium text-foreground">
													{formatDateID(r.taken_at)}
												</div>
												{r.notes ? (
													<div className="line-clamp-1 max-w-xs text-[11px] italic text-muted-foreground">
														{r.notes}
													</div>
												) : null}
											</div>
										</td>
										<td className="px-4 py-3 align-middle">
											<span className="text-fluid-caption text-muted-foreground">
												{r.taken_by_name}
											</span>
										</td>
										<td className="px-4 py-3 align-middle text-center">
											<ProgressCell
												audited={r.audited_lines}
												total={r.total_lines}
												isDraft={r.status === "draft"}
											/>
										</td>
										<td className="px-4 py-3 align-middle text-center">
											{r.variance_lines > 0 ? (
												<Badge
													variant="outline"
													className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
												>
													{r.variance_lines}
												</Badge>
											) : (
												<span className="text-muted-foreground/40">—</span>
											)}
										</td>
										<td className="px-4 py-3 align-middle">
											<Badge
												variant="outline"
												className={STATUS_TONE[r.status] ?? ""}
											>
												{STATUS_LABEL[r.status] ?? r.status}
											</Badge>
										</td>
										<td className="px-4 py-3 align-middle text-right">
											<div className="inline-flex items-center gap-2">
												<Link
													href={`/warehouse/stock-take/${r.id}`}
													className="press-down inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 py-1 text-fluid-caption font-medium hover:bg-surface-3"
												>
													{r.status === "draft" ? "Edit" : "View"}
													<ChevronRight className="size-3.5" />
												</Link>
												{r.status === "cancelled" && (
													<DeleteStockTakeButton stockTakeId={r.id} />
												)}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Mobile card layout */}
					<div className="space-y-3 md:hidden">
						{rows.map((r) => (
							<Link
								key={r.id}
								href={`/warehouse/stock-take/${r.id}`}
								className="block rounded-lg border border-border-default bg-surface-2 p-3.5 active:bg-surface-3"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="tabular text-fluid-caption font-semibold text-foreground">
												{formatDateID(r.taken_at)}
											</span>
											<Badge
												variant="outline"
												className={STATUS_TONE[r.status] ?? ""}
											>
												{STATUS_LABEL[r.status] ?? r.status}
											</Badge>
										</div>
										<div className="text-[11px] text-muted-foreground">
											by {r.taken_by_name}
										</div>
										{r.notes ? (
											<div className="line-clamp-2 text-[11px] italic text-muted-foreground/80">
												{r.notes}
											</div>
										) : null}
									</div>
									<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
								</div>
								<div className="mt-3 flex items-center gap-4 border-t border-border-default/60 pt-2.5 text-[11px]">
									<div>
										<div className="text-muted-foreground">Progress</div>
										<div className="tabular font-medium text-foreground">
											{r.audited_lines}/{r.total_lines}
										</div>
									</div>
									<div>
										<div className="text-muted-foreground">Selisih</div>
										<div className="tabular font-medium text-foreground">
											{r.variance_lines > 0 ? r.variance_lines : "—"}
										</div>
									</div>
								</div>
							</Link>
						))}
					</div>
				</>
			)}
		</Container>
	);
}

function ProgressCell({
	audited,
	total,
	isDraft,
}: {
	audited: number;
	total: number;
	isDraft: boolean;
}) {
	if (!isDraft) {
		return (
			<span className="tabular text-fluid-caption text-muted-foreground">
				{total.toLocaleString("id-ID")}
			</span>
		);
	}
	const pct = total === 0 ? 0 : Math.round((audited / total) * 100);
	return (
		<div className="mx-auto flex w-32 flex-col gap-1">
			<div className="flex items-center justify-between text-[10px] tabular">
				<span className="font-medium text-foreground">
					{audited}/{total}
				</span>
				<span className="text-muted-foreground">{pct}%</span>
			</div>
			<div className="h-1 overflow-hidden rounded-full bg-surface-3">
				<div
					className="h-full rounded-full bg-primary transition-all"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
