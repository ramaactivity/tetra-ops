import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PackageForm } from "@/components/packages/package-form";
import { createPackage } from "@/lib/actions/packages";

export default function NewPackagePage() {
	return (
		<Container size="lg" className="space-y-6">
			<div className="space-y-3">
				<Link
					href="/operations/packages"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
				>
					<ChevronLeft className="size-4" />
					Paket
				</Link>
				<div className="space-y-1">
					<span className="eyebrow text-muted-foreground">Pricelist baru</span>
					<h1 className="type-display text-foreground">Paket Baru</h1>
					<p className="type-secondary">
						Tambah paket baru ke pricelist Tetra.
					</p>
				</div>
			</div>

			<div className="border-border-default bg-card rounded-2xl border p-4 shadow-[var(--shadow-level-2)] sm:p-6">
				<PackageForm action={createPackage} submitLabel="Simpan Paket" />
			</div>
		</Container>
	);
}
