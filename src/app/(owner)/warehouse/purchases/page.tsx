import { ShoppingCart, Wallet2 } from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type {
	PembelianItemOption,
	PembelianSupplierOption,
} from "@/components/warehouse/pembelian/pembelian-dialog";
import { PembelianDialog } from "@/components/warehouse/pembelian/pembelian-dialog";
import {
	type PurchaseRow,
	PurchasesList,
} from "@/components/warehouse/pembelian/purchases-list";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export default async function PurchasesPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/warehouse");
	}

	const supabase = await createClient();

	const [purchasesRes, itemsRes, suppliersRes] = await Promise.all([
		supabase
			.from("stock_movements")
			.select(
				`id, ref_id, item_id, quantity, unit_cost, notes, created_at, supplier_id,
				 item:inventory_items!stock_movements_item_id_fkey(name, sku, unit),
				 supplier:suppliers!stock_movements_supplier_id_fkey(name)`,
			)
			.eq("source", "purchase")
			.order("created_at", { ascending: false })
			.limit(200),
		supabase
			.from("inventory_items")
			.select(
				`id, sku, name, unit, unit_conversion,
				 config:items_inventory_config!inner(preferred_supplier_id,
				   supplier:suppliers!items_inventory_config_preferred_supplier_id_fkey(name))`,
			)
			.eq("category", "inventory")
			.is("deleted_at", null)
			.eq("is_active", true)
			.order("name"),
		supabase
			.from("suppliers")
			.select("id, name, default_payment_term, default_top_days")
			.is("deleted_at", null)
			.eq("is_active", true)
			.order("name"),
	]);

	type RawItem = {
		id: string;
		sku: string;
		name: string;
		unit: string;
		unit_conversion: Record<string, number> | null;
		config:
			| {
					preferred_supplier_id: string | null;
					supplier: { name: string } | Array<{ name: string }> | null;
			  }
			| Array<{
					preferred_supplier_id: string | null;
					supplier: { name: string } | Array<{ name: string }> | null;
			  }>
			| null;
	};
	const items: PembelianItemOption[] = ((itemsRes.data ?? []) as RawItem[]).map(
		(i) => {
			const cfg = Array.isArray(i.config) ? i.config[0] : i.config;
			const sup = Array.isArray(cfg?.supplier)
				? cfg?.supplier[0]
				: cfg?.supplier;
			return {
				id: i.id,
				sku: i.sku,
				name: i.name,
				unit: i.unit,
				unit_conversion: i.unit_conversion,
				preferred_supplier_id: cfg?.preferred_supplier_id ?? null,
				preferred_supplier_name: sup?.name ?? null,
			};
		},
	);
	const suppliers = (suppliersRes.data ?? []) as PembelianSupplierOption[];

	const rows: PurchaseRow[] = (
		(purchasesRes.data ?? []) as Array<{
			id: string;
			ref_id: string;
			item_id: string;
			quantity: number | string;
			unit_cost: number | null;
			notes: string | null;
			created_at: string;
			supplier_id: string | null;
			item:
				| { name: string; sku: string; unit: string }
				| { name: string; sku: string; unit: string }[]
				| null;
			supplier: { name: string } | { name: string }[] | null;
		}>
	).map((m) => {
		const item = Array.isArray(m.item) ? m.item[0] : m.item;
		const sup = Array.isArray(m.supplier) ? m.supplier[0] : m.supplier;
		const qty = Number(m.quantity);
		const cost = Number(m.unit_cost ?? 0);
		return {
			id: m.id,
			ref_id: m.ref_id,
			created_at: m.created_at,
			supplier_name: sup?.name ?? null,
			item_name: item?.name ?? "—",
			item_sku: item?.sku ?? "—",
			unit: item?.unit ?? "",
			quantity: qty,
			unit_cost: cost,
			subtotal: qty * cost,
			notes: m.notes,
		};
	});

	const totalSpent = rows.reduce((s, r) => s + r.subtotal, 0);
	const monthSpent = rows
		.filter((r) => {
			const d = new Date(r.created_at);
			const now = new Date();
			return (
				d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
			);
		})
		.reduce((s, r) => s + r.subtotal, 0);
	const uniqueSuppliers = new Set(
		rows.map((r) => r.supplier_name).filter(Boolean),
	).size;

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Pembelian"
				description="Riwayat pembelian stok. Klik Catat Pembelian untuk record belanja multi-item dalam satu transaksi."
				actions={
					<PembelianDialog
						trigger={
							<span
								className={buttonVariants({
									variant: "default",
									className: "h-9",
								})}
							>
								<ShoppingCart className="size-4" />
								Catat Pembelian
							</span>
						}
						items={items}
						suppliers={suppliers}
					/>
				}
			/>

			<KpiRow className="lg:grid-cols-3">
				<KpiCard
					label="Total Belanja (200 terakhir)"
					value={`Rp ${totalSpent.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint="akumulasi dari movements 'purchase'"
					icon={Wallet2}
					accent="primary"
				/>
				<KpiCard
					label="Bulan Ini"
					value={`Rp ${monthSpent.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint="pengeluaran stok bulan berjalan"
					accent="emerald"
				/>
				<KpiCard
					label="Supplier Aktif"
					value={uniqueSuppliers.toLocaleString("id-ID")}
					hint="unique supplier dari 200 movements terakhir"
				/>
			</KpiRow>

			{rows.length === 0 ? (
				<EmptyState
					icon={ShoppingCart}
					title="Belum ada pembelian"
					description="Klik Catat Pembelian untuk record belanja pertama. Setiap baris jadi 1 stock movement."
				/>
			) : (
				<PurchasesList rows={rows} />
			)}
		</Container>
	);
}
