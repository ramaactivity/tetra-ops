import { ChevronRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NewStockTakeButton } from "@/components/warehouse/new-stock-take-button";
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

export default async function StockTakeListPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/warehouse");
	}

	const supabase = await createClient();
	const { data: takes } = await supabase
		.from("stock_takes")
		.select(
			`id, taken_at, notes, status, committed_at,
			 taken_by_user:users!stock_takes_taken_by_fkey(full_name),
			 lines:stock_take_lines(item_id, variance)`,
		)
		.order("taken_at", { ascending: false })
		.limit(50);

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
		lines: Array<{ item_id: string; variance: number }> | null;
	};

	const rows = ((takes ?? []) as RawTake[]).map((t) => {
		const u = Array.isArray(t.taken_by_user) ? t.taken_by_user[0] : t.taken_by_user;
		const lines = t.lines ?? [];
		const nonZero = lines.filter((l) => l.variance !== 0).length;
		return {
			id: t.id,
			taken_at: t.taken_at,
			notes: t.notes,
			status: t.status,
			committed_at: t.committed_at,
			taken_by_name: u?.full_name ?? "—",
			total_lines: lines.length,
			variance_lines: nonZero,
		};
	});

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Stock Take"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Audit fisik inventory. Owner walk warehouse, isi counted qty per item, lalu commit — sistem auto-create adjustment movements buat tiap variance non-zero."
				actions={<NewStockTakeButton />}
			/>

			{rows.length === 0 ? (
				<EmptyState
					icon={ClipboardCheck}
					title="Belum ada stock take"
					description="Klik Stock Take Baru untuk mulai audit fisik. Sistem akan seed semua active items dengan system_qty saat ini."
				/>
			) : (
				<div className="overflow-hidden rounded-lg border border-border-default bg-surface-2">
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
									Lines
								</th>
								<th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Variance
								</th>
								<th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Status
								</th>
								<th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Action
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border-default/50">
							{rows.map((r) => (
								<tr key={r.id} className="hover:bg-muted/30 transition-colors">
									<td className="px-4 py-3 align-middle">
										<div className="space-y-0.5">
											<div className="tabular text-fluid-caption font-medium text-foreground">
												{formatDateID(r.taken_at)}
											</div>
											{r.notes ? (
												<div className="text-[11px] text-muted-foreground italic truncate max-w-xs">
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
									<td className="px-4 py-3 align-middle text-center tabular text-fluid-caption">
										{r.total_lines}
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
										<Link
											href={`/warehouse/stock-take/${r.id}`}
											className="press-down inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 py-1 text-fluid-caption font-medium hover:bg-surface-3"
										>
											{r.status === "draft" ? "Edit" : "View"}
											<ChevronRight className="size-3.5" />
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Container>
	);
}
