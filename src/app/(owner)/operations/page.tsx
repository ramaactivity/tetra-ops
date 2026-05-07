import {
	AlertCircle,
	Briefcase,
	CalendarClock,
	CalendarPlus,
	Plus,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { OperationsFilterBar } from "@/components/operations/filter-bar";
import { KpiCard } from "@/components/operations/kpi-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	CHANNEL_TYPE_LABELS,
	formatDateID,
	formatRupiah,
} from "@/lib/format";
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
};

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default async function OperationsListPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string; month?: string }>;
}) {
	const params = await searchParams;
	const q = params.q?.trim() ?? "";
	const status = params.status?.trim() ?? "";
	const month = params.month?.trim() ?? "";

	const supabase = await createClient();

	let listQuery = supabase
		.from("events")
		.select(
			"id, project_id, status, channel, client_name, event_date, venue_name, venue_city, grand_total, payment_status",
		)
		.is("deleted_at", null)
		.order("event_date", { ascending: false })
		.limit(100);

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
	] = await Promise.all([
		listQuery,
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd)
			.in("status", ["confirmed", "upcoming", "in_progress"]),
		supabase
			.from("events")
			.select("id", { count: "exact", head: true })
			.is("deleted_at", null)
			.eq("status", "awaiting_settlement"),
		supabase
			.from("events")
			.select("remaining_balance")
			.is("deleted_at", null)
			.neq("payment_status", "paid")
			.gt("remaining_balance", 0),
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

	const hasFilters = Boolean(q || status || month);

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
					<p className="text-muted-foreground text-sm">
						Kelola event dari draft sampai pelunasan.
					</p>
				</div>
				<Link
					href="/operations/new"
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium"
				>
					<Plus className="h-4 w-4" />
					New booking
				</Link>
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
				/>

				{events.length === 0 ? (
					<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
						<CalendarPlus className="text-muted-foreground h-10 w-10" />
						<div className="space-y-1">
							<h3 className="font-medium">
								{hasFilters ? "Tidak ada event yang cocok" : "Belum ada booking"}
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
											<Link
												href={`/operations/${ev.project_id}`}
												className="text-primary hover:underline"
											>
												{ev.project_id}
											</Link>
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
