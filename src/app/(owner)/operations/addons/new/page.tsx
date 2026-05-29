import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import {
	AddonForm,
	type InventoryItemOption,
} from "@/components/addons/addon-form";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { createAddon } from "@/lib/actions/addons";
import { createClient } from "@/lib/supabase/server";

export default async function NewAddonPage() {
	const supabase = await createClient();
	const { data: inventoryItems } = await supabase
		.from("inventory_items")
		.select("id, sku, name, unit")
		.eq("category", "inventory")
		.eq("is_active", true)
		.is("deleted_at", null)
		.order("sku", { ascending: true });

	return (
		<Container size="lg" className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/operations/addons"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Add-on
				</Link>
				<SectionHeader
					as="h1"
					title="Add-on Baru"
					description="Tambah add-on yang bisa dipilih saat booking."
				/>
			</div>
			<div className="border-border-default bg-surface-2 rounded-xl border p-6">
				<AddonForm
					action={createAddon}
					submitLabel="Simpan Add-on"
					inventoryItems={
						(inventoryItems ?? []) as InventoryItemOption[]
					}
				/>
			</div>
		</Container>
	);
}
