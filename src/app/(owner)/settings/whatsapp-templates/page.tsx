import { MessageCircle, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">
						WhatsApp Templates
					</h2>
					<p className="text-muted-foreground text-sm">
						{templates.length} template · {activeCount} aktif · muncul di
						dropdown{" "}
						<span className="text-foreground font-medium">Send WA</span> pada
						event detail.
					</p>
				</div>
				<Link
					href="/settings/whatsapp-templates/new"
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
				>
					<Plus className="h-4 w-4" />
					New template
				</Link>
			</div>

			{templates.length === 0 ? (
				<div className="border-border-default bg-surface-2 flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<MessageCircle className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">Belum ada template</h3>
						<p className="text-muted-foreground text-sm">
							Buat template pertama untuk speed-up komunikasi WA dengan klien.
						</p>
					</div>
				</div>
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
