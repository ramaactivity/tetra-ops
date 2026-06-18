import { SectionHeader } from "@/components/layout/section-header";
import { WhatsAppTemplateForm } from "@/components/whatsapp-templates/template-form";

export default function NewWhatsAppTemplatePage() {
	return (
		<div className="space-y-4">
			<SectionHeader
				as="h2"
				title="New Template"
				description="Buat template pesan reusable untuk komunikasi standar dengan klien."
			/>
			<div className="border-border-default bg-card max-w-3xl rounded-xl border p-5">
				<WhatsAppTemplateForm mode="create" />
			</div>
		</div>
	);
}
