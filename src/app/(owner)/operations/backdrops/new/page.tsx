import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { BackdropForm } from "@/components/backdrops/backdrop-form";

export default function NewBackdropPage() {
	return (
		<Container size="lg" className="space-y-4">
			<Link
				href="/operations/backdrops"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Backdrop
			</Link>
			<SectionHeader
				as="h1"
				title="Backdrop Baru"
				description="Tambah backdrop ke katalog supaya muncul di booking form."
			/>
			<div className="border-border-default bg-surface-2 max-w-2xl rounded-xl border p-5">
				<BackdropForm mode="create" />
			</div>
		</Container>
	);
}
