import {
	AlertCircle,
	Archive,
	Briefcase,
	CalendarClock,
	CalendarPlus,
	Inbox,
	Plus,
	Upload,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { OperationsFilterBar } from "@/components/operations/filter-bar";
import { KpiCard } from "@/components/operations/kpi-card";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
	}>;
}) {
	const params = await searchParams;
	const q = params.q?.trim() ?? "";
	const status = params.status?.trim() ?? "";
	const month = params.month?.trim() ?? "";
	const showArchived = params.show_archived === "1";

	const me = await getCurrentUser();
	const supabase = await createClient();

	let listQuery = supabase
		.from("events")
		.select(
			"id, project_id, status, channel, client_name, event_date, venue_name, venue_city, grand_total, payment_status, is_migrated_legacy, legacy_invoice_number",
		)
		.is("deleted_at", null)
		.order("event_date", { ascending: false })
		.limit(100);

	if (!showArchived) {
		listQuery = listQuery.eq("is_migrated_legacy", false).neq("status", "archived");
	}

	if (q) listQuery = listQuery.ilike("client_name", `%${q}%`);
	if (status) listQuery = listQuery.eq("status", status);
	if (month && /^\d{4}-\d{2}$/.test(month)) {
		const [y, m] = month.split("-").map(Number);
		const start = `${month}-01`;
		const end = lastDayOfMonth(y, m);
		listQuery = listQuery.gte("event_date", start).lte("event_date", end);
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
	]);

	if (listResult.error) {
		return (
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat events: {listResult.error.message}
					</p>
				</div>
			</div>
		);
	}

	const events = (listResult.data ?? []) as EventRow[];
	const totalCount = totalCountResult.count ?? 0;
	const thisMonthCount = thisMonthCountResult.count ?? 0;
	const awaitingCount = awaitingCountResult.count ?? 0;
	const outstanding = (outstandingResult.data ?? []).reduce(
		(sum, r) => sum + (r.remaining_balance ?? 0),
		0,
	);
	const archivedCount = archivedCountResult.count ?? 0;

	const hasFilters = Boolean(q || status || month || showArchived);
	const isSuperAdmin = me?.profile.role === "super_admin";

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
					<p className="text-muted-foreground text-sm">
						Kelola event dari draft sampai pelunasan.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<OperationsViewSwitcher current="list" />
					{isSuperAdmin && (
						<Link
							href="/settings/operations/import-projects"
							className="text-muted-foreground hover:text-foreground inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium"
							title="Bulk-import projects from old Apps Script v1"
						>
							<Upload className="h-4 w-4" />
							Import legacy
						</Link>
					)}
					<Link
						href="/operations/new"
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium"
					>
						<Plus className="h-4 w-4" />
						New booking
					</Link>
				</div>
			</div>

			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
				/>

				{events.length === 0 ? (
					<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
						<CalendarPlus className="text-muted-foreground h-10 w-10" />
						<div className="space-y-1">
							<h3 className="font-medium">
								{hasFilters
									? "Tidak ada event yang cocok"
									: "Belum ada booking"}
							</h3>
							<p className="text-muted-foreground text-sm">
								{hasFilters
									? "Coba ubah atau hapus filter."
									: "Klik New booking untuk bikin event pertama."}
							</p>
						</div>
					</div>
				) : (
					<div className="border-border bg-card overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Project ID</TableHead>
									<TableHead>Client</TableHead>
									<TableHead>Event Date</TableHead>
									<TableHead>Venue</TableHead>
									<TableHead>Channel</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Grand Total</TableHead>
									<TableHead>Payment</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{events.map((ev) => (
									<TableRow key={ev.id}>
										<TableCell className="tabular text-xs font-medium">
											<div className="flex items-center gap-1.5">
												<Link
													href={`/operations/${ev.project_id}`}
													className="text-primary hover:underline"
												>
													{ev.project_id}
												</Link>
												{ev.is_migrated_legacy && (
													<span
														className="inline-flex h-4 items-center rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
														title="Migrated from Phase-2 (read-only)"
													>
														<Archive className="h-2.5 w-2.5" />
													</span>
												)}
												{!ev.is_migrated_legacy && ev.legacy_invoice_number && (
													<span
														className="border-border text-muted-foreground inline-flex h-4 items-center rounded border px-1 text-[10px] font-medium"
														title={`Imported from Phase-2 (invoice ${ev.legacy_invoice_number})`}
													>
														<Inbox className="h-2.5 w-2.5" />
													</span>
												)}
											</div>
										</TableCell>
										<TableCell>{ev.client_name}</TableCell>
										<TableCell className="tabular text-muted-foreground text-sm">
											{formatDateID(ev.event_date)}
										</TableCell>
										<TableCell className="text-muted-foreground truncate text-sm">
											{ev.venue_name}
											{ev.venue_city && (
												<span className="text-muted-foreground/60">
													{" · "}
													{ev.venue_city}
												</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{CHANNEL_TYPE_LABELS[ev.channel] ?? ev.channel}
										</TableCell>
										<TableCell>
											<EventStatusBadge status={ev.status} />
										</TableCell>
										<TableCell className="tabular text-right font-medium">
											{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
										</TableCell>
										<TableCell>
											<PaymentStatusBadge status={ev.payment_status} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</div>
	);
}
