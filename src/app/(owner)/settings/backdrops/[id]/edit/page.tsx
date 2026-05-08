import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/section-header";
import { BackdropForm } from "@/components/backdrops/backdrop-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditBackdropPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: bg } = await supabase
		.from("backdrops")
		.select(
			"id, code, name, type, rental_price, display_order, description, is_active",
		)
		.eq("id", id)
		.maybeSingle();

	if (!bg) notFound();

	const defaults = {
		code: bg.code,
		name: bg.name,
		type: bg.type as "basic_included" | "rental_owned" | "vendor_decor",
		rental_price: String(bg.rental_price ?? 0),
		display_order: String(bg.display_order ?? 0),
		description: bg.description ?? "",
		is_active: !!bg.is_active,
	};

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
				title={`Edit: ${bg.name}`}
				description={<span className="tabular">{bg.code}</span>}
			/>
			<div className="border-border-default bg-surface-2 max-w-2xl rounded-xl border p-5">
				<BackdropForm mode="edit" id={bg.id} defaults={defaults} />
			</div>
		</div>
	);
}
