import {
	ArrowRight,
	Check,
	Clapperboard,
	HardDriveUpload,
	Image as ImageIcon,
	type LucideIcon,
	Palette,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { DesignFilterBar } from "@/components/event-design/design-filter-bar";
import { DesignStatusSelect } from "@/components/event-design/design-status-select";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssetType } from "@/lib/event-assets/types";
import {
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
 * design workflow status (Belum / Proses / Approved, inline-editable) + per-event
 * asset readiness (design ready? softfile uploaded? footage uploaded?).
 * Defaults to the current month.
 */

const ASSET_CHECKS: Array<{
	key: keyof Ready;
	label: string;
	icon: LucideIcon;
}> = [
	{ key: "design", label: "Design", icon: ImageIcon },
	{ key: "softfile", label: "Softfile", icon: HardDriveUpload },
	{ key: "footage", label: "Footage", icon: Clapperboard },
];

type Ready = { design: boolean; softfile: boolean; footage: boolean };

/** Asset-readiness chips (design / softfile / footage), shared by the desktop
 *  table + mobile card. Each asset has its own icon for differentiation; a
 *  ready chip is solid-green with a check, a missing one is muted/outline. */
function AssetChips({ ready }: { ready: Ready }) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{ASSET_CHECKS.map((chk) => {
				const ok = ready[chk.key];
				const Icon = chk.icon;
				return (
					<span
						key={chk.key}
						className={cn(
							"inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium",
							ok
								? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
								: "border-dashed border-border-strong bg-transparent text-muted-foreground",
						)}
						title={`${chk.label}: ${ok ? "sudah ada" : "belum ada"}`}
					>
						<Icon className="size-3.5" aria-hidden />
						{chk.label}
						{ok ? <Check className="size-3" aria-hidden /> : null}
					</span>
				);
			})}
		</div>
	);
}

/** Per-event action: green "Tambah" when nothing's uploaded yet (draws the eye),
 *  quiet outline "Kelola" once assets exist. Matches the app's Button styling. */
