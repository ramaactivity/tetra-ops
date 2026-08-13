import {
	AlertCircle,
	Briefcase,
	CalendarClock,
	CalendarPlus,
	CalendarRange,
	CheckCircle2,
	Plus,
	Upload,
	Users,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { OperationsFilterBar } from "@/components/operations/filter-bar";
import { KpiCard } from "@/components/operations/kpi-card";
import { MonthMemory } from "@/components/operations/month-memory";
import {
	type CrewChip,
	type EventRow,
	OperationsListTable,
} from "@/components/operations/operations-list-table";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { applyDateTransitions } from "@/lib/event-status-transition";
import { listMissingFields } from "@/lib/events/tbc";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function currentYearMonth(): string {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

// Sort options for the list. Default = `date_asc`: nearest event date at the
// top (earliest first), so the soonest job is the first thing you see.
const SORT_OPTIONS = {
	date_asc: { column: "event_date", ascending: true },
	date_desc: { column: "event_date", ascending: false },
	name_asc: { column: "client_name", ascending: true },
	name_desc: { column: "client_name", ascending: false },
	vendor_asc: { column: "vendor_name", ascending: true },
	vendor_desc: { column: "vendor_name", ascending: false },
} as const;

type SortKey = keyof typeof SORT_OPTIONS;
const DEFAULT_SORT: SortKey = "date_asc";

export default async function OperationsListPage({
	searchParams,
}: {
	searchParams: Promise<{
		q?: string;
		status?: string;
		month?: string;
		crew?: string;
		vendor?: string;
		sort?: string;
	}>;
}) {
	const params = await searchParams;
	const q = params.q?.trim() ?? "";
	const status = params.status?.trim() ?? "";
	// Month filter defaults to current YYYY-MM when not provided; explicit
	// `?month=all` lets user view across all months. Matches Reports +
	// Calendar behavior (those pages also auto-detect current month).
	const monthParam = params.month?.trim() ?? "";
	const month =
		monthParam === "all"
			? ""
			: monthParam && /^\d{4}-\d{2}$/.test(monthParam)
				? monthParam
				: currentYearMonth();
	const crewFilter = params.crew?.trim() ?? "";
	const vendorFilter = params.vendor?.trim() ?? "";
	const sortParam = params.sort?.trim() ?? "";
	const sort: SortKey =
		sortParam in SORT_OPTIONS ? (sortParam as SortKey) : DEFAULT_SORT;
	const sortConf = SORT_OPTIONS[sort];

	const me = await getCurrentUser();
	const supabase = await createClient();

	// Lazy self-heal: keep date-driven statuses fresh on every visit. The Hobby
	// plan allows only one cron/day, so without this an event that passes its
	// date mid-day would read "upcoming"/"in_progress" until the nightly run.
	// Best-effort — never block or crash the page if it fails.
	try {
		await applyDateTransitions(createAdminClient());
	} catch {
		// ignore — the nightly cron is the backstop
	}

	let crewEventIds: string[] | null = null;
	if (crewFilter) {
		const { data: crewEvents } = await supabase
			.from("crew_assignments")
			.select("event_id")
			.eq("user_id", crewFilter);
		crewEventIds = (crewEvents ?? []).map((c) => c.event_id as string);
	}

	let listQuery = supabase
		.from("events")
		.select(
			`id, project_id, status, channel, vendor_name, client_name, event_date,
			 event_date_is_estimate, setup_time, start_time, end_time,
			 frame_size, backdrop_color, include_flashdisk_pouch,
			 venue_name, venue_city, grand_total, remaining_balance, payment_status,
			 is_migrated_legacy, legacy_invoice_number, custom_package_name,
			 event_category, backdrop_id, pic_name, pic_wa, pic_contact_id, pending_package_hours,
			 design_status,
			 package:packages(name, duration_hours, frame_size),
			 backdrop:backdrops(name, type)`,
		)
		.is("deleted_at", null)
		// nullsFirst:false → sort vendor menaruh event non-vendor (vendor_name
		// null: direct/relasi) di bawah, bukan menyelip di atas daftar.
		.order(sortConf.column, {
			ascending: sortConf.ascending,
			nullsFirst: false,
		})
		.limit(100);

	// Same-day events fall back to start time so the day reads top-to-bottom.
	if (sortConf.column === "event_date") {
		listQuery = listQuery.order("start_time", {
			ascending: sortConf.ascending,
			nullsFirst: false,
		});
	}

	// Dalam satu vendor, event terdekat dulu.
	if (sortConf.column === "vendor_name") {
		listQuery = listQuery.order("event_date", { ascending: true });
	}

	// Archived + legacy events are always listed — they're real jobs the team
	// needs to see. Only their *financial* data is excluded (the KPIs below
	// scope Outstanding / Awaiting Settlement to non-legacy events).

	if (q) listQuery = listQuery.ilike("client_name", `%${q}%`);
	if (status) listQuery = listQuery.eq("status", status);
	if (vendorFilter) listQuery = listQuery.eq("vendor_name", vendorFilter);
	if (month && /^\d{4}-\d{2}$/.test(month)) {
		const [y, m] = month.split("-").map(Number);
		const start = `${month}-01`;
		const end = lastDayOfMonth(y, m);
		listQuery = listQuery.gte("event_date", start).lte("event_date", end);
	}
	if (crewEventIds !== null) {
		if (crewEventIds.length === 0) {
			listQuery = listQuery.eq("id", "00000000-0000-0000-0000-000000000000");
		} else {
			listQuery = listQuery.in("id", crewEventIds);
		}
	}

	const today = new Date();
	const ymStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
	const ymEnd = lastDayOfMonth(today.getFullYear(), today.getMonth() + 1);
	const yearStart = `${today.getFullYear()}-01-01`;
	const yearEnd = `${today.getFullYear()}-12-31`;

	const [
		listResult,
		totalCountResult,
		thisMonthCountResult,
		thisYearCountResult,
		awaitingCountResult,
		completedCountResult,
		targetConfigResult,
		crewListResult,
		eventTypesResult,
		vendorListResult,
	] = await Promise.all([
		listQuery,
		// Total Events — every event ever recorded (incl. archived + legacy).
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null),
		// Bulan Ini — booking bertanggal bulan ini, semua status KECUALI batal.
		// Event batal bukan pencapaian, jadi tak boleh mendorong progress target;
		// sekaligus menyamakan angkanya dengan /bulan di bot Telegram.
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.neq("status", "cancelled")
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd),
		// Tahun Ini — idem, semua status kecuali batal.
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.neq("status", "cancelled")
			.gte("event_date", yearStart)
			.lte("event_date", yearEnd),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "awaiting_settlement"),
		// Completed — event sudah selesai & di-settle (non-legacy). Outstanding
		// receivables hidup di halaman Billing; di sini fokus pipeline event.
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "completed"),
		// Owner-set event targets (editable in Settings → system_config).
		supabase
			.from("system_config")
			.select("key, value")
			.in("key", ["event_target_monthly", "event_target_yearly"]),
		supabase
			.from("users")
			.select("id, full_name, nickname, tier")
			.eq("role", "crew")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("full_name", { ascending: true }),
		supabase.from("event_types").select("code, label").eq("is_active", true),
		// Nama vendor unik utk dropdown filter (dari event yang benar-benar ada,
		// bukan master vendor — supaya tiap pilihan pasti menghasilkan baris).
		supabase
			.from("events")
			.select("vendor_name")
			.eq("channel", "vendor")
			.not("vendor_name", "is", null)
			.is("deleted_at", null),
	]);

	const eventTypeLabelByCode = new Map<string, string>(
		(
			(eventTypesResult.data ?? []) as Array<{
				code: string;
				label: string;
			}>
		).map((r) => [r.code, r.label]),
	);

	if (listResult.error) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
					<p className="text-fluid-body font-medium text-destructive">
						Gagal memuat events: {listResult.error.message}
					</p>
				</div>
			</Container>
		);
	}

	type PackageEmbed = {
		name: string | null;
		duration_hours: number | null;
		frame_size: string | null;
	};
	type RawEventRow = Omit<
		EventRow,
		| "package_name"
		| "package_duration_hours"
		| "backdrop_name"
		| "backdrop_type"
		| "event_category_label"
		| "missing_info"
	> & {
		package?: PackageEmbed | Array<PackageEmbed> | null;
		backdrop?:
			| { name: string | null; type: string | null }
			| Array<{ name: string | null; type: string | null }>
			| null;
		custom_package_name?: string | null;
		event_category?: string | null;
		backdrop_id?: string | null;
		pic_name?: string | null;
		pic_wa?: string | null;
		pic_contact_id?: string | null;
		pending_package_hours?: number | null;
		design_status?: string | null;
	};
	const events: EventRow[] = ((listResult.data ?? []) as RawEventRow[]).map(
		(row) => {
			const pkg = Array.isArray(row.package) ? row.package[0] : row.package;
			const bd = Array.isArray(row.backdrop) ? row.backdrop[0] : row.backdrop;
			const customName = row.custom_package_name;
			const cat = row.event_category ?? null;
			return {
				id: row.id,
				project_id: row.project_id,
				status: row.status,
				channel: row.channel,
				vendor_name: row.vendor_name,
				client_name: row.client_name,
				event_date: row.event_date,
				setup_time: row.setup_time,
				start_time: row.start_time,
				end_time: row.end_time,
				frame_size: row.frame_size,
				backdrop_color: row.backdrop_color,
				include_flashdisk_pouch: row.include_flashdisk_pouch,
				venue_name: row.venue_name,
				venue_city: row.venue_city,
				grand_total: row.grand_total,
				remaining_balance: row.remaining_balance,
				payment_status: row.payment_status,
				is_migrated_legacy: row.is_migrated_legacy,
				legacy_invoice_number: row.legacy_invoice_number,
				package_name: pkg?.name ?? customName ?? null,
				package_duration_hours: pkg?.duration_hours ?? null,
				backdrop_name: bd?.name ?? null,
				backdrop_type: bd?.type ?? null,
				event_category: cat,
				event_category_label: cat
					? (eventTypeLabelByCode.get(cat) ?? cat)
					: null,
				// Data yang masih menyusul — SATU definisi dengan reminder owner,
				// tampilan crew, dan bot Telegram (lib/events/tbc.ts). Hanya untuk
				// event yang masih akan/sedang berjalan: event selesai atau batal
				// tidak ada gunanya lagi dikejar, dan baris legacy memang tidak
				// pernah punya data lengkap.
				missing_info:
					!row.is_migrated_legacy &&
					(row.status === "upcoming" || row.status === "in_progress")
						? listMissingFields({
								event_date_is_estimate: row.event_date_is_estimate,
								venue_name: row.venue_name,
								start_time: row.start_time,
								frame_size: row.frame_size,
								backdrop_id: row.backdrop_id,
								pic_name: row.pic_name,
								pic_contact_id: row.pic_contact_id,
								pic_wa: row.pic_wa,
								pending_package_hours: row.pending_package_hours,
								package_frame_size: pkg?.frame_size ?? null,
							})
						: [],
				design_status: row.design_status ?? null,
			};
		},
	);

	const crewByEvent = new Map<string, CrewChip[]>();
	if (events.length > 0) {
		const { data: crewRows } = await supabase
			.from("crew_assignments")
			.select(
				`event_id, role_in_event,
				user:users!crew_assignments_user_id_fkey(id, full_name, nickname, tier)`,
			)
			.in(
				"event_id",
				events.map((e) => e.id),
			);

		for (const row of (crewRows ?? []) as Array<{
			event_id: string;
			role_in_event: string;
			user:
				| {
						id: string;
						full_name: string;
						nickname: string | null;
						tier: "senior" | "junior" | null;
				  }
				| Array<{
						id: string;
						full_name: string;
						nickname: string | null;
						tier: "senior" | "junior" | null;
				  }>
				| null;
		}>) {
			const u = Array.isArray(row.user) ? row.user[0] : row.user;
			if (!u) continue;
			const list = crewByEvent.get(row.event_id) ?? [];
			list.push({
				user_id: u.id,
				full_name: u.full_name,
				nickname: u.nickname,
				tier: u.tier,
				role_in_event: row.role_in_event,
			});
			crewByEvent.set(row.event_id, list);
		}
		for (const [k, list] of crewByEvent.entries()) {
			list.sort((a, b) => {
				if (a.role_in_event === b.role_in_event) return 0;
				if (a.role_in_event === "lead") return -1;
				if (b.role_in_event === "lead") return 1;
				return 0;
			});
			crewByEvent.set(k, list);
		}
	}

	const crewList = (crewListResult.data ?? []) as Array<{
		id: string;
		full_name: string;
		nickname: string | null;
		tier: "senior" | "junior" | null;
	}>;

	const vendorNames = [
		...new Set(
			((vendorListResult.data ?? []) as Array<{ vendor_name: string | null }>)
				.map((v) => v.vendor_name?.trim())
				.filter((v): v is string => Boolean(v)),
		),
	].sort((a, b) => a.localeCompare(b, "id"));

	const totalCount = totalCountResult.count ?? 0;
	const thisMonthCount = thisMonthCountResult.count ?? 0;
	const thisYearCount = thisYearCountResult.count ?? 0;
	const awaitingCount = awaitingCountResult.count ?? 0;
	const completedCount = completedCountResult.count ?? 0;

	// Targets live in system_config (category "targets"), editable in Settings.
	// Values are JSONB numbers; fall back to 0 (no progress bar) if unset.
	const targetByKey = new Map<string, number>(
		((targetConfigResult.data ?? []) as Array<{ key: string; value: unknown }>)
			.map((r) => [r.key, Number(r.value)] as const)
			.filter(([, v]) => Number.isFinite(v)),
	);
	const monthlyTarget = targetByKey.get("event_target_monthly") ?? 0;
	const yearlyTarget = targetByKey.get("event_target_yearly") ?? 0;

	// `month` is always set (auto-defaults to current month), so consider it
	// a "user-set" filter only when explicitly different from the default.
	const isCustomMonth =
		monthParam === "all" ||
		(Boolean(monthParam) && monthParam !== currentYearMonth());
	const hasFilters = Boolean(q || status || isCustomMonth || crewFilter);
	const isSuperAdmin = me?.profile.role === "super_admin";

	const selectedCrew = crewFilter
		? crewList.find((c) => c.id === crewFilter)
		: null;

	return (
		<Container size="xl" className="space-y-3">
			<MonthMemory />
			<SectionHeader
				title="Operations"
				description="Kelola event dari draft sampai pelunasan."
				actions={
					<>
						<OperationsViewSwitcher current="list" />
						{isSuperAdmin && (
							<Link
								href="/settings/operations/import-projects"
								title="Bulk-import projects from old Apps Script v1"
								className={buttonVariants({
									variant: "outline",
									className: "h-9",
								})}
							>
								<Upload className="size-3.5" />
								<span className="hidden sm:inline">Import legacy</span>
							</Link>
						)}
						<Link
							href="/operations/new"
							className={buttonVariants({
								variant: "default",
								className: "h-9",
							})}
						>
							<Plus className="size-3.5" />
							<span className="hidden sm:inline">New booking</span>
						</Link>
					</>
				}
			/>

			<KpiRow className="lg:grid-cols-5">
				<KpiCard
					label="Total Events"
					value={totalCount.toLocaleString("id-ID")}
					hint="Semua event tercatat (termasuk arsip)"
					icon={Briefcase}
					accent="primary"
				/>
				<KpiCard
					label="Bulan Ini"
					value={thisMonthCount.toLocaleString("id-ID")}
					hint={`${today.toLocaleDateString("id-ID", { month: "long", year: "numeric" })} · tanpa yang batal`}
					icon={CalendarClock}
					accent="emerald"
					progress={
						monthlyTarget > 0
							? { current: thisMonthCount, target: monthlyTarget }
							: undefined
					}
				/>
				<KpiCard
					label="Tahun Ini"
					value={thisYearCount.toLocaleString("id-ID")}
					hint={`${today.getFullYear()} · tanpa yang batal`}
					icon={CalendarRange}
					accent="sky"
					progress={
						yearlyTarget > 0
							? { current: thisYearCount, target: yearlyTarget }
							: undefined
					}
				/>
				<KpiCard
					label="Awaiting Settlement"
					value={awaitingCount.toLocaleString("id-ID")}
					hint="Event selesai, belum di-settle"
					icon={AlertCircle}
					accent="amber"
				/>
				<KpiCard
					label="Completed"
					value={completedCount.toLocaleString("id-ID")}
					hint="Event selesai & sudah di-settle"
					icon={CheckCircle2}
					accent="emerald"
				/>
			</KpiRow>

			<div className="space-y-3">
				<OperationsFilterBar
					defaultQ={q}
					defaultStatus={status}
					defaultMonth={month}
					monthShowsAll={monthParam === "all"}
					defaultCrew={crewFilter}
					crewOptions={crewList}
					defaultVendor={vendorFilter}
					vendorOptions={vendorNames}
					defaultSort={sort}
				/>

				{selectedCrew && (
					<div className="flex items-center gap-2 rounded-md border border-border-default bg-secondary px-3 py-2">
						<Users
							className="size-3.5 text-foreground"
							aria-hidden
							strokeWidth={2}
						/>
						<span className="text-[12.5px] text-foreground">
							Filtering by crew:{" "}
							<span className="font-semibold">{selectedCrew.full_name}</span>
							{selectedCrew.tier && (
								<span className="ml-1 uppercase text-muted-foreground">
									· {selectedCrew.tier}
								</span>
							)}
						</span>
						<Link
							href="/operations"
							className="ml-auto text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
						>
							Clear
						</Link>
					</div>
				)}

				{events.length === 0 ? (
					<EmptyState
						icon={CalendarPlus}
						title={
							hasFilters ? "Tidak ada event yang cocok" : "Belum ada booking"
						}
						description={
							hasFilters
								? "Coba ubah atau hapus filter di atas."
								: "Klik New booking buat bikin event pertama. Bookingan masuk akan muncul di sini."
						}
						action={
							!hasFilters ? (
								<Link
									href="/operations/new"
									className={buttonVariants({ variant: "default" })}
								>
									<Plus className="size-4" />
									New booking
								</Link>
							) : undefined
						}
					/>
				) : (
					<OperationsListTable
						events={events}
						crewByEventEntries={Array.from(crewByEvent.entries())}
						crewFilter={crewFilter}
					/>
				)}
			</div>

			<Fab href="/operations/new" label="Booking baru" className="md:hidden" />
		</Container>
	);
}
