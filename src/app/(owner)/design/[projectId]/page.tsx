import { ArrowRight, ChevronLeft, ExternalLink, Palette } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	type AssetRow,
	AssetSection,
} from "@/components/event-assets/asset-section";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	ensureEventCategoryFolderInternal,
	getFootageInfoInternal,
} from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
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

	// Resolve (and lazily create) the Footage + Softfile Drive folders.
	// getFootageInfoInternal also caches the footage file count for the list.
	const [footage, softfile] = await Promise.all([
		getFootageInfoInternal(event.id),
		ensureEventCategoryFolderInternal(event.id, "Softfile"),
	]);
	const footageUrl = footage.url ?? null;
	const footageCount = footage.url ? footage.count : null;
	const softfileUrl = softfile.url ?? null;

	return (
		<Container size="lg" className="space-y-3">
			<Link
				href="/design"
				className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full bg-secondary px-3 pr-3.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<ChevronLeft className="size-4" aria-hidden strokeWidth={2} />
				Design Hub
			</Link>

			{/* Page-level actions teleport to the topbar as uniform h-9 pills.
			    Passed as direct children (no wrapper div) so the topbar's
			    [&>a] normalizer applies — keeps them the same size as every page. */}
			<SectionHeader
				title={event.client_name}
				actions={
					<>
						{event.drive_folder_url ? (
							<a
								href={event.drive_folder_url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-card px-3.5 text-[13px] font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary"
							>
								<Palette className="size-3.5" />
								Buka folder Drive
								<ExternalLink className="size-3" />
							</a>
						) : null}
						<Link
							href={`/operations/${event.project_id}`}
							className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-card px-3.5 text-[13px] font-medium text-foreground shadow-[var(--shadow-level-1)] transition-colors hover:bg-secondary"
						>
							Buka Operations
							<ArrowRight className="size-3.5" />
						</Link>
					</>
				}
			/>

			{/* Emerald hero — event identity + asset counts, same green card as the
			    event detail / billing heroes. */}
			<section className="overflow-hidden rounded-[20px] bg-[#059669] p-5 text-white shadow-[var(--shadow-level-3)]">
				<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
					{formatDateID(event.event_date)}
					{event.venue_name
						? ` · ${event.venue_name}${event.venue_city ? `, ${event.venue_city}` : ""}`
						: ""}
				</p>
				<h1 className="mt-1.5 break-words text-[26px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[30px]">
					{event.client_name}
				</h1>

				<dl className="mt-4 grid grid-cols-3 gap-2">
					{ASSET_TYPES.map((t) => {
						const count =
							t === "footage_crew" && footageCount != null
								? footageCount
								: (byType.get(t) ?? []).length;
						return (
							<div
								key={t}
								className="rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur-sm"
							>
								<dt className="text-[10.5px] font-semibold uppercase tracking-wider text-white/70">
									{ASSET_TYPE_LABELS[t]}
								</dt>
								<dd className="tabular mt-0.5 text-2xl font-bold leading-none">
									{count}
								</dd>
							</div>
						);
					})}
				</dl>
			</section>

			<div className="grid gap-3 lg:grid-cols-2">
				{ASSET_TYPES.map((t) => (
					<AssetSection
						key={t}
						eventId={event.id}
						projectId={event.project_id}
						assetType={t}
						rows={byType.get(t) ?? []}
						canEdit={canEdit}
						folderUrl={
							t === "footage_crew"
								? footageUrl
								: t === "softfile"
									? softfileUrl
									: null
						}
						folderFileCount={t === "footage_crew" ? footageCount : null}
					/>
				))}
			</div>
		</Container>
	);
}
