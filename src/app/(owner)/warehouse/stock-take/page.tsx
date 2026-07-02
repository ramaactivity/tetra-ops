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
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
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
	draft:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	committed:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	cancelled: "border-border-default bg-surface-3 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
	draft: "Sedang Dihitung",
	committed: "Selesai",
	cancelled: "Dibatalkan",
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
	// Satu query untuk list + KPI sekaligus (dulu dua query, yang kedua tanpa
	// limit hanya demi 3 angka KPI).
	const { data: takes } = await supabase
		.from("stock_takes")
		.select(
			`id, taken_at, notes, status, committed_at,
			 taken_by_user:users!stock_takes_taken_by_fkey(full_name),
			 lines:stock_take_lines(item_id, counted_qty, variance)`,
		)
		.order("taken_at", { ascending: false })
		.limit(100);

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

	const allRows = ((takes ?? []) as RawTake[]).map((t) => {
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

	const rows =
		filter === "all"
			? allRows
			: allRows.filter((r) =>
					filter === "active" ? r.status === "draft" : r.status === filter,
				);

	const draftCount = allRows.filter((t) => t.status === "draft").length;
	const lastCommitted = allRows.find((t) => t.status === "committed");
	const daysSinceLast = lastCommitted?.committed_at
		? Math.floor(
				(Date.now() - new Date(lastCommitted.committed_at).getTime()) /
					86_400_000,
			)
		: null;

	const counts = {
		active: draftCount,
		all: allRows.length,
		committed: allRows.filter((t) => t.status === "committed").length,
		cancelled: allRows.filter((t) => t.status === "cancelled").length,
	};

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Stock Opname"
				description="Hitung stok fisik di gudang dan cocokkan dengan catatan sistem. Kalau ada yang beda, stok otomatis disesuaikan mengikuti hitunganmu."
				actions={<NewStockTakeButton />}
			/>

			<KpiRow className="lg:grid-cols-3">
				<KpiCard
					label="Opname Terakhir"
					value={
						daysSinceLast === null
							? "Belum pernah"
							: daysSinceLast === 0
								? "Hari ini"
								: `${daysSinceLast} hari lalu`
					}
					hint={
						daysSinceLast !== null && daysSinceLast > 30
							? "sudah lewat sebulan — saatnya opname lagi"
							: daysSinceLast === null
								? "idealnya sebulan sekali"
								: `selesai ${formatDateID(lastCommitted?.committed_at ?? "")}`
					}
					icon={CheckCircle2}
					accent={
						daysSinceLast === null || daysSinceLast > 30 ? "amber" : "emerald"
					}
				/>
				<KpiCard
					label="Sedang Berjalan"
					value={draftCount.toLocaleString("id-ID")}
					hint={
						draftCount === 0
							? "tidak ada hitungan yang menggantung"
							: "lanjutkan dan selesaikan"
					}
					icon={Pencil}
					accent={draftCount > 0 ? "amber" : "default"}
				/>
				<KpiCard
					label="Selisih Terakhir"
					value={
						lastCommitted
							? `${lastCommitted.variance_lines.toLocaleString("id-ID")} item`
							: "—"
					}
					hint={
						lastCommitted
							? lastCommitted.variance_lines === 0
								? "semua cocok di opname terakhir"
								: "item yang jumlah fisiknya beda"
							: "belum ada opname selesai"
					}
					icon={ListChecks}
				/>
			</KpiRow>

			<StockTakeFilterTabs current={filter} counts={counts} />

			{rows.length === 0 ? (
				<EmptyState
					icon={ClipboardCheck}
					title={
						filter === "active"
							? "Tidak ada opname yang sedang berjalan"
							: filter === "committed"
								? "Belum ada opname yang selesai"
								: filter === "cancelled"
									? "Tidak ada opname yang dibatalkan"
									: "Belum pernah stock opname"
					}
					description="Klik Mulai Opname, lalu hitung jumlah fisik tiap barang di gudang. Riwayat yang sudah selesai bisa dilihat di tab Semua."
				/>
			) : (
				<>
					{/* Desktop / tablet table */}
					<div className="hidden overflow-hidden rounded-lg border border-border-default bg-card md:block">
						<table className="w-full text-sm">
							<thead className="border-b border-border-default bg-card">
								<tr className="text-left">
									<th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Tanggal
									</th>
									<th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Oleh
									</th>
									<th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Progress
									</th>
									<th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Selisih
									</th>
									<th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Status
									</th>
									<th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Aksi
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border-default/50">
								{rows.map((r) => (
									<tr
										key={r.id}
										className="transition-colors hover:bg-secondary/40"
									>
										<td className="px-5 py-3.5 align-middle">
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
										<td className="px-5 py-3.5 align-middle">
											<span className="text-fluid-caption text-muted-foreground">
												{r.taken_by_name}
											</span>
										</td>
										<td className="px-5 py-3.5 align-middle text-center">
											<ProgressCell
												audited={r.audited_lines}
												total={r.total_lines}
												isDraft={r.status === "draft"}
											/>
										</td>
										<td className="px-5 py-3.5 align-middle text-center">
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
										<td className="px-5 py-3.5 align-middle">
											<Badge
												variant="outline"
												className={STATUS_TONE[r.status] ?? ""}
											>
												{STATUS_LABEL[r.status] ?? r.status}
											</Badge>
										</td>
										<td className="px-5 py-3.5 align-middle text-right">
											<div className="inline-flex items-center gap-2">
												<Link
													href={`/warehouse/stock-take/${r.id}`}
													className="press-down inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 py-1 text-fluid-caption font-medium hover:bg-surface-3"
												>
													{r.status === "draft" ? "Lanjutkan" : "Lihat"}
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
					className="h-full rounded-full bg-[#059669] transition-all"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
