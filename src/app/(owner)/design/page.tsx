import { Film, Image as ImageIcon, Palette } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { DesignMonthFilter } from "@/components/event-design/design-month-filter";
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
 * Every event (matching the Operations/Event page), grouped per month, with
 * design workflow status (Belum / Proses / Approved, inline-editable) + asset
 * coverage (design frame, footage, softfile). Defaults to the current month.
 */

const TYPE_META: Record<AssetType, { icon: typeof ImageIcon; short: string }> =
	{
		design_frame: { icon: Palette, short: "Design" },
		footage_crew: { icon: Film, short: "Footage" },
		softfile: { icon: ImageIcon, short: "Softfile" },
	};

const ALL_TYPES: AssetType[] = ["design_frame", "footage_crew", "softfile"];

const MONTHS_ID = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

function currentYearMonth(): string {
	const t = new Date();
	return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
	const [y, m] = ym.split("-");
	return `${MONTHS_ID[Number(m) - 1] ?? m} ${y}`;
}

function dayLabel(eventDate: string, today: Date): string {
	const d = new Date(`${eventDate}T00:00:00`);
	const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
	if (diff === 0) return "Hari ini";
	return diff > 0 ? `H−${diff}` : `H+${Math.abs(diff)}`;
}

export default async function AssetDesignPage({
	searchParams,
}: {
	searchParams: Promise<{ month?: string; ds?: string }>;
}) {
	const params = await searchParams;
	const monthParam = params.month?.trim() ?? "";
	const showsAll = monthParam === "all";
	const month =
		monthParam === "all"
			? ""
			: monthParam && /^\d{4}-\d{2}$/.test(monthParam)
				? monthParam
				: currentYearMonth();
	const dsFilter = DESIGN_STATUS_VALUES.includes(params.ds as DesignStatus)
		? (params.ds as DesignStatus)
		: null;

	const supabase = await createClient();

	// All events (incl. archived/legacy) so the count matches the Event page.
	const { data: events, error } = await supabase
		.from("events")
		.select(
			"id, project_id, client_name, event_date, status, design_status, venue_name, venue_city",
		)
		.is("deleted_at", null)
		.order("event_date", { ascending: false })
		.limit(500);

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
	const allEvents = (events ?? []) as EventRow[];

	// Scope to the selected month (default current). "Semua" shows every month.
	const scoped = showsAll
		? allEvents
		: allEvents.filter((e) => (e.event_date ?? "").slice(0, 7) === month);

	// Asset counts per event_id × asset_type (over the scoped events).
	const assetCounts = new Map<string, Record<AssetType, number>>();
	if (scoped.length > 0) {
		const { data: assets } = await supabase
			.from("event_assets")
			.select("event_id, asset_type")
			.in(
				"event_id",
				scoped.map((e) => e.id),
			);
		for (const a of (assets ?? []) as Array<{
			event_id: string;
			asset_type: AssetType;
		}>) {
			const map = assetCounts.get(a.event_id) ?? {
				design_frame: 0,
				footage_crew: 0,
				softfile: 0,
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
	for (const e of scoped) {
		statusCounts[e.design_status] = (statusCounts[e.design_status] ?? 0) + 1;
	}

	const displayList = dsFilter
		? scoped.filter((e) => e.design_status === dsFilter)
		: scoped;

	// Group displayed events per month (events already ordered date-desc).
	const groups = new Map<string, EventRow[]>();
	for (const ev of displayList) {
		const ym = (ev.event_date ?? "").slice(0, 7);
		const list = groups.get(ym);
		if (list) list.push(ev);
		else groups.set(ym, [ev]);
	}
	const orderedGroups = Array.from(groups.entries()).sort((a, b) =>
		a[0] < b[0] ? 1 : -1,
	);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	function chipHref(ds: DesignStatus | null): string {
		const p = new URLSearchParams();
		if (showsAll) p.set("month", "all");
		else if (monthParam) p.set("month", month);
		if (ds) p.set("ds", ds);
		const s = p.toString();
		return s ? `/design?${s}` : "/design";
	}

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				title="Asset & Design"
				description="Status design per event + hub aset (design frame, footage, softfile). Kelola status design + aset langsung di sini."
				actions={
					<DesignMonthFilter month={month} showsAll={showsAll} ds={dsFilter} />
				}
			/>

			<dl className="grid gap-3 sm:grid-cols-3">
				<StatCard
					label="Event Tracked"
					value={scoped.length}
					hint={`${eventsWithAnyAsset} sudah punya asset`}
				/>
				<StatCard
					label="Total Asset"
					value={totalAssets}
					hint={showsAll ? "Semua bulan" : monthLabel(month)}
				/>
				<StatCard
					label="Coverage"
					value={
						scoped.length > 0
							? `${Math.round((eventsWithAnyAsset / scoped.length) * 100)}%`
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
					<span className="tabular opacity-60">{scoped.length}</span>
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
					title={
						dsFilter
							? "Tidak ada event di status ini"
							: showsAll
								? "Belum ada event"
								: `Tidak ada event di ${monthLabel(month)}`
					}
					description={
						dsFilter
							? "Coba pilih status design lain di atas."
							: "Ganti bulan di atas, atau pilih Semua."
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
								{orderedGroups.map(([ym, evs]) => (
									<Fragment key={ym}>
										<tr className="border-b border-border-default bg-secondary/40">
											<td colSpan={5} className="px-4 py-2">
												<span className="eyebrow">
													{monthLabel(ym)} · {evs.length}
												</span>
											</td>
										</tr>
										{evs.map((ev) => {
											const counts = assetCounts.get(ev.id) ?? {
												design_frame: 0,
												footage_crew: 0,
												softfile: 0,
											};
											const total =
												counts.design_frame +
												counts.footage_crew +
												counts.softfile;
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
									</Fragment>
								))}
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
