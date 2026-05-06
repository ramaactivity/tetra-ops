import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
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
		<div className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/settings/packages"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Packages
				</Link>
				<div>
					<h2 className="text-xl font-semibold tracking-tight">
						Edit: {pkg.name}
					</h2>
					<p className="text-muted-foreground text-sm">
						Perubahan harga TIDAK menyentuh booking yang sudah ada (event punya
						snapshot harga sendiri).
					</p>
				</div>
			</div>
			<div className="border-border bg-card rounded-xl border p-6">
				<PackageForm
					action={action}
					submitLabel="Save changes"
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
		</div>
	);
}
