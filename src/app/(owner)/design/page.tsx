import {
	Camera,
	Film,
	type Image as ImageIcon,
	Palette,
	Video,
} from "lucide-react";
import Link from "next/link";
import { DesignStatusSelect } from "@/components/event-design/design-status-select";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ASSET_TYPE_LABELS, type AssetType } from "@/lib/event-assets/types";
import {
	DESIGN_STATUS_LABELS,
	DESIGN_STATUS_TONE,
	DESIGN_STATUS_VALUES,
	type DesignStatus,
	formatDateID,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * /design — Asset & Design.
 *
 * One effective list (no kanban) of every active event: design workflow status
 * (Belum / Proses / Approved, editable inline by owners) + visual-asset coverage
 * (design frame, footage, softfile photo + video). Replaces both the old asset
 * hub and the Operations design board.
 */

const TYPE_META: Record<AssetType, { icon: typeof ImageIcon; short: string }> =
	{
		design_frame: { icon: Palette, short: "Design" },
		footage_crew: { icon: Film, short: "Footage" },
		softfile_photo: { icon: Camera, short: "Foto" },
		softfile_video: { icon: Video, short: "Video" },
	};

const ALL_TYPES: AssetType[] = [
	"design_frame",
	"footage_crew",
	"softfile_photo",
	"softfile_video",
];

const ACTIVE_STATUSES = [
	"draft",
	"confirmed",
	"upcoming",
	"in_progress",
	"awaiting_settlement",
	"completed",
];

function dayLabel(eventDate: string, today: Date): string {
	const d = new Date(`${eventDate}T00:00:00`);
	const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
	if (diff === 0) return "Hari ini";
	return diff > 0 ? `H−${diff}` : `H+${Math.abs(diff)}`;
}

export default async function AssetDesignPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: "active" | "all"; ds?: string }>;
}) {
	const params = await searchParams;
	const filter = params.filter === "all" ? "all" : "active";
	const dsFilter = DESIGN_STATUS_VALUES.includes(params.ds as DesignStatus)
		? (params.ds as DesignStatus)
		: null;

	const supabase = await createClient();

	let eventsQuery = supabase
		.from("events")
		.select(
			"id, project_id, client_name, event_date, status, design_status, venue_name, venue_city",
		)
		.is("deleted_at", null)
		.eq("is_migrated_legacy", false)
		.order("event_date", { ascending: true })
		.limit(200);

	if (filter === "active") {
		eventsQuery = eventsQuery.in("status", ACTIVE_STATUSES);
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

	type EventRow = {
		id: string;
		project_id: string;
		client_name: string;
		event_date: string;
		status: string;
		design_status: DesignStatus;
		venue_name: string | null;
		venue_city: string | null;
	};
	const eventList = (events ?? []) as EventRow[];

	// Asset counts per event_id × asset_type.
	const assetCounts = new Map<string, Record<AssetType, number>>();
	if (eventList.length > 0) {
		const { data: assets } = await supabase
			.from("event_assets")
			.select("event_id, asset_type")
			.in(
				"event_id",
				eventList.map((e) => e.id),
			);
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

	const statusCounts: Record<DesignStatus, number> = {
		belum: 0,
		proses: 0,
		approved: 0,
	};
	for (const e of eventList) {
		statusCounts[e.design_status] = (statusCounts[e.design_status] ?? 0) + 1;
	}

	const displayList = dsFilter
		? eventList.filter((e) => e.design_status === dsFilter)
		: eventList;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	function chipHref(ds: DesignStatus | null): string {
		const q = new URLSearchParams();
		if (filter === "all") q.set("filter", "all");
		if (ds) q.set("ds", ds);
		const s = q.toString();
		return s ? `/design?${s}` : "/design";
	}

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				title="Asset & Design"
				description="Status design per event + hub aset (design frame, footage, softfile foto + video). Kelola status design langsung di sini."
				actions={
					<div className="flex items-center gap-1 rounded-lg border border-border-default bg-card p-1">
						<Link
							href={dsFilter ? `/design?ds=${dsFilter}` : "/design"}
							className={cn(
								"rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors",
								filter === "active"
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							Aktif
						</Link>
						<Link
							href={
								dsFilter
									? `/design?filter=all&ds=${dsFilter}`
									: "/design?filter=all"
							}
							className={cn(
								"rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors",
								filter === "all"
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
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
					hint="Event dengan minimal 1 asset"
				/>
			</dl>

			{/* Design-status filter chips */}
			<div className="flex flex-wrap items-center gap-2">
				<Link
					href={chipHref(null)}
					className={cn(
						"inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-medium transition-colors",
						!dsFilter
							? "border-foreground/15 bg-foreground/[0.06] text-foreground"
							: "border-border-default text-muted-foreground hover:text-foreground",
					)}
				>
					Semua
					<span className="tabular opacity-60">{eventList.length}</span>
				</Link>
				{DESIGN_STATUS_VALUES.map((ds) => {
					const tone = DESIGN_STATUS_TONE[ds];
					const active = dsFilter === ds;
					return (
						<Link
							key={ds}
							href={chipHref(ds)}
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-medium transition-colors",
								active
									? tone.badge
									: "border-border-default text-muted-foreground hover:text-foreground",
							)}
						>
							<span
								className={cn("size-1.5 rounded-full", tone.dot)}
								aria-hidden
							/>
							{DESIGN_STATUS_LABELS[ds]}
							<span className="tabular opacity-60">{statusCounts[ds]}</span>
						</Link>
					);
				})}
			</div>

			{displayList.length === 0 ? (
				<EmptyState
					icon={Palette}
					title={dsFilter ? "Tidak ada event di status ini" : "Belum ada event"}
					description={
						dsFilter
							? "Coba pilih status design lain di atas."
							: "Bikin event dulu lewat Operations baru bisa kelola design & asset."
					}
				/>
			) : (
				<div className="overflow-hidden rounded-lg border border-border-default bg-card">
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="bg-secondary/50">
								<tr className="border-b border-border-default text-left">
									<th className="eyebrow px-4 py-2.5">Event</th>
									<th className="eyebrow hidden px-4 py-2.5 sm:table-cell">
										Tanggal
									</th>
									<th className="eyebrow px-4 py-2.5">Status Design</th>
									<th className="eyebrow px-4 py-2.5">Asset</th>
									<th className="eyebrow px-4 py-2.5 text-right">Action</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border-subtle">
								{displayList.map((ev) => {
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
											className="transition-colors hover:bg-secondary/30"
										>
											<td className="px-4 py-3 align-middle">
												<Link
													href={`/design/${ev.project_id}`}
													className="block"
												>
													<div className="text-[13px] font-medium text-foreground transition-colors hover:text-[#0070f3]">
														{ev.client_name}
													</div>
													<div className="tabular text-[11px] text-muted-foreground">
														{ev.project_id}
													</div>
												</Link>
											</td>
											<td className="hidden px-4 py-3 align-middle sm:table-cell">
												<div className="tabular text-[12.5px] text-muted-foreground">
													{formatDateID(ev.event_date)}
												</div>
												<div className="text-[11px] text-muted-foreground/70">
													{dayLabel(ev.event_date, today)}
												</div>
											</td>
											<td className="px-4 py-3 align-middle">
												<DesignStatusSelect
													eventId={ev.id}
													projectId={ev.project_id}
													value={ev.design_status}
												/>
											</td>
											<td className="px-4 py-3 align-middle">
												<div className="flex flex-wrap items-center gap-1">
													{ALL_TYPES.map((t) => {
														const meta = TYPE_META[t];
														const Icon = meta.icon;
														const c = counts[t];
														return (
															<Badge
																key={t}
																variant="outline"
																className={cn(
																	"h-5 gap-1 px-1.5 text-[10px] font-medium",
																	c > 0
																		? "border-border-default bg-secondary text-foreground/85"
																		: "opacity-40",
																)}
																title={`${ASSET_TYPE_LABELS[t]} (${c})`}
															>
																<Icon className="size-2.5" />
																{meta.short}: {c}
															</Badge>
														);
													})}
												</div>
											</td>
											<td className="px-4 py-3 text-right align-middle">
												<Link
													href={`/design/${ev.project_id}`}
													className="text-[12.5px] font-medium text-[#0070f3] hover:underline"
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
		<div className="flex flex-col gap-1 rounded-lg border border-border-default bg-card p-4">
			<dt className="eyebrow">{label}</dt>
			<dd className="tabular text-2xl font-semibold text-foreground">
				{value}
			</dd>
			{hint ? (
				<p className="text-[12px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}
