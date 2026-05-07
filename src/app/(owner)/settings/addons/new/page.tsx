import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { AddonForm } from "@/components/addons/addon-form";
import { createAddon } from "@/lib/actions/addons";

export default function NewAddonPage() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/settings/addons"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Add-ons
				</Link>
				<div>
					<h2 className="text-xl font-semibold tracking-tight">New Add-on</h2>
					<p className="text-muted-foreground text-sm">
						Tambah add-on yang bisa dipilih saat booking.
					</p>
				</div>
			</div>
			<div className="border-border bg-card rounded-xl border p-6">
				<AddonForm action={createAddon} submitLabel="Create add-on" />
			</div>
		</div>
	);
}
