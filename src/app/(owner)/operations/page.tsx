import {
	AlertCircle,
	Briefcase,
	CalendarClock,
	CalendarPlus,
	Plus,
	Upload,
	Users,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { OperationsFilterBar } from "@/components/operations/filter-bar";
import { KpiCard } from "@/components/operations/kpi-card";
import {
	type CrewChip,
	type EventRow,
	OperationsListTable,
} from "@/components/operations/operations-list-table";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function currentYearMonth(): string {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export default async function OperationsListPage({
	searchParams,
}: {
	searchParams: Promise<{
		q?: string;
		status?: string;
		month?: string;
		show_archived?: string;
		crew?: string;
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
	const showArchived = params.show_archived === "1";
	const crewFilter = params.crew?.trim() ?? "";

	const me = await getCurrentUser();
	const supabase = await createClient();

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
			`id, project_id, status, channel, client_name, event_date,
			 setup_time, start_time, end_time,
			 frame_size, backdrop_color, include_flashdisk_pouch,
			 venue_name, venue_city, grand_total, remaining_balance, payment_status,
			 is_migrated_legacy, legacy_invoice_number, custom_package_name,
			 event_category,
			 package:packages(name, duration_hours),
			 backdrop:backdrops(name, type)`,
		)
		.is("deleted_at", null)
		.order("event_date", { ascending: false })
		.limit(100);

	if (!showArchived) {
		listQuery = listQuery
			.eq("is_migrated_legacy", false)
			.neq("status", "archived");
	}

	if (q) listQuery = listQuery.ilike("client_name", `%${q}%`);
	if (status) listQuery = listQuery.eq("status", status);
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

	const [
		listResult,
		totalCountResult,
		thisMonthCountResult,
		awaitingCountResult,
		outstandingResult,
		archivedCountResult,
		crewListResult,
		eventTypesResult,
	] = await Promise.all([
		listQuery,
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd)
			.in("status", ["confirmed", "upcoming", "in_progress"]),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.eq("status", "awaiting_settlement"),
		supabase
			.from("events")
			.select("remaining_balance")
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.neq("payment_status", "paid")
			.gt("remaining_balance", 0),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.or("is_migrated_legacy.eq.true,status.eq.archived"),
		supabase
			.from("users")
			.select("id, full_name, nickname, tier")
			.eq("role", "crew")
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("full_name", { ascending: true }),
		supabase.from("event_types").select("code, label").eq("is_active", true),
	]);

	const eventTypeLabelByCode = new Map<string, string>(
		((eventTypesResult.data ?? []) as Array<{
			code: string;
			label: string;
		}>).map((r) => [r.code, r.label]),
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

	type RawEventRow = Omit<
		EventRow,
		| "package_name"
		| "package_duration_hours"
		| "backdrop_name"
		| "backdrop_type"
		| "event_category_label"
	> & {
		package?:
			| { name: string | null; duration_hours: number | null }
			| Array<{ name: string | null; duration_hours: number | null }>
			| null;
		backdrop?:
			| { name: string | null; type: string | null }
			| Array<{ name: string | null; type: string | null }>
			| null;
		custom_package_name?: string | null;
		event_category?: string | null;
	};
	const events: EventRow[] = (
		(listResult.data ?? []) as RawEventRow[]
	).map((row) => {
		const pkg = Array.isArray(row.package) ? row.package[0] : row.package;
		const bd = Array.isArray(row.backdrop) ? row.backdrop[0] : row.backdrop;
		const customName = row.custom_package_name;
		const cat = row.event_category ?? null;
		return {
			id: row.id,
			project_id: row.project_id,
			status: row.status,
			channel: row.channel,
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
			event_category_label: cat ? (eventTypeLabelByCode.get(cat) ?? cat) : null,
		};
	});

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

	const totalCount = totalCountResult.count ?? 0;
	const thisMonthCount = thisMonthCountResult.count ?? 0;
	const awaitingCount = awaitingCountResult.count ?? 0;
	const outstanding = (outstandingResult.data ?? []).reduce(
		(sum, r) => sum + (r.remaining_balance ?? 0),
		0,
	);
	const archivedCount = archivedCountResult.count ?? 0;

	// `month` is always set (auto-defaults to current month), so consider it
	// a "user-set" filter only when explicitly different from the default.
	const isCustomMonth =
		monthParam === "all" || (Boolean(monthParam) && monthParam !== currentYearMonth());
	const hasFilters = Boolean(
		q || status || isCustomMonth || showArchived || crewFilter,
	);
	const isSuperAdmin = me?.profile.role === "super_admin";

	const selectedCrew = crewFilter
		? crewList.find((c) => c.id === crewFilter)
		: null;

	return (
		<Container size="xl" className="space-y-6">
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
								className={buttonVariants({ variant: "outline" })}
							>
								<Upload className="size-3.5" />
								<span className="hidden sm:inline">Import legacy</span>
							</Link>
						)}
						<Link
							href="/operations/new"
							className={buttonVariants({ variant: "default" })}
						>
							<Plus className="size-3.5" />
							<span className="hidden sm:inline">New booking</span>
						</Link>
					</>
				}
			/>

			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Total Events"
					value={totalCount.toLocaleString("id-ID")}
					icon={Briefcase}
					accent="primary"
				/>
				<KpiCard
					label="Bulan Ini"
					value={thisMonthCount.toLocaleString("id-ID")}
					hint="Confirmed / Upcoming / In Progress"
					icon={CalendarClock}
					accent="emerald"
				/>
				<KpiCard
					label="Awaiting Settlement"
					value={awaitingCount.toLocaleString("id-ID")}
					hint="Event selesai, belum di-settle"
					icon={AlertCircle}
					accent="amber"
				/>
				<KpiCard
					label="Outstanding"
					value={formatRupiah(outstanding)}
					hint="Total piutang dari semua event"
					icon={Wallet}
					accent="rose"
				/>
			</dl>

			<div className="space-y-3">
				<OperationsFilterBar
					defaultQ={q}
					defaultStatus={status}
					defaultMonth={month}
					monthShowsAll={monthParam === "all"}
					defaultShowArchived={showArchived}
					archivedCount={archivedCount}
					defaultCrew={crewFilter}
					crewOptions={crewList}
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
							hasFilters
								? "Tidak ada event yang cocok"
								: "Belum ada booking"
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
		</Container>
	);
}

