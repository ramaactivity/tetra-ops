import {
	Camera,
	Film,
	Image as ImageIcon,
	Palette,
	Video,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
	type AssetType,
	ASSET_TYPE_LABELS,
} from "@/lib/actions/event-assets";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * /design — Visual Asset Hub (top-level).
 *
 * Lists every active event with an at-a-glance view of asset coverage:
 * how many design frames / footage / softfile photo+video links exist
 * per event. Click any row to manage assets for that event.
 *
 * Replaces having to dig through Drive — owners + crew can answer "where
 * are the photos for X event?" in one click.
 */

const TYPE_META: Record<
	AssetType,
	{ icon: typeof ImageIcon; tone: string; short: string }
> = {
	design_frame: {
		icon: Palette,
		short: "Design",
		tone: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
	},
	footage_crew: {
		icon: Film,
		short: "Footage",
		tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	softfile_photo: {
		icon: Camera,
		short: "Foto",
		tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	},
	softfile_video: {
		icon: Video,
		short: "Video",
		tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
};

const ALL_TYPES: AssetType[] = [
	"design_frame",
	"footage_crew",
	"softfile_photo",
	"softfile_video",
];

export default async function DesignHubPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: "active" | "all" }>;
}) {
	const params = await searchParams;
	const filter = params.filter ?? "active";

	const supabase = await createClient();

	// Pull recent + upcoming events; filter scope by query param.
	let eventsQuery = supabase
		.from("events")
		.select(
			"id, project_id, client_name, event_date, status, venue_name, venue_city",
		)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.order("event_date", { ascending: false })
		.limit(150);

	if (filter === "active") {
		eventsQuery = eventsQuery.in("status", [
			"draft",
			"confirmed",
			"design_brief",
			"design_approved",
			"upcoming",
			"in_progress",
			"awaiting_settlement",
			"completed",
		]);
	}

	const { data: events, error } = await eventsQuery;

	if (error) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
					<p className="text-fluid-body font-medium text-destructive">
						Gagal memuat events: {error.message}
					</p>
				</div>
			</Container>
		);
	}

	const eventList = events ?? [];

	// Asset counts per event_id × asset_type.
	let assetCounts: Map<string, Record<AssetType, number>> = new Map();
	if (eventList.length > 0) {
		const { data: assets } = await supabase
			.from("event_assets")
			.select("event_id, asset_type")
			.in(
				"event_id",
				eventList.map((e) => e.id),
			);

		assetCounts = new Map();
		for (const a of (assets ?? []) as Array<{
			event_id: string;
			asset_type: AssetType;
		}>) {
			const map = assetCounts.get(a.event_id) ?? {
				design_frame: 0,
				footage_crew: 0,
				softfile_photo: 0,
				softfile_video: 0,
			};
			map[a.asset_type] = (map[a.asset_type] ?? 0) + 1;
			assetCounts.set(a.event_id, map);
		}
	}

	const totalAssets = Array.from(assetCounts.values()).reduce(
		(s, m) => s + Object.values(m).reduce((a, b) => a + b, 0),
		0,
	);
	const eventsWithAnyAsset = assetCounts.size;

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				title="Design Hub"
				description="Visual asset hub per event: design frame, footage crew, softfile foto + video. Klien tanya softfile? Tinggal buka di sini."
				actions={
					<div className="flex items-center gap-1 rounded-lg border border-border-default bg-surface-2 p-1">
						<Link
							href="/design"
							className={`rounded-md px-3 py-1 text-fluid-caption font-medium transition-colors ${
								filter === "active"
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Aktif
						</Link>
						<Link
							href="/design?filter=all"
							className={`rounded-md px-3 py-1 text-fluid-caption font-medium transition-colors ${
								filter === "all"
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Semua
						</Link>
					</div>
				}
			/>

			<dl className="grid gap-3 sm:grid-cols-3">
				<StatCard
					label="Event Tracked"
					value={eventList.length}
					hint={`${eventsWithAnyAsset} sudah punya asset`}
				/>
				<StatCard
					label="Total Asset"
					value={totalAssets}
					hint="Semua link di seluruh event"
				/>
				<StatCard
					label="Coverage"
					value={
						eventList.length > 0
							? `${Math.round((eventsWithAnyAsset / eventList.length) * 100)}%`
							: "—"
					}
					hint="Event yang sudah ada minimal 1 asset"
				/>
			</dl>

			{eventList.length === 0 ? (
				<EmptyState
					icon={Palette}
					title="Belum ada event"
					description="Bikin event dulu lewat Operations baru bisa kelola visual asset."
				/>
			) : (
				<div className="rounded-xl border border-border-default bg-surface-2 overflow-hidden">
					<table className="w-full text-sm">
						<thead className="border-b border-border-default bg-surface-3/40">
							<tr className="text-left">
								<th
									scope="col"
									className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
								>
									Event
								</th>
								<th
									scope="col"
									className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell"
								>
									Tanggal
								</th>
								<th
									scope="col"
									className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
								>
									Asset
								</th>
								<th
									scope="col"
									className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
								>
									Action
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border-default/50">
							{eventList.map((ev) => {
								const counts = assetCounts.get(ev.id) ?? {
									design_frame: 0,
									footage_crew: 0,
									softfile_photo: 0,
									softfile_video: 0,
								};
								const total =
									counts.design_frame +
									counts.footage_crew +
									counts.softfile_photo +
									counts.softfile_video;
								return (
									<tr
										key={ev.id}
										className="press-down hover:bg-muted/40 transition-colors"
									>
										<td className="px-4 py-3 align-middle">
											<Link
												href={`/design/${ev.project_id}`}
												className="block space-y-0.5"
											>
												<div className="font-medium text-foreground hover:text-primary transition-colors">
													{ev.client_name}
												</div>
												<div className="tabular text-[11px] text-muted-foreground">
													{ev.project_id}
												</div>
											</Link>
										</td>
										<td className="hidden px-4 py-3 align-middle sm:table-cell">
											<span className="tabular text-[11px] text-muted-foreground">
												{formatDateID(ev.event_date)}
											</span>
										</td>
										<td className="px-4 py-3 align-middle">
											<div className="flex flex-wrap items-center justify-center gap-1">
												{ALL_TYPES.map((t) => {
													const meta = TYPE_META[t];
													const Icon = meta.icon;
													const c = counts[t];
													return (
														<Badge
															key={t}
															variant="outline"
															className={`h-5 gap-1 px-1.5 text-[10px] font-medium ${
																c > 0 ? meta.tone : "opacity-40"
															}`}
															title={`${ASSET_TYPE_LABELS[t]} (${c})`}
														>
															<Icon className="size-2.5" />
															{meta.short}: {c}
														</Badge>
													);
												})}
											</div>
										</td>
										<td className="px-4 py-3 align-middle text-right">
											<Link
												href={`/design/${ev.project_id}`}
												className="text-fluid-caption font-medium text-primary hover:underline"
											>
												{total > 0 ? "Kelola →" : "Tambah →"}
											</Link>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</Container>
	);
}

function StatCard({
	label,
	value,
	hint,
}: {
	label: string;
	value: number | string;
	hint?: string;
}) {
	return (
		<div className="flex flex-col gap-1 rounded-xl border border-border-default bg-surface-2 p-4">
			<dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</dt>
			<dd className="tabular text-2xl font-bold text-foreground">{value}</dd>
			{hint ? (
				<p className="text-fluid-caption text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
