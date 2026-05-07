import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { ItemsImportForm } from "@/components/items/import-form";

export default function ItemsImportPage() {
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
				<h2 className="text-xl font-semibold tracking-tight">
					Bulk Import Items
				</h2>
				<p className="text-muted-foreground text-sm">
					Tempel CSV dari Google Sheets / Excel. SKU yang sudah ada akan
					di-update, yang baru di-insert. Validation per baris — error tidak
					menghentikan proses.
				</p>
			</div>
			<div className="border-border bg-card max-w-4xl rounded-xl border p-5">
				<ItemsImportForm />
			</div>
		</div>
	);
}
