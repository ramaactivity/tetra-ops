import { ChevronLeft, ExternalLink, Palette } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	type AssetRow,
	AssetSection,
} from "@/components/event-assets/asset-section";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { ensureEventCategoryFolderInternal } from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
import { countFolderFiles } from "@/lib/drive/client";
import {
	ASSET_TYPE_LABELS,
	ASSET_TYPES,
	type AssetType,
} from "@/lib/event-assets/types";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function DesignAssetManagerPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const supabase = await createClient();
	const me = await getCurrentUser();

	const { data: event } = await supabase
		.from("events")
		.select(
			"id, project_id, client_name, event_date, status, venue_name, venue_city, drive_folder_url",
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (!event) notFound();

	const { data: assets } = await supabase
		.from("event_assets")
		.select(
			`id, asset_type, label, url, notes, drive_file_id, uploaded_by, created_at,
			 uploader:users!event_assets_uploaded_by_fkey(full_name)`,
		)
		.eq("event_id", event.id)
		.order("created_at", { ascending: false });

	type RawAssetRow = {
		id: string;
		asset_type: AssetType;
		label: string;
		url: string;
		notes: string | null;
		drive_file_id: string | null;
		uploaded_by: string | null;
		created_at: string;
		uploader:
			| { full_name: string | null }
			| Array<{ full_name: string | null }>
			| null;
	};
	const allRows: AssetRow[] = ((assets ?? []) as RawAssetRow[]).map((r) => {
		const u = Array.isArray(r.uploader) ? r.uploader[0] : r.uploader;
		return {
			id: r.id,
			asset_type: r.asset_type,
			label: r.label,
			url: r.url,
			notes: r.notes,
			drive_file_id: r.drive_file_id,
			uploaded_by: r.uploaded_by,
			uploaded_by_name: u?.full_name ?? null,
			created_at: r.created_at,
		};
	});

	const byType = new Map<AssetType, AssetRow[]>();
	for (const t of ASSET_TYPES) byType.set(t, []);
	for (const row of allRows) byType.get(row.asset_type)?.push(row);

	const canEdit =
		me?.profile.role === "super_admin" || me?.profile.role === "owner";

	// Resolve (and lazily create) the Footage Drive folder + file count.
	let footageUrl: string | null = null;
	let footageCount: number | null = null;
	const footage = await ensureEventCategoryFolderInternal(event.id, "Footage");
	if (footage.id && footage.url) {
		footageUrl = footage.url;
		footageCount = await countFolderFiles(footage.id);
	}

	return (
		<Container size="lg" className="space-y-6">
			<div className="space-y-2">
				<Link
					href="/design"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Design Hub
				</Link>
				<SectionHeader
					title={event.client_name}
					description={
						<span className="flex flex-wrap items-center gap-2">
							<span className="tabular text-muted-foreground/80">
								{event.project_id}
							</span>
							<span className="text-muted-foreground/40">·</span>
							<span>{formatDateID(event.event_date)}</span>
							<span className="text-muted-foreground/40">·</span>
							<span>
								{event.venue_name}
								{event.venue_city ? `, ${event.venue_city}` : ""}
							</span>
						</span>
					}
					actions={
						<div className="flex flex-wrap items-center gap-2">
							{event.drive_folder_url ? (
								<a
									href={event.drive_folder_url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-fluid-caption font-medium hover:bg-surface-3 transition-colors"
								>
									<Palette className="size-3.5" />
									Buka folder Drive
									<ExternalLink className="size-3" />
								</a>
							) : null}
							<Link
								href={`/operations/${event.project_id}`}
								className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-fluid-caption font-medium hover:bg-surface-3 transition-colors"
							>
								Buka Operations →
							</Link>
						</div>
					}
				/>
			</div>

			<dl className="grid gap-2 sm:grid-cols-3">
				{ASSET_TYPES.map((t) => (
					<div
						key={t}
						className="flex items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-2 px-3 py-2"
					>
						<span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							{ASSET_TYPE_LABELS[t]}
						</span>
						<Badge
							variant="outline"
							className="tabular text-[10px] font-semibold"
						>
							{t === "footage_crew" && footageCount != null
								? footageCount
								: (byType.get(t) ?? []).length}
						</Badge>
					</div>
				))}
			</dl>

			<div className="grid gap-4 lg:grid-cols-2">
				{ASSET_TYPES.map((t) => (
					<AssetSection
						key={t}
						eventId={event.id}
						projectId={event.project_id}
						assetType={t}
						rows={byType.get(t) ?? []}
						canEdit={canEdit}
						folderUrl={t === "footage_crew" ? footageUrl : null}
						folderFileCount={t === "footage_crew" ? footageCount : null}
					/>
				))}
			</div>
		</Container>
	);
}
