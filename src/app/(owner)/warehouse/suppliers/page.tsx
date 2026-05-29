import { Truck } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { NewSupplierButton } from "@/components/warehouse/suppliers/new-supplier-button";
import {
	SuppliersTable,
	type SupplierRow,
} from "@/components/warehouse/suppliers/suppliers-table";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export default async function SuppliersPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/warehouse");
	}

	const supabase = await createClient();
	const { data: suppliers } = await supabase
		.from("suppliers")
		.select(
			"id, name, category, contact, default_payment_term, default_top_days, notes, is_active, deleted_at, created_at",
		)
		.is("deleted_at", null)
		.order("name", { ascending: true });

	const { data: priceCounts } = await supabase
		.from("supplier_prices")
		.select("supplier_id");
	const priceCountMap = new Map<string, number>();
	for (const row of (priceCounts ?? []) as Array<{ supplier_id: string }>) {
		priceCountMap.set(
			row.supplier_id,
			(priceCountMap.get(row.supplier_id) ?? 0) + 1,
		);
	}

	const { data: primaryCounts } = await supabase
		.from("supplier_prices")
		.select("supplier_id")
		.eq("is_primary", true);
	const primaryCountMap = new Map<string, number>();
	for (const row of (primaryCounts ?? []) as Array<{ supplier_id: string }>) {
		primaryCountMap.set(
			row.supplier_id,
			(primaryCountMap.get(row.supplier_id) ?? 0) + 1,
		);
	}

	const rows: SupplierRow[] = ((suppliers ?? []) as SupplierRow[]).map((s) => ({
		...s,
		item_count: priceCountMap.get(s.id) ?? 0,
		primary_count: primaryCountMap.get(s.id) ?? 0,
	}));

	const activeCount = rows.filter((r) => r.is_active).length;
	const primaryTotal = Array.from(primaryCountMap.values()).reduce(
		(a, b) => a + b,
		0,
	);
	const totalLinks = Array.from(priceCountMap.values()).reduce(
		(a, b) => a + b,
		0,
	);

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Supplier"
				description="Master vendor — default term pembayaran (Cash / TOP N) terpakai saat catat Pembelian."
				actions={<NewSupplierButton />}
			/>

			<KpiRow className="lg:grid-cols-3">
				<KpiCard
					label="Supplier Aktif"
					value={activeCount.toLocaleString("id-ID")}
					hint={`${rows.length - activeCount} non-aktif`}
					icon={Truck}
					accent="primary"
				/>
				<KpiCard
					label="Total Entries (Market List)"
					value={totalLinks.toLocaleString("id-ID")}
					hint="kombinasi supplier × bahan"
					accent="sky"
				/>
				<KpiCard
					label="Primary Set"
					value={primaryTotal.toLocaleString("id-ID")}
					hint="bahan dengan ⭐ supplier utama"
					accent="emerald"
				/>
			</KpiRow>

			<SuppliersTable rows={rows} />
		</Container>
	);
}
