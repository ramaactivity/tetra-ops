import { notFound } from "next/navigation";
import { BackdropForm } from "@/components/backdrops/backdrop-form";
import {
	CatalogFormCard,
	CatalogFormHeader,
} from "@/components/catalog/form-kit";
import { Container } from "@/components/layout/container";
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
		<Container size="lg" className="space-y-6">
			<CatalogFormHeader
				backHref="/operations/backdrops"
				backLabel="Backdrop"
				eyebrow="Edit backdrop"
				title={bg.name}
				description={bg.code}
			/>
			<CatalogFormCard>
				<BackdropForm mode="edit" id={bg.id} defaults={defaults} />
			</CatalogFormCard>
		</Container>
	);
}
