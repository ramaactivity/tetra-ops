import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
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
				<SectionHeader
					as="h2"
					title="New Add-on"
					description="Tambah add-on yang bisa dipilih saat booking."
				/>
			</div>
			<div className="border-border-default bg-surface-2 rounded-xl border p-6">
				<AddonForm action={createAddon} submitLabel="Create add-on" />
			</div>
		</div>
	);
}
