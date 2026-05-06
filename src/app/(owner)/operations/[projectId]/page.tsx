import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
	CHANNEL_TYPE_LABELS,
	EVENT_STATUS_LABELS,
	FRAME_SIZE_LABELS,
	formatDateID,
	formatRupiah,
	PAYMENT_STATUS_LABELS,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "outline" | "destructive"
> = {
	draft: "outline",
	confirmed: "default",
	upcoming: "default",
	in_progress: "default",
	completed: "secondary",
	cancelled: "destructive",
	archived: "outline",
};

export default async function EventDetailPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const supabase = await createClient();

	const { data: event, error } = await supabase
		.from("events")
		.select(
			`
			id, project_id, status, channel, client_name, client_wa, client_email,
			service_type, frame_size, package_id, event_category, event_date,
			setup_time, start_time, end_time, venue_name, venue_address, venue_city,
			grand_total, total_paid, remaining_balance, payment_status,
			created_at, updated_at,
			package:packages(id, name, base_price, duration_hours)
		`,
		)
		.eq("project_id", projectId)
		.maybeSingle();

	if (error) {
		return (
			<div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat event: {error.message}
					</p>
				</div>
			</div>
		);
	}

	if (!event) notFound();

	const pkg = Array.isArray(event.package) ? event.package[0] : event.package;

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href="/operations"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Operations
				</Link>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight">
							{event.client_name}
						</h1>
						<p className="text-muted-foreground tabular text-sm">
							{event.project_id}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant={STATUS_VARIANT[event.status] ?? "outline"}>
							{EVENT_STATUS_LABELS[event.status] ?? event.status}
						</Badge>
						<Badge variant="outline">
							{CHANNEL_TYPE_LABELS[event.channel] ?? event.channel}
						</Badge>
					</div>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<DetailCard title="Klien">
					<DetailRow label="Nama">{event.client_name}</DetailRow>
					<DetailRow label="WA">
						<a
							href={`https://wa.me/${event.client_wa.replace(/^\+|^0/, "62")}`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline tabular inline-flex items-center gap-1"
						>
							{event.client_wa}
							<ExternalLink className="h-3 w-3" />
						</a>
					</DetailRow>
					<DetailRow label="Email">{event.client_email ?? "—"}</DetailRow>
				</DetailCard>

				<DetailCard title="Service">
					<DetailRow label="Service">
						{SERVICE_TYPE_LABELS[event.service_type] ?? event.service_type}
					</DetailRow>
					<DetailRow label="Frame">
						{FRAME_SIZE_LABELS[event.frame_size] ?? event.frame_size}
					</DetailRow>
					<DetailRow label="Package">
						{pkg ? (
							<span>
								{pkg.name}
								<span className="text-muted-foreground">
									{" · "}
									{pkg.duration_hours}j · {formatRupiah(pkg.base_price)}
								</span>
							</span>
						) : (
							<span className="text-muted-foreground">Custom / belum dipilih</span>
						)}
					</DetailRow>
				</DetailCard>

				<DetailCard title="Event">
					<DetailRow label="Kategori">{event.event_category}</DetailRow>
					<DetailRow label="Tanggal">{formatDateID(event.event_date)}</DetailRow>
					<DetailRow label="Setup">{event.setup_time}</DetailRow>
					<DetailRow label="Start">{event.start_time}</DetailRow>
					<DetailRow label="End">{event.end_time}</DetailRow>
				</DetailCard>

				<DetailCard title="Lokasi">
					<DetailRow label="Venue">{event.venue_name}</DetailRow>
					<DetailRow label="Alamat">{event.venue_address ?? "—"}</DetailRow>
					<DetailRow label="Kota">{event.venue_city ?? "—"}</DetailRow>
				</DetailCard>

				<DetailCard title="Financial" className="md:col-span-2">
					<DetailRow label="Grand Total">
						<span className="tabular font-medium">
							{event.grand_total ? formatRupiah(event.grand_total) : "—"}
						</span>
					</DetailRow>
					<DetailRow label="Total Paid">
						<span className="tabular">
							{event.total_paid ? formatRupiah(event.total_paid) : "—"}
						</span>
					</DetailRow>
					<DetailRow label="Remaining">
						<span className="tabular">
							{event.remaining_balance
								? formatRupiah(event.remaining_balance)
								: "—"}
						</span>
					</DetailRow>
					<DetailRow label="Payment Status">
						{PAYMENT_STATUS_LABELS[event.payment_status] ??
							event.payment_status}
					</DetailRow>
				</DetailCard>
			</div>

			<div className="border-border bg-card rounded-xl border border-dashed p-6 text-center">
				<p className="text-muted-foreground text-sm">
					Edit event, addons, crew assignment, payment logging — Phase 1
					Week 3+ lanjutan.
				</p>
			</div>
		</div>
	);
}

function DetailCard({
	title,
	className,
	children,
}: {
	title: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={`border-border bg-card space-y-3 rounded-xl border p-5 ${className ?? ""}`}
		>
			<h3 className="text-sm font-semibold tracking-tight">{title}</h3>
			<dl className="space-y-2">{children}</dl>
		</div>
	);
}

function DetailRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-baseline justify-between gap-4 text-sm">
			<dt className="text-muted-foreground shrink-0 text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className="text-foreground min-w-0 truncate text-right">
				{children}
			</dd>
		</div>
	);
}
