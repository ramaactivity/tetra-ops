import { CalendarClock, ClipboardList, Plus, Wallet2 } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	WastageListTable,
	type WastageRow,
} from "@/components/warehouse/wastage/wastage-list-table";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function WastageListPage() {
	const supabase = await createClient();

	const { data } = await supabase
		.from("wastage_logs")
		.select(
			`id, ref_id, qty_base, reason, reason_detail, cost_at_time, evidence_url, created_at,
			 item:inventory_items!wastage_logs_item_id_fkey(id, sku, name, unit),
			 supplier:suppliers!wastage_logs_supplier_id_fkey(id, name),
			 event:events!wastage_logs_event_id_fkey(id, project_id, client_name),
			 reporter:users!wastage_logs_reported_by_fkey(id, full_name)`,
		)
		.order("created_at", { ascending: false })
		.limit(500);

	type Raw = {
		id: string;
		ref_id: string;
		qty_base: number | string;
		reason: string;
		reason_detail: string | null;
		cost_at_time: number | string | null;
		evidence_url: string | null;
		created_at: string;
		item:
			| { id: string; sku: string; name: string; unit: string }
			| Array<{ id: string; sku: string; name: string; unit: string }>
			| null;
		supplier:
			| { id: string; name: string }
			| Array<{ id: string; name: string }>
			| null;
		event:
			| { id: string; project_id: string; client_name: string }
			| Array<{ id: string; project_id: string; client_name: string }>
			| null;
		reporter:
			| { id: string; full_name: string }
			| Array<{ id: string; full_name: string }>
			| null;
	};

	const rows: WastageRow[] = ((data ?? []) as Raw[]).map((r) => ({
		id: r.id,
		ref_id: r.ref_id,
		qty_base: Number(r.qty_base),
		reason: r.reason,
		reason_detail: r.reason_detail,
		cost_at_time: Number(r.cost_at_time ?? 0),
		evidence_url: r.evidence_url,
		created_at: r.created_at,
		item: Array.isArray(r.item) ? (r.item[0] ?? null) : r.item,
		supplier: Array.isArray(r.supplier) ? (r.supplier[0] ?? null) : r.supplier,
		event: Array.isArray(r.event) ? (r.event[0] ?? null) : r.event,
		reporter: Array.isArray(r.reporter) ? (r.reporter[0] ?? null) : r.reporter,
	}));

	const totalCost = rows.reduce((s, r) => s + (r.cost_at_time ?? 0), 0);
	const now = new Date();
	const monthRows = rows.filter((r) => {
		const d = new Date(r.created_at);
		return (
			d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
		);
	});
	const monthCost = monthRows.reduce((s, r) => s + (r.cost_at_time ?? 0), 0);

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Wastage Log"
				description="Catatan barang habis pakai yang keluar karena bukan konsumsi event normal — testing, defective, handling damage, opname shortage."
				actions={
					<Link
						href="/warehouse/wastage/new"
						className={buttonVariants({ variant: "default", className: "h-9" })}
					>
						<Plus className="size-4" />
						Catat Wastage
					</Link>
				}
			/>

			<KpiRow className="lg:grid-cols-3">
				<KpiCard
					label="Total Wastage (500 terakhir)"
					value={formatRupiah(totalCost)}
					hint="akumulasi cost_at_time semua log"
					icon={Wallet2}
					accent="rose"
				/>
				<KpiCard
					label="Bulan Ini"
					value={formatRupiah(monthCost)}
					hint={`${monthRows.length} log bulan berjalan`}
					icon={CalendarClock}
					accent="amber"
				/>
				<KpiCard
					label="Jumlah Log"
					value={rows.length.toLocaleString("id-ID")}
					hint="total catatan wastage tercatat"
					icon={ClipboardList}
				/>
			</KpiRow>

			{rows.length === 0 ? (
				<EmptyState
					icon={ClipboardList}
					title="Belum ada wastage"
					description="Klik Catat Wastage untuk record barang yang keluar di luar konsumsi event normal — testing, defective, atau handling damage."
				/>
			) : (
				<WastageListTable rows={rows} />
			)}
		</Container>
	);
}
