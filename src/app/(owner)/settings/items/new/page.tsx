import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { ItemForm } from "@/components/items/item-form";

export default function NewItemPage() {
	return (
		<div className="space-y-4">
			<Link
				href="/settings/items"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Items
			</Link>
			<SectionHeader
				as="h2"
				title="New Item"
				description="Tambah consumable (sleeve, FD, mediaset) atau equipment (kamera, printer, light) ke master inventory."
			/>
			<div className="border-border-default bg-surface-2 max-w-3xl rounded-xl border p-5">
				<ItemForm mode="create" />
			</div>
		</div>
	);
}
