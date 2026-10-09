import {
	type StudioTemplate,
	TemplateStudio,
} from "@/components/design/template-studio";
import { Container } from "@/components/layout/container";
import { signedUrls } from "@/lib/portal/design-server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Etalase template frame (keputusan owner 2026-10-09): template dibuat di
 * Booth Studio dan ditarik ke sini; Ops mengatur apa yang tampil ke klien.
 * Template PNG manual (teks bawaan) tetap didukung.
 */
export default async function DesignTemplatesPage() {
	const supabase = await createClient();
	const [{ data, error }, { data: used }] = await Promise.all([
		supabase
			.from("design_templates")
			.select(
				"id, name, category, frame_size, orientation, preview_path, preview_url, source, text_mode, slot_count, is_active, featured, booth_archived, synced_at",
			)
			.order("featured", { ascending: false })
			.order("sort")
			.order("created_at", { ascending: false }),
		supabase
			.from("design_requests")
			.select("template_id")
			.not("template_id", "is", null),
	]);
	const rows = data ?? [];
	const urls = await signedUrls(
		rows
			.map((t) => t.preview_path as string | null)
			.filter((p): p is string => !!p),
	);
	const usage = new Map<string, number>();
	for (const u of used ?? [])
		usage.set(
			u.template_id as string,
			(usage.get(u.template_id as string) ?? 0) + 1,
		);
	const boothUrl = process.env.TETRA_BOOTH_URL?.replace(/\/$/, "") ?? null;
	const lastSynced =
		rows
			.map((r) => r.synced_at as string | null)
			.filter(Boolean)
			.sort()
			.at(-1) ?? null;

	const templates: StudioTemplate[] = rows.map((t) => ({
		id: t.id as string,
		name: t.name as string,
		category: (t.category as string | null) ?? null,
		frame_size: t.frame_size as string,
		orientation: t.orientation as string,
		url:
			(t.preview_url as string | null) ??
			(t.preview_path ? (urls.get(t.preview_path as string) ?? null) : null),
		source: t.source as "manual" | "booth",
		text_mode: t.text_mode as "native" | "baked",
		slot_count: (t.slot_count as number | null) ?? null,
		is_active: t.is_active as boolean,
		featured: t.featured as boolean,
		booth_archived: t.booth_archived as boolean,
		used: usage.get(t.id as string) ?? 0,
	}));

	return (
		<Container size="xl" className="space-y-3 pb-6">
			{error && (
				<p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
					Gagal memuat: {error.message}
				</p>
			)}
			<TemplateStudio
				templates={templates}
				boothReady={Boolean(boothUrl && process.env.TETRA_BOOTH_API_TOKEN)}
				boothAdminUrl={boothUrl ? `${boothUrl}/admin/templates` : null}
				lastSynced={lastSynced}
			/>
		</Container>
	);
}
