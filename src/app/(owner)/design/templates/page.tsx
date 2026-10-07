import { LayoutTemplate } from "lucide-react";
import { Container } from "@/components/layout/container";
import {
	TemplateActiveToggle,
	TemplateForm,
} from "@/components/portal/template-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { signedUrls } from "@/lib/portal/design-server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Katalog template frame yang bisa dipilih klien di portal (DR-031). */
export default async function DesignTemplatesPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("design_templates")
		.select(
			"id, name, category, frame_size, orientation, preview_path, booth_layout_id, booth_preset_id, is_active",
		)
		.order("is_active", { ascending: false })
		.order("sort")
		.order("created_at", { ascending: false });
	const rows = data ?? [];
	const urls = await signedUrls(rows.map((t) => t.preview_path as string));

	return (
		<Container size="lg" className="space-y-3 pb-6">
			<div>
				<h1 className="text-[20px] font-semibold tracking-[-0.01em]">
					Template Frame
				</h1>
				<p className="text-[13px] text-muted-foreground">
					Pilihan desain yang tampil di portal klien, disaring sesuai ukuran
					cetak pesanan. Klien yang memilih template tetap lewat antrean desain
					(nama & tanggal disesuaikan designer).
				</p>
			</div>
			<TemplateForm />
			{error && (
				<p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
					Gagal memuat: {error.message}
				</p>
			)}
			{rows.length === 0 ? (
				<EmptyState
					icon={LayoutTemplate}
					title="Belum ada template"
					description="Template yang ditambahkan muncul di portal klien."
				/>
			) : (
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{rows.map((t) => (
						<li
							key={t.id}
							className={`space-y-1.5 rounded-[16px] border border-border-subtle bg-card p-2 ${t.is_active ? "" : "opacity-50"}`}
						>
							{urls.get(t.preview_path as string) && (
								// biome-ignore lint/performance/noImgElement: signed URL privat.
								<img
									src={urls.get(t.preview_path as string)}
									alt={t.name}
									className="w-full rounded-lg border border-border-subtle"
								/>
							)}
							<p className="text-[13px] font-semibold">{t.name}</p>
							<p className="text-[12px] text-muted-foreground">
								{t.frame_size} · {t.orientation}
								{t.category ? ` · ${t.category}` : ""}
								{t.booth_layout_id || t.booth_preset_id
									? " · terhubung Booth"
									: ""}
							</p>
							<TemplateActiveToggle id={t.id} active={t.is_active} />
						</li>
					))}
				</ul>
			)}
		</Container>
	);
}
