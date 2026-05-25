import { Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
	type WastageRow,
	WastageListTable,
} from "@/components/warehouse/wastage/wastage-list-table";
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
		reporter: Array.isArray(r.reporter)
			? (r.reporter[0] ?? null)
			: r.reporter,
	}));

	return (
		<Container size="xl" className="space-y-5">
			<PageHeader
				title="Wastage Log"
				backHref="/warehouse"
				backLabel="Warehouse"
				description="Catatan barang habis pakai yang keluar karena bukan konsumsi event normal — testing, defective, handling damage, opname shortage."
				actions={
					<Link
						href="/warehouse/wastage/new"
						className={buttonVariants({ variant: "default", size: "sm" })}
					>
						<Plus className="size-4" />
						Catat Wastage
					</Link>
				}
			/>

			<WastageListTable rows={rows} />
		</Container>
	);
}