function EventAction({
	projectId,
	hasAny,
	size = "sm",
	className,
}: {
	projectId: string;
	hasAny: boolean;
	size?: "sm" | "default" | "lg";
	className?: string;
}) {
	return (
		<Link
			href={`/design/${projectId}`}
			className={cn(
				buttonVariants({ variant: hasAny ? "outline" : "default", size }),
				className,
			)}
		>
			{hasAny ? (
				<>
					Kelola
					<ArrowRight className="size-3.5" aria-hidden />
				</>
			) : (
				<>
					<Plus className="size-3.5" aria-hidden />
					Tambah
				</>
			)}
		</Link>
	);
}

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
	searchParams: Promise<{ month?: string; ds?: string; q?: string }>;
}) {
	const params = await searchParams;
	const q = (params.q ?? "").trim();
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
			"id, project_id, client_name, event_date, status, design_status, venue_name, venue_city, drive_folders",
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
		drive_folders: { Footage?: { count?: number } } | null;
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

	// Per-event readiness: design ready? softfile uploaded? footage uploaded?
	const readiness = new Map<string, Ready>();
	let nDesign = 0;
	let nSoftfile = 0;
	let nFootage = 0;
	for (const ev of scoped) {
		const c = assetCounts.get(ev.id);
		const footCached = ev.drive_folders?.Footage?.count ?? 0;
		const r: Ready = {
			design: (c?.design_frame ?? 0) > 0,
			softfile: (c?.softfile ?? 0) > 0,
			footage: footCached > 0 || (c?.footage_crew ?? 0) > 0,
		};
		readiness.set(ev.id, r);
		if (r.design) nDesign++;
		if (r.softfile) nSoftfile++;
		if (r.footage) nFootage++;
	}

	// Apply the name search (over the month scope). Status-chip counts reflect
	// what's searchable; the list narrows further by the active status filter.
	const searched = q
		? scoped.filter((e) =>
				(e.client_name ?? "").toLowerCase().includes(q.toLowerCase()),
			)
		: scoped;

	const statusCounts: Record<DesignStatus, number> = {
		belum: 0,
		proses: 0,
		approved: 0,
	};
	for (const e of searched) {
		statusCounts[e.design_status] = (statusCounts[e.design_status] ?? 0) + 1;
	}

	const displayList = dsFilter
		? searched.filter((e) => e.design_status === dsFilter)
		: searched;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				title="Asset & Design"
				description="Status design per event + hub aset (design frame, footage, softfile). Kelola status design + aset langsung di sini."
			/>

			<KpiRow className="sm:grid-cols-3 lg:grid-cols-3">
				<KpiCard
					label="Design Siap"
					value={`${nDesign} / ${scoped.length}`}
					hint="Event yang sudah ada design frame"
					icon={ImageIcon}
					accent="primary"
					progress={{ current: nDesign, target: scoped.length, label: "" }}
				/>
				<KpiCard
					label="Softfile Terupload"
					value={`${nSoftfile} / ${scoped.length}`}
					hint="Event yang softfile-nya sudah ada"
					icon={HardDriveUpload}
					accent="sky"
					progress={{ current: nSoftfile, target: scoped.length, label: "" }}
				/>
				<KpiCard
					label="Footage Terupload"
					value={`${nFootage} / ${scoped.length}`}
					hint="Event yang footage-nya sudah masuk Drive"
					icon={Clapperboard}
					accent="emerald"
					progress={{ current: nFootage, target: scoped.length, label: "" }}
				/>
			</KpiRow>

			<div className="space-y-3">
				<DesignFilterBar
					defaultQ={q}
					month={month}
					showsAll={showsAll}
					ds={dsFilter}
					scopedCount={searched.length}
					statusCounts={statusCounts}
				/>

				{displayList.length === 0 ? (
					<EmptyState
						icon={Palette}
						title={
							q
								? `Tidak ada klien cocok "${q}"`
								: dsFilter
									? "Tidak ada event di status ini"
									: showsAll
										? "Belum ada event"
										: `Tidak ada event di ${monthLabel(month)}`
						}
						description={
							q
								? "Coba kata kunci lain, atau reset filter."
								: dsFilter
									? "Coba pilih status design lain di atas."
									: "Ganti bulan di atas, atau pilih Semua bulan."
						}
					/>
				) : (
					<>
						{/* Desktop — table (md+ only, never side-scrolls on phones). */}
						<div className="hidden overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)] md:block">
							<table className="w-full text-sm">
								<thead className="bg-card border-b border-border-subtle">
									<tr className="border-b border-border-default text-left">
										<th className="eyebrow px-4 py-2.5">Event</th>
										<th className="eyebrow px-4 py-2.5">Tanggal</th>
										<th className="eyebrow px-4 py-2.5">Status Design</th>
										<th className="eyebrow px-4 py-2.5">Asset</th>
										<th className="eyebrow px-4 py-2.5 text-right">Action</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border-subtle">
									{displayList.map((ev) => {
										const ready = readiness.get(ev.id) ?? {
											design: false,
											softfile: false,
											footage: false,
										};
										const hasAny =
											ready.design || ready.softfile || ready.footage;
										return (
											<tr
												key={ev.id}
												className="transition-colors hover:bg-secondary/30"
											>
												<td className="px-4 py-3 align-middle">
													<Link
														href={`/design/${ev.project_id}`}
														className="block text-[13px] font-medium text-foreground transition-colors hover:text-[#0070f3]"
													>
														{ev.client_name}
													</Link>
												</td>
												<td className="px-4 py-3 align-middle">
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
													<AssetChips ready={ready} />
												</td>
												<td className="px-4 py-3 text-right align-middle">
													<EventAction
														projectId={ev.project_id}
														hasAny={hasAny}
													/>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>

						{/* Mobile — record-card stack (MOBILE.md §7). No horizontal scroll;
						    a clear hierarchy: title → date → status → assets → action. */}
						<div className="space-y-2.5 md:hidden">
							{displayList.map((ev) => {
								const ready = readiness.get(ev.id) ?? {
									design: false,
									softfile: false,
									footage: false,
								};
								const hasAny = ready.design || ready.softfile || ready.footage;
								return (
									<div
										key={ev.id}
										className="rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)]"
									>
										<Link
											href={`/design/${ev.project_id}`}
											className="type-heading block break-words text-foreground"
										>
											{ev.client_name}
										</Link>
										<p className="type-caption text-muted-foreground mt-0.5">
											{formatDateID(ev.event_date)} ·{" "}
											{dayLabel(ev.event_date, today)}
										</p>

										<div className="mt-3.5 space-y-3">
											<div>
												<p className="eyebrow mb-1.5">Status design</p>
												<DesignStatusSelect
													eventId={ev.id}
													projectId={ev.project_id}
													value={ev.design_status}
													className="flex w-full [&>button]:flex-1"
												/>
											</div>
											<div>
												<p className="eyebrow mb-1.5">Aset</p>
												<AssetChips ready={ready} />
											</div>
										</div>

										<EventAction
											projectId={ev.project_id}
											hasAny={hasAny}
											size="lg"
											className="mt-4 w-full"
										/>
									</div>
								);
							})}
						</div>
					</>
				)}
			</div>
		</Container>
	);
}
