import { AlertTriangle, CheckCircle2, TrendingUp, XCircle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { Badge } from "@/components/ui/badge";
import { AssetCheckActions } from "@/components/warehouse/asset-check-actions";
import type { AssetCheckRow } from "@/components/warehouse/asset-check-line-row";
import { AssetCheckList } from "@/components/warehouse/asset-check-list";
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
	draft: "Sedang Dicek",
	committed: "Selesai",
	cancelled: "Dibatalkan",
};

export default async function AssetCheckDetailPage({
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
	const { data: check } = await supabase
		.from("asset_checks")
		.select(
			`id, taken_at, notes, status, committed_at,
			 checked_by_user:users!asset_checks_checked_by_fkey(full_name)`,
		)
		.eq("id", id)
		.maybeSingle();

	if (!check) notFound();

	const { data: lines } = await supabase
		.from("asset_check_lines")
		.select(
			`check_id, item_id, result, notes,
			 item:inventory_items(id, sku, name, deleted_at, is_active,
			   config:items_fixed_asset_config(asset_number, serial_number, condition, current_location))`,
		)
		.eq("check_id", id);

	type RawCfg = {
		asset_number: string | null;
		serial_number: string | null;
		condition: string | null;
		current_location: string | null;
	};
	type RawItem = {
		id: string;
		sku: string;
		name: string;
		deleted_at: string | null;
		is_active: boolean | null;
		config: RawCfg | RawCfg[] | null;
	};
	type RawLine = {
		check_id: string;
		item_id: string;
		result: string | null;
		notes: string | null;
		item: RawItem | RawItem[] | null;
	};

	const rows: AssetCheckRow[] = ((lines ?? []) as RawLine[])
		.map((l): AssetCheckRow | null => {
			const it = Array.isArray(l.item) ? l.item[0] : l.item;
			if (!it) return null;
			if (it.deleted_at || it.is_active === false) return null;
			const cfg = Array.isArray(it.config) ? it.config[0] : it.config;
			const result =
				l.result === "ada" || l.result === "rusak" || l.result === "hilang"
					? l.result
					: null;
			return {
				check_id: l.check_id,
				item_id: l.item_id,
				result,
				notes: l.notes,
				item: {
					id: it.id,
					sku: it.sku,
					name: it.name,
					asset_number: cfg?.asset_number ?? null,
					serial_number: cfg?.serial_number ?? null,
					condition: cfg?.condition ?? null,
					current_location: cfg?.current_location ?? null,
				},
			};
		})
		.filter((r): r is AssetCheckRow => r !== null);

	const totalLines = rows.length;
	const checkedLines = rows.filter((r) => r.result !== null).length;
	const rusakCount = rows.filter((r) => r.result === "rusak").length;
	const hilangCount = rows.filter((r) => r.result === "hilang").length;
	const progressPct =
		totalLines === 0 ? 0 : Math.round((checkedLines / totalLines) * 100);

	const u = Array.isArray(check.checked_by_user)
		? check.checked_by_user[0]
		: check.checked_by_user;
	const editable = check.status === "draft";

	return (
		<Container size="xl" className="space-y-3 pb-24">
			<PageHeader
				title={`Cek Alat · ${formatDateID(check.taken_at)}`}
				backHref="/warehouse/asset-check"
				backLabel="Cek Alat"
				description={
					<span className="flex flex-wrap items-center gap-2">
						<span>Oleh {u?.full_name ?? "—"}</span>
						<span className="text-muted-foreground/40">·</span>
						<Badge
							variant="outline"
							className={STATUS_TONE[check.status] ?? ""}
						>
							{STATUS_LABEL[check.status] ?? check.status}
						</Badge>
						{check.committed_at && (
							<>
								<span className="text-muted-foreground/40">·</span>
								<span>selesai {formatDateID(check.committed_at)}</span>
							</>
						)}
					</span>
				}
			/>

			<KpiRow className="lg:grid-cols-4">
				<KpiCard
					label="Sudah Dicek"
					value={`${checkedLines}/${totalLines}`}
					hint={`${progressPct}% progress`}
					icon={TrendingUp}
					accent={
						progressPct === 100
							? "emerald"
							: progressPct > 0
								? "amber"
								: "default"
					}
				/>
				<KpiCard
					label="Rusak"
					value={rusakCount.toLocaleString("id-ID")}
					hint={
						rusakCount > 0
							? "perlu servis / perbaikan"
							: "tidak ada (sejauh ini)"
					}
					icon={AlertTriangle}
					accent={rusakCount > 0 ? "amber" : "emerald"}
				/>
				<KpiCard
					label="Hilang"
					value={hilangCount.toLocaleString("id-ID")}
					hint={
						hilangCount > 0
							? "tidak ketemu — cek lokasi & crew"
							: "tidak ada (sejauh ini)"
					}
					icon={XCircle}
					accent={hilangCount > 0 ? "rose" : "emerald"}
				/>
				<KpiCard
					label="Status"
					value={STATUS_LABEL[check.status] ?? check.status}
					icon={CheckCircle2}
					accent={
						check.status === "committed"
							? "emerald"
							: check.status === "cancelled"
								? "default"
								: "amber"
					}
				/>
			</KpiRow>

			{check.notes ? (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 text-fluid-caption">
					<span className="font-medium text-muted-foreground">Catatan:</span>{" "}
					{check.notes}
				</div>
			) : null}

			<AssetCheckList rows={rows} editable={editable} />

			{editable && (
				<AssetCheckActions
					checkId={check.id}
					checkedCount={checkedLines}
					totalLines={totalLines}
					rusakCount={rusakCount}
					hilangCount={hilangCount}
				/>
			)}
		</Container>
	);
}
