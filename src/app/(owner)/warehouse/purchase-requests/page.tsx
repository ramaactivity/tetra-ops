import {
	AlertTriangle,
	CheckCircle2,
	ClipboardList,
	Package,
} from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	NewPRButton,
	type PRItemOption,
} from "@/components/warehouse/purchase-requests/new-pr-button";
import {
	PRStatusTabs,
	type PRStatusFilter,
} from "@/components/warehouse/purchase-requests/pr-status-tabs";
import {
	PRTable,
	type PRRow,
} from "@/components/warehouse/purchase-requests/pr-table";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const VALID_FILTERS: PRStatusFilter[] = [
	"open",
	"partial",
	"completed",
	"cancelled",
	"all",
];

export default async function PurchaseRequestsPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (
		me.profile.role !== "super_admin" &&
		me.profile.role !== "owner" &&
		me.profile.role !== "crew"
	) {
		redirect("/warehouse");
	}

	const { filter: filterRaw } = await searchParams;
	const filter = (
		VALID_FILTERS.includes(filterRaw as PRStatusFilter)
			? filterRaw
			: "open"
	) as PRStatusFilter;

	const supabase = await createClient();

	const { data: itemsForPR } = await supabase
		.from("inventory_items")
		.select("id, sku, name, unit")
		.eq("category", "inventory")
		.is("deleted_at", null)
		.eq("is_active", true)
		.order("name");
	const prItemOptions = (itemsForPR ?? []) as PRItemOption[];

	let q = supabase
		.from("purchase_requests")
		.select(
			`id, status, notes, created_at, updated_at, completed_at, requested_by,
			 requester:users!purchase_requests_requested_by_fkey(full_name),
			 items:purchase_request_items(
				 id, item_id, qty_requested, qty_received, unit, notes,
				 item:inventory_items!purchase_request_items_item_id_fkey(name, sku)
			 )`,
		)
		.order("created_at", { ascending: false })
		.limit(100);

	if (filter !== "all") q = q.eq("status", filter);
	const { data: prs } = await q;

	const rows: PRRow[] = ((prs ?? []) as Array<{
		id: string;
		status: string;
		notes: string | null;
		created_at: string;
		updated_at: string;
		completed_at: string | null;
		requested_by: string;
		requester:
			| { full_name: string | null }
			| { full_name: string | null }[]
			| null;
		items: Array<{
			id: string;
			item_id: string;
			qty_requested: number | string;
			qty_received: number | string;
			unit: string;
			notes: string | null;
			item:
				| { name: string; sku: string }
				| { name: string; sku: string }[]
				| null;
		}>;
	}>).map((r) => {
		const requester = Array.isArray(r.requester)
			? r.requester[0]
			: r.requester;
		const items = (r.items ?? []).map((it) => {
			const itm = Array.isArray(it.item) ? it.item[0] : it.item;
			return {
				id: it.id,
				item_id: it.item_id,
				item_name: itm?.name ?? "—",
				item_sku: itm?.sku ?? "—",
				qty_requested: Number(it.qty_requested),
				qty_received: Number(it.qty_received),
				unit: it.unit,
				notes: it.notes,
			};
		});
		const totalReq = items.reduce((s, i) => s + i.qty_requested, 0);
		const totalRec = items.reduce(
			(s, i) => s + Math.min(i.qty_received, i.qty_requested),
			0,
		);
		const outstanding = items.filter(
			(i) => i.qty_received < i.qty_requested,
		).length;
		return {
			id: r.id,
			status: r.status,
			notes: r.notes,
			created_at: r.created_at,
			completed_at: r.completed_at,
			requester_name: requester?.full_name ?? "—",
			items,
			total_requested: totalReq,
			total_received: totalRec,
			outstanding_lines: outstanding,
		};
	});

	// Full counts for tabs + KPIs (separate query so filter doesn't affect)
	const { data: allPrs } = await supabase
		.from("purchase_requests")
		.select(
			"id, status, created_at, completed_at, items:purchase_request_items(qty_requested, qty_received)",
		);

	type AllRow = {
		id: string;
		status: string;
		created_at: string;
		completed_at: string | null;
		items: Array<{ qty_requested: number | string; qty_received: number | string }> | null;
	};
	const all = (allPrs ?? []) as AllRow[];
	const counts = {
		open: all.filter((p) => p.status === "open").length,
		partial: all.filter((p) => p.status === "partial").length,
		completed: all.filter((p) => p.status === "completed").length,
		cancelled: all.filter((p) => p.status === "cancelled").length,
		all: all.length,
	};
	const now = Date.now();
	const stale = all.filter(
		(p) =>
			(p.status === "open" || p.status === "partial") &&
			(now - new Date(p.created_at).getTime()) / 1000 / 86400 > 3,
	).length;
	const thisMonth = all.filter((p) => {
		if (p.status !== "completed" || !p.completed_at) return false;
		const d = new Date(p.completed_at);
		const n = new Date();
		return (
			d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
		);
	}).length;
	const openOutstandingLines = all.reduce((sum, p) => {
		if (p.status !== "open" && p.status !== "partial") return sum;
		const outs = (p.items ?? []).filter(
			(it) => Number(it.qty_received) < Number(it.qty_requested),
		).length;
		return sum + outs;
	}, 0);

	const canCreate =
		me.profile.role === "super_admin" ||
		me.profile.role === "owner" ||
		me.profile.role === "crew";
	const canReceive =
		me.profile.role === "super_admin" || me.profile.role === "owner";

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Permintaan Belanja"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Crew minta belanja → owner terima sebagian / penuh. Aging > 3 hari ditandai sebagai tertunda."
				actions={canCreate ? <NewPRButton items={prItemOptions} /> : undefined}
			/>

			<KpiRow className="lg:grid-cols-4">
				<KpiCard
					label="Open + Partial"
					value={(counts.open + counts.partial).toLocaleString("id-ID")}
					hint={`${openOutstandingLines} item belum diterima`}
					icon={ClipboardList}
					accent={counts.open + counts.partial > 0 ? "amber" : "default"}
				/>
				<KpiCard
					label="Aging > 3 Hari"
					value={stale.toLocaleString("id-ID")}
					hint="PR open yang perlu segera ditindaklanjuti"
					icon={AlertTriangle}
					accent={stale > 0 ? "rose" : "default"}
				/>
				<KpiCard
					label="Selesai Bulan Ini"
					value={thisMonth.toLocaleString("id-ID")}
					hint="status completed bulan berjalan"
					icon={CheckCircle2}
					accent="emerald"
				/>
				<KpiCard
					label="Total Lifetime"
					value={counts.all.toLocaleString("id-ID")}
					hint={`${counts.completed} selesai · ${counts.cancelled} dibatalkan`}
					icon={Package}
				/>
			</KpiRow>

			<PRStatusTabs current={filter} counts={counts} />

			{rows.length === 0 ? (
				<EmptyState
					icon={ClipboardList}
					title={
						filter === "open"
							? "Tidak ada PR open"
							: filter === "partial"
								? "Tidak ada PR partial"
								: filter === "completed"
									? "Belum ada PR completed"
									: filter === "cancelled"
										? "Tidak ada PR dibatalkan"
										: "Belum ada permintaan belanja"
					}
					description="Crew bisa klik Buat Permintaan untuk request belanja baru."
				/>
			) : (
				<PRTable rows={rows} canReceive={canReceive} />
			)}
		</Container>
	);
}
