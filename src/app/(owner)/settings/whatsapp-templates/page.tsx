import { MessageCircle, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ToggleTemplateActiveButton } from "@/components/whatsapp-templates/toggle-active-button";
import { createClient } from "@/lib/supabase/server";

type TemplateRow = {
	id: string;
	code: string;
	name: string;
	description: string | null;
	template_body: string;
	available_variables: string[] | null;
	is_active: boolean;
	display_order: number;
};

function snippet(text: string, max = 90) {
	if (text.length <= max) return text;
	return `${text.slice(0, max).trimEnd()}…`;
}

export default async function WhatsAppTemplatesListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("whatsapp_templates")
		.select(
			"id, code, name, description, template_body, available_variables, is_active, display_order",
		)
		.order("display_order", { ascending: true })
		.order("name", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat templates: {error.message}
				</p>
			</div>
		);
	}

	const templates = (data ?? []) as TemplateRow[];
	const activeCount = templates.filter((t) => t.is_active).length;

	return (
		<div className="space-y-4">
			<SectionHeader
				as="h2"
				title="WhatsApp Templates"
				description={
					<>
						{templates.length} template · {activeCount} aktif · muncul di
						dropdown{" "}
						<span className="text-foreground font-medium">Send WA</span> pada
						event detail.
					</>
				}
				actions={
					<Link
						href="/settings/whatsapp-templates/new"
						className={buttonVariants({ variant: "default" })}
					>
						<Plus className="size-4" />
						New template
					</Link>
				}
			/>

			{templates.length === 0 ? (
				<EmptyState
					icon={MessageCircle}
					title="Belum ada template"
					description="Buat template pertama untuk speed-up komunikasi WA dengan klien."
				/>
			) : (
				<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Code</TableHead>
								<TableHead>Nama</TableHead>
								<TableHead>Snippet</TableHead>
								<TableHead className="text-right">Variabel</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[100px] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{templates.map((t) => (
								<TableRow key={t.id}>
									<TableCell className="text-muted-foreground tabular text-xs">
										{t.code}
									</TableCell>
									<TableCell>
										<div className="space-y-0.5">
											<div className="font-medium">{t.name}</div>
											{t.description && (
												<div className="text-muted-foreground text-xs">
													{t.description}
												</div>
											)}
										</div>
									</TableCell>
									<TableCell className="max-w-md text-muted-foreground text-sm">
										{snippet(t.template_body)}
									</TableCell>
									<TableCell className="tabular text-muted-foreground text-right text-xs">
										{t.available_variables?.length ?? 0}
									</TableCell>
									<TableCell>
										{t.is_active ? (
											<Badge variant="default">Aktif</Badge>
										) : (
											<Badge variant="secondary">Nonaktif</Badge>
										)}
									</TableCell>
									<TableCell>
										<div className="flex items-center justify-end gap-1">
											<Link
												href={`/settings/whatsapp-templates/${t.id}/edit`}
												title="Edit"
												className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
											>
												<Pencil className="h-4 w-4" />
											</Link>
											<ToggleTemplateActiveButton
												id={t.id}
												isActive={t.is_active}
												name={t.name}
											/>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<p className="text-muted-foreground text-xs">
				Variabel didukung disisipkan otomatis dari event yang dipilih (lihat
				editor template untuk daftar lengkap).
			</p>
		</div>
	);
}
