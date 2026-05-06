import { CalendarPlus, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
	EVENT_STATUS_LABELS,
	formatDateID,
	formatRupiah,
	PAYMENT_STATUS_LABELS,
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

const STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "outline" | "destructive"
> = {
	draft: "outline",
	confirmed: "default",
	design_brief: "secondary",
	design_approved: "secondary",
	upcoming: "default",
	in_progress: "default",
	awaiting_settlement: "secondary",
	completed: "secondary",
	cancelled: "destructive",
	archived: "outline",
};

export default async function OperationsListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("events")
		.select(
			"id, project_id, status, channel, client_name, event_date, venue_name, venue_city, grand_total, payment_status",
		)
		.order("event_date", { ascending: false })
		.limit(100);

	if (error) {
		return (
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat events: {error.message}
					</p>
				</div>
			</div>
		);
	}

	const events = (data ?? []) as EventRow[];

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="flex items-end justify-between">
				<div className="space-y-1">
					<h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
					<p className="text-muted-foreground text-sm">
						{events.length === 0
							? "Belum ada booking"
							: `${events.length} event${events.length > 1 ? "s" : ""}`}
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

			{events.length === 0 ? (
				<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
					<CalendarPlus className="text-muted-foreground h-10 w-10" />
					<div className="space-y-1">
						<h3 className="font-medium">Belum ada booking</h3>
						<p className="text-muted-foreground text-sm">
							Klik <span className="text-foreground font-medium">New booking</span>{" "}
							untuk bikin event pertama.
						</p>
					</div>
				</div>
			) : (
				<div className="border-border bg-card overflow-hidden rounded-lg border">
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
										{ev.project_id}
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
										<Badge variant={STATUS_VARIANT[ev.status] ?? "outline"}>
											{EVENT_STATUS_LABELS[ev.status] ?? ev.status}
										</Badge>
									</TableCell>
									<TableCell className="tabular text-right font-medium">
										{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{PAYMENT_STATUS_LABELS[ev.payment_status] ??
											ev.payment_status}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
