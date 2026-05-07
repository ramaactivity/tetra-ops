import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WhatsAppTemplateForm } from "@/components/whatsapp-templates/template-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditWhatsAppTemplatePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: tpl } = await supabase
		.from("whatsapp_templates")
		.select(
			"id, code, name, description, template_body, available_variables, is_active, display_order",
		)
		.eq("id", id)
		.maybeSingle();

	if (!tpl) notFound();

	const defaults = {
		code: tpl.code,
		name: tpl.name,
		description: tpl.description ?? "",
		template_body: tpl.template_body,
		available_variables: (tpl.available_variables ?? []).join(", "),
		display_order: String(tpl.display_order ?? 0),
		is_active: !!tpl.is_active,
	};

	return (
		<div className="space-y-4">
			<Link
				href="/settings/whatsapp-templates"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				WhatsApp Templates
			</Link>
			<div>
				<h2 className="text-xl font-semibold tracking-tight">
					Edit: {tpl.name}
				</h2>
				<p className="text-muted-foreground tabular text-sm">{tpl.code}</p>
			</div>
			<div className="border-border bg-card max-w-3xl rounded-xl border p-5">
				<WhatsAppTemplateForm mode="edit" id={tpl.id} defaults={defaults} />
			</div>
		</div>
	);
}
