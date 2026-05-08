import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { BackdropForm } from "@/components/backdrops/backdrop-form";

export default function NewBackdropPage() {
	return (
		<div className="space-y-4">
			<Link
				href="/settings/backdrops"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Backdrops
			</Link>
			<SectionHeader
				as="h2"
				title="New Backdrop"
				description="Tambah backdrop ke katalog supaya muncul di booking form."
			/>
			<div className="border-border-default bg-surface-2 max-w-2xl rounded-xl border p-5">
				<BackdropForm mode="create" />
			</div>
		</div>
	);
}
