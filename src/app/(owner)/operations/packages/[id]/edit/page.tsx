import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { PackageForm } from "@/components/packages/package-form";
import { updatePackage } from "@/lib/actions/packages";
import { createClient } from "@/lib/supabase/server";

export default async function EditPackagePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const { data: pkg, error } = await supabase
		.from("packages")
		.select(
			"id, name, category, frame_size, duration_hours, base_price, description, is_active",
		)
		.eq("id", id)
		.is("deleted_at", null)
		.maybeSingle();

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat package: {error.message}
				</p>
			</div>
		);
	}

	if (!pkg) notFound();

	const action = updatePackage.bind(null, pkg.id);

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
					<span className="eyebrow text-muted-foreground">Edit paket</span>
					<h1 className="type-display text-foreground">{pkg.name}</h1>
					<p className="type-secondary">
						Perubahan harga TIDAK menyentuh booking yang sudah ada (event punya
						snapshot harga sendiri).
					</p>
				</div>
			</div>

			<div className="border-border-default bg-card rounded-2xl border p-4 shadow-[var(--shadow-level-2)] sm:p-6">
				<PackageForm
					action={action}
					submitLabel="Simpan Perubahan"
					defaults={{
						name: pkg.name,
						category: pkg.category as never,
						frame_size: pkg.frame_size as never,
						duration_hours: pkg.duration_hours,
						base_price: pkg.base_price,
						description: pkg.description ?? null,
						is_active: pkg.is_active,
					}}
				/>
			</div>
		</Container>
	);
}
