import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { WhatsAppTemplateForm } from "@/components/whatsapp-templates/template-form";

export default function NewWhatsAppTemplatePage() {
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
				<h2 className="text-xl font-semibold tracking-tight">New Template</h2>
				<p className="text-muted-foreground text-sm">
					Buat template pesan reusable untuk komunikasi standar dengan klien.
				</p>
			</div>
			<div className="border-border bg-card max-w-3xl rounded-xl border p-5">
				<WhatsAppTemplateForm mode="create" />
			</div>
		</div>
	);
}
