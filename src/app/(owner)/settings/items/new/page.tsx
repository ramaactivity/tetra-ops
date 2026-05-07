import { ChevronLeft } from "lucide-react";
import Link from "next/link";
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
			<div>
				<h2 className="text-xl font-semibold tracking-tight">New Item</h2>
				<p className="text-muted-foreground text-sm">
					Tambah consumable (sleeve, FD, mediaset) atau equipment (kamera,
					printer, light) ke master inventory.
				</p>
			</div>
			<div className="border-border bg-card max-w-3xl rounded-xl border p-5">
				<ItemForm mode="create" />
			</div>
		</div>
	);
}
