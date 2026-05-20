import {
	CheckCircle2,
	ClipboardList,
	FileSearch,
	TrendingUp,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import {
	StockOpnameTable,
	type StockOpnameRow,
} from "@/components/warehouse/stock-opname-table";
import { StockTakeActions } from "@/components/warehouse/stock-take-actions";
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
			 item:inventory_items(id, sku, name, category, unit, unit_conversion, deleted_at, is_active)`,
		)
		.eq("stock_take_id", id);

	type ItemRef = {
		id: string;
		sku: string;
		name: string;
		category: string;
		unit: string;
		unit_conversion: Record<string, number> | null;
		deleted_at: string | null;
		is_active: boolean | null;
	};
	type RawLine = {
		stock_take_id: string;
		item_id: string;
		system_qty: number | string;
		counted_qty: number | string | null;
		variance: number | string | null;
		notes: string | null;
		item: ItemRef | ItemRef[] | null;
	};

	const rows: StockOpnameRow[] = ((lines ?? []) as RawLine[])
		.map((l): StockOpnameRow | null => {
			const it = Array.isArray(l.item) ? l.item[0] : l.item;
			if (!it) return null;
			// Defensive — drafts from before M5 may have lines pointing to archived
			// items. Hide them so the audit stays focused on active inventory.
			if (it.deleted_at || it.is_active === false) return null;
			const counted = l.counted_qty === null ? null : Number(l.counted_qty);
			const sys = Number(l.system_qty);
			const variance = counted === null ? null : counted - sys;
			return {
				stock_take_id: l.stock_take_id,
				item_id: l.item_id,
				system_qty: sys,
				counted_qty: counted,
				variance,
				notes: l.notes,
				item: {
					id: it.id,
					sku: it.sku,
					name: it.name,
					category: it.category,
					unit: it.unit,
					unit_conversion: it.unit_conversion,
				},
			};
		})
		.filter((r): r is StockOpnameRow => r !== null);

	const totalLines = rows.length;
	const auditedLines = rows.filter((r) => r.counted_qty !== null).length;
	const varianceLines = rows.filter(
		(r) => r.counted_qty !== null && r.variance !== 0,
	).length;
	const progressPct =
		totalLines === 0 ? 0 : Math.round((auditedLines / totalLines) * 100);

	const u = Array.isArray(take.taken_by_user)
		? take.taken_by_user[0]
		: take.taken_by_user;
	const editable = take.status === "draft";

	return (
		<Container size="xl" className="space-y-6 pb-24">
			<PageHeader
				title={`Stock Opname · ${formatDateID(take.taken_at)}`}
				backHref="/warehouse/stock-take"
				backLabel="Stock Opname"
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
			/>

			<KpiRow className="lg:grid-cols-4">
				<KpiCard
					label="Total Items"
					value={totalLines.toLocaleString("id-ID")}
					hint="SKU aktif di inventory"
					icon={ClipboardList}
				/>
				<KpiCard
					label="Sudah Dihitung"
					value={`${auditedLines}/${totalLines}`}
					hint={`${progressPct}% progress`}
					icon={TrendingUp}
					accent={
						progressPct === 100 ? "emerald" : progressPct > 0 ? "amber" : "default"
					}
				/>
				<KpiCard
					label="Ada Selisih"
					value={varianceLines.toLocaleString("id-ID")}
					hint={
						varianceLines > 0
							? "akan jadi adjustment movements"
							: "fisik = sistem (sejauh ini)"
					}
					icon={FileSearch}
					accent={varianceLines > 0 ? "amber" : "emerald"}
				/>
				<KpiCard
					label="Status"
					value={STATUS_LABEL[take.status] ?? take.status}
					icon={CheckCircle2}
					accent={
						take.status === "committed"
							? "emerald"
							: take.status === "cancelled"
								? "default"
								: "amber"
					}
				/>
			</KpiRow>

			{take.notes ? (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 text-fluid-caption">
					<span className="font-medium text-muted-foreground">Catatan:</span>{" "}
					{take.notes}
				</div>
			) : null}

			<StockOpnameTable rows={rows} editable={editable} />

			{editable && (
				<StockTakeActions
					stockTakeId={take.id}
					varianceCount={varianceLines}
					auditedCount={auditedLines}
					totalLines={totalLines}
				/>
			)}
		</Container>
	);
}
