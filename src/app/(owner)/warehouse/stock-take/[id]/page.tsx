import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { StockTakeActions } from "@/components/warehouse/stock-take-actions";
import { StockTakeLineRow } from "@/components/warehouse/stock-take-line-row";
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

export default async function StockTakeDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/warehouse");
	}

	const { id } = await params;

	const supabase = await createClient();
	const { data: take } = await supabase
		.from("stock_takes")
		.select(
			`id, taken_at, notes, status, committed_at,
			 taken_by_user:users!stock_takes_taken_by_fkey(full_name)`,
		)
		.eq("id", id)
		.maybeSingle();

	if (!take) notFound();

	const { data: lines } = await supabase
		.from("stock_take_lines")
		.select(
			`stock_take_id, item_id, system_qty, counted_qty, variance, notes,
			 item:inventory_items(id, sku, name, category, unit)`,
		)
		.eq("stock_take_id", id);

	type ItemRef = {
		id: string;
		sku: string;
		name: string;
		category: string;
		unit: string;
	};
	type RawLine = {
		stock_take_id: string;
		item_id: string;
		system_qty: number;
		counted_qty: number;
		variance: number;
		notes: string | null;
		item: ItemRef | ItemRef[] | null;
	};
	type FlatRow = {
		line: Omit<RawLine, "item">;
		item: ItemRef;
	};

	const rows: FlatRow[] = ((lines ?? []) as RawLine[])
		.map((l): FlatRow | null => {
			const it = Array.isArray(l.item) ? l.item[0] : l.item;
			if (!it) return null;
			const { item: _omitted, ...rest } = l;
			return { line: rest, item: it };
		})
		.filter((r): r is FlatRow => r !== null)
		.sort((a, b) => {
			const aVar = Math.abs(a.line.variance);
			const bVar = Math.abs(b.line.variance);
			if (aVar !== bVar) return bVar - aVar;
			if (a.item.category !== b.item.category)
				return a.item.category.localeCompare(b.item.category);
			return a.item.sku.localeCompare(b.item.sku);
		});

	const varianceCount = rows.filter((r) => r.line.variance !== 0).length;
	const totalLines = rows.length;

	const u = Array.isArray(take.taken_by_user)
		? take.taken_by_user[0]
		: take.taken_by_user;
	const editable = take.status === "draft";

	return (
		<Container size="xl" className="space-y-6">
			<Link
				href="/warehouse/stock-take"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Stock Take
			</Link>
			<SectionHeader
				title={`Stock Take · ${formatDateID(take.taken_at)}`}
				description={
					<span className="flex flex-wrap items-center gap-2">
						<span>By {u?.full_name ?? "—"}</span>
						<span className="text-muted-foreground/40">·</span>
						<Badge
							variant="outline"
							className={STATUS_TONE[take.status] ?? ""}
						>
							{STATUS_LABEL[take.status] ?? take.status}
						</Badge>
						{take.committed_at && (
							<>
								<span className="text-muted-foreground/40">·</span>
								<span>committed {formatDateID(take.committed_at)}</span>
							</>
						)}
					</span>
				}
				actions={
					editable ? (
						<StockTakeActions
							stockTakeId={take.id}
							varianceCount={varianceCount}
						/>
					) : undefined
				}
			/>

			<div className="grid gap-3 sm:grid-cols-3">
				<StatTile label="Total Items" value={totalLines} />
				<StatTile
					label="Variance"
					value={varianceCount}
					tone={varianceCount > 0 ? "warn" : "ok"}
					hint={
						varianceCount > 0
							? "akan jadi adjustment movements"
							: "stok fisik = sistem"
					}
				/>
				<StatTile
					label="Status"
					value={STATUS_LABEL[take.status] ?? take.status}
				/>
			</div>

			{take.notes ? (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 text-fluid-caption">
					<span className="font-medium text-muted-foreground">Notes:</span>{" "}
					{take.notes}
				</div>
			) : null}

			{rows.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-8 text-center">
					<p className="text-fluid-body text-muted-foreground">
						Belum ada items di stock take ini.
					</p>
				</div>
			) : (
				<div className="overflow-hidden rounded-lg border border-border-default bg-surface-2">
					<table className="w-full text-sm">
						<thead className="border-b border-border-default bg-surface-3/40">
							<tr className="text-left">
								<th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Item
								</th>
								<th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Sistem
								</th>
								<th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Hitung Fisik
								</th>
								<th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Selisih
								</th>
								<th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Catatan
								</th>
								{editable && (
									<th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Save
									</th>
								)}
							</tr>
						</thead>
						<tbody className="divide-y divide-border-default/50">
							{rows.map((r) => (
								<StockTakeLineRow
									key={r.line.item_id}
									line={r.line}
									item={r.item}
									editable={editable}
								/>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Container>
	);
}

function StatTile({
	label,
	value,
	hint,
	tone = "default",
}: {
	label: string;
	value: number | string;
	hint?: string;
	tone?: "default" | "ok" | "warn";
}) {
	const valueColor =
		tone === "ok"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "warn"
				? "text-amber-600 dark:text-amber-400"
				: "text-foreground";
	return (
		<div className="rounded-lg border border-border-default bg-surface-2 p-4">
			<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className={`tabular text-2xl font-bold ${valueColor}`}>{value}</div>
			{hint ? (
				<div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
			) : null}
		</div>
	);
}
