import { redirect } from "next/navigation";
import { AssemblyEditor } from "@/components/assembly/assembly-editor";
import { getCurrentUser } from "@/lib/auth/get-user";
import { ASSEMBLY_FIELDS } from "@/lib/rekap/assembly-fields";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Resep Bahan" };

const FIELD_LABEL: Record<string, string> = {
	flashdisk_used: "Flashdisk (1 set)",
	pouch_used: "Pouch (cetak foto)",
	photomagnet_used: "Photomagnet",
	keychain_used: "Keychain",
};

export type AssemblyComponentRow = {
	id: string;
	component_sku: string;
	qty_per_unit: number;
};

export default async function AssemblyPage() {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "owner" && me.profile.role !== "super_admin") {
		redirect("/");
	}

	const sb = await createClient();
	const [{ data: rules }, { data: items }] = await Promise.all([
		sb
			.from("rekap_assembly_rules")
			.select("id, rekap_field, component_sku, qty_per_unit")
			.eq("is_active", true)
			.order("rekap_field")
			.order("sort_order"),
		sb
			.from("inventory_items")
			.select("sku, name")
			.eq("category", "inventory")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("sku"),
	]);

	const groups = ASSEMBLY_FIELDS.map((field) => ({
		field,
		label: FIELD_LABEL[field] ?? field,
		components: (
			(rules ?? []) as Array<AssemblyComponentRow & { rekap_field: string }>
		)
			.filter((r) => r.rekap_field === field)
			.map((r) => ({
				id: r.id,
				component_sku: r.component_sku,
				qty_per_unit: Number(r.qty_per_unit),
			})),
	}));

	const itemOptions = (
		(items ?? []) as Array<{ sku: string; name: string }>
	).map((i) => ({ sku: i.sku, name: i.name ?? "" }));

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-lg font-semibold">Resep Bahan (Assembly)</h1>
				<p className="text-sm text-muted-foreground">
					Atur "1 pemakaian di rekap = berapa item stok berkurang". Mis. 1
					flashdisk = Flashdisk + Box + Pouch. Perubahan langsung dipakai saat
					rekap di-approve.
				</p>
			</div>
			<AssemblyEditor groups={groups} items={itemOptions} />
		</div>
	);
}
