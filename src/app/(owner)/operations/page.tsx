import {
	AlertCircle,
	Archive,
	Briefcase,
	CalendarClock,
	CalendarPlus,
	Inbox,
	Plus,
	Upload,
	Users,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { OperationsFilterBar } from "@/components/operations/filter-bar";
import { KpiCard } from "@/components/operations/kpi-card";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { getCurrentUser } from "@/lib/auth/get-user";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type EventRow = {
	id: string;
	project_id: string;
	status: string;
	channel: string;
	client_name: string;
	event_date: string;
	venue_name: string;
	venue_city: string | null;
	grand_total: number;
	payment_status: string;
	is_migrated_legacy: boolean | null;
	legacy_invoice_number: string | null;
};

type CrewChip = {
	user_id: string;
	full_name: string;
	nickname: string | null;
	tier: "senior" | "junior" | null;
	role_in_event: string;
};

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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
	const month = params.month?.trim() ?? "";
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
			"id, project_id, status, channel, client_name, event_date, venue_name, venue_city, grand_total, payment_status, is_migrated_legacy, legacy_invoice_number",
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
	]);

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

	const events = (listResult.data ?? []) as EventRow[];

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

	const hasFilters = Boolean(q || status || month || showArchived || crewFilter);
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
								className={buttonVariants({ variant: "ghost", size: "sm" })}
							>
								<Upload className="size-4" />
								<span className="hidden sm:inline">Import legacy</span>
							</Link>
						)}
						<Link
							href="/operations/new"
							className={buttonVariants({ variant: "default" })}
						>
							<Plus className="size-4" />
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
					defaultShowArchived={showArchived}
					archivedCount={archivedCount}
					defaultCrew={crewFilter}
					crewOptions={crewList}
				/>

				{selectedCrew && (
					<div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
						<Users className="size-3.5 text-primary" aria-hidden />
						<span className="text-fluid-caption text-foreground">
							Filtering by crew:{" "}
							<span className="font-medium">{selectedCrew.full_name}</span>
							{selectedCrew.tier && (
								<span className="ml-1 uppercase text-muted-foreground">
									· {selectedCrew.tier}
								</span>
							)}
						</span>
						<Link
							href="/operations"
							className="ml-auto text-fluid-caption text-muted-foreground hover:text-foreground"
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
					<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
						<ResponsiveTable<EventRow>
							keyExtractor={(ev) => ev.id}
							rows={events}
							columns={buildOperationsColumns({ crewByEvent, crewFilter })}
						/>
					</div>
				)}
			</div>
		</Container>
	);
}

function buildOperationsColumns({
	crewByEvent,
	crewFilter,
}: {
	crewByEvent: Map<string, CrewChip[]>;
	crewFilter: string;
}): ResponsiveTableColumn<EventRow>[] {
	return [
		{
			key: "project_id",
			header: "Project ID",
			mobileLabel: "ID",
			render: (ev) => (
				<div className="flex items-center gap-1.5 tabular text-fluid-caption font-medium">
					<Link
						href={`/operations/${ev.project_id}`}
						className="text-primary hover:underline"
					>
						{ev.project_id}
					</Link>
					{ev.is_migrated_legacy && (
						<span
							className="inline-flex h-4 items-center rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"
							title="Migrated from Phase-2 (read-only)"
						>
							<Archive className="size-2.5" />
						</span>
					)}
					{!ev.is_migrated_legacy && ev.legacy_invoice_number && (
						<span
							className="inline-flex h-4 items-center rounded border border-border-default px-1 text-[10px] font-medium text-muted-foreground"
							title={`Imported from Phase-2 (invoice ${ev.legacy_invoice_number})`}
						>
							<Inbox className="size-2.5" />
						</span>
					)}
				</div>
			),
		},
		{
			key: "client_name",
			header: "Client",
			mobileLabel: "Klien",
		},
		{
			key: "event_date",
			header: "Event Date",
			mobileLabel: "Tanggal",
			render: (ev) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{formatDateID(ev.event_date)}
				</span>
			),
		},
		{
			key: "venue",
			header: "Venue",
			hideOnMobile: true,
			render: (ev) => (
				<span className="truncate text-fluid-caption text-muted-foreground">
					{ev.venue_name}
					{ev.venue_city && (
						<span className="text-muted-foreground/60">
							{" · "}
							{ev.venue_city}
						</span>
					)}
				</span>
			),
		},
		{
			key: "crew",
			header: "Crew",
			render: (ev) => (
				<CrewChips
					crew={crewByEvent.get(ev.id) ?? []}
					highlightUserId={crewFilter || undefined}
				/>
			),
		},
		{
			key: "channel",
			header: "Channel",
			hideOnMobile: true,
			render: (ev) => (
				<span className="text-fluid-caption text-muted-foreground">
					{CHANNEL_TYPE_LABELS[ev.channel] ?? ev.channel}
				</span>
			),
		},
		{
			key: "status",
			header: "Status",
			render: (ev) => <EventStatusBadge status={ev.status} />,
		},
		{
			key: "grand_total",
			header: "Grand Total",
			align: "right",
			render: (ev) => (
				<span className="tabular font-medium">
					{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
				</span>
			),
		},
		{
			key: "payment_status",
			header: "Payment",
			mobileLabel: "Pembayaran",
			render: (ev) => <PaymentStatusBadge status={ev.payment_status} />,
		},
	];
}

function CrewChips({
	crew,
	highlightUserId,
}: {
	crew: CrewChip[];
	highlightUserId?: string;
}) {
	if (crew.length === 0) {
		return <span className="text-fluid-caption text-muted-foreground/60">—</span>;
	}
	const visible = crew.slice(0, 3);
	const overflow = crew.length - visible.length;
	return (
		<div className="flex items-center gap-1">
			{visible.map((c) => {
				const isLead = c.role_in_event === "lead";
				const initials = (c.nickname ?? c.full_name)
					.split(/\s+/)
					.slice(0, 2)
					.map((p) => p[0])
					.join("")
					.toUpperCase();
				const highlighted = highlightUserId === c.user_id;
				return (
					<span
						key={c.user_id}
						title={`${c.full_name}${c.tier ? ` · ${c.tier}` : ""} · ${c.role_in_event}`}
						className={`inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ${
							highlighted
								? "ring-primary"
								: isLead
									? "ring-emerald-500/30"
									: "ring-sky-500/30"
						} ${
							isLead
								? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
								: "bg-sky-500/15 text-sky-700 dark:text-sky-300"
						}`}
					>
						{initials || "?"}
					</span>
				);
			})}
			{overflow > 0 && (
				<span
					title={`${overflow} crew lainnya`}
					className="inline-flex size-6 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-muted-foreground"
				>
					+{overflow}
				</span>
			)}
		</div>
	);
}
