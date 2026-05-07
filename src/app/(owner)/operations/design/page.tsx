import {
	CheckCircle2,
	ExternalLink,
	Palette,
	Plus,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { OperationsViewSwitcher } from "@/components/operations/view-switcher";
import { formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type DesignEvent = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	event_date: string;
	venue_name: string;
	design_brief_at: string | null;
	design_approved_at: string | null;
	design_drive_folder_url: string | null;
};

function daysUntil(eventDate: string): number {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const ev = new Date(eventDate);
	ev.setHours(0, 0, 0, 0);
	return Math.round((ev.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function OperationsDesignHubPage() {
	const supabase = await createClient();

	const today = new Date();
	const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

	// Pull all upcoming events that need design attention (any active pre-event status)
	const { data, error } = await supabase
		.from("events")
		.select(
			`id, project_id, status, client_name, event_date, venue_name,
			design_brief_at, design_approved_at, design_drive_folder_url`,
		)
		.is("deleted_at", null)
		.gte("event_date", todayKey)
		.in("status", [
			"draft",
			"confirmed",
			"design_brief",
			"design_approved",
			"upcoming",
		])
		.order("event_date", { ascending: true })
		.limit(200);

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

	const events = (data ?? []) as DesignEvent[];

	// Bucket
	const needBrief = events.filter(
		(e) => !e.design_drive_folder_url && !e.design_approved_at,
	);
	const briefUploaded = events.filter(
		(e) => e.design_drive_folder_url && !e.design_approved_at,
	);
	const approved = events.filter((e) => e.design_approved_at);

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-3xl font-semibold tracking-tight">Design Hub</h1>
					<p className="text-muted-foreground text-sm">
						{events.length} event aktif perlu attention design ·{" "}
						{needBrief.length} belum brief · {briefUploaded.length} pending
						review · {approved.length} approved.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<OperationsViewSwitcher current="design" />
					<Link
						href="/operations/new"
						className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium"
					>
						<Plus className="h-4 w-4" />
						New booking
					</Link>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<DesignColumn
					title="Belum brief"
					hint="Upload mockup / referensi"
					tone="primary"
					events={needBrief}
					emptyLabel="Semua event sudah ada brief 🎉"
				/>
				<DesignColumn
					title="Pending review"
					hint="Review dengan klien lalu approve"
					tone="amber"
					events={briefUploaded}
					emptyLabel="Tidak ada brief yang menunggu approval"
				/>
				<DesignColumn
					title="Approved"
					hint="Siap eksekusi"
					tone="emerald"
					events={approved}
					emptyLabel="Belum ada design approved"
				/>
			</div>
		</div>
	);
}

function DesignColumn({
	title,
	hint,
	tone,
	events,
	emptyLabel,
}: {
	title: string;
	hint: string;
	tone: "primary" | "amber" | "emerald";
	events: DesignEvent[];
	emptyLabel: string;
}) {
	const accent =
		tone === "primary"
			? "border-primary/40 bg-primary/5"
			: tone === "amber"
				? "border-amber-500/40 bg-amber-500/5"
				: "border-emerald-500/40 bg-emerald-500/5";
	const dot =
		tone === "primary"
			? "bg-primary"
			: tone === "amber"
				? "bg-amber-500"
				: "bg-emerald-500";

	return (
		<section
			className={`flex flex-col gap-3 rounded-xl border p-4 ${accent}`}
			aria-label={title}
		>
			<header className="space-y-1">
				<div className="flex items-baseline justify-between">
					<div className="flex items-center gap-2">
						<span className={`${dot} h-2 w-2 rounded-full`} />
						<h2 className="text-base font-semibold">{title}</h2>
					</div>
					<span className="bg-background/70 text-foreground tabular rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">
						{events.length}
					</span>
				</div>
				<p className="text-muted-foreground text-xs">{hint}</p>
			</header>

			<div className="flex flex-1 flex-col gap-2">
				{events.length === 0 ? (
					<p className="text-muted-foreground/70 px-2 py-6 text-center text-xs italic">
						{emptyLabel}
					</p>
				) : (
					events.map((ev) => <DesignCardItem key={ev.id} event={ev} />)
				)}
			</div>
		</section>
	);
}

function DesignCardItem({ event }: { event: DesignEvent }) {
	const days = daysUntil(event.event_date);
	const dayLabel =
		days === 0
			? "Hari ini"
			: days === 1
				? "Besok"
				: days > 0
					? `H-${days}`
					: `${Math.abs(days)} hari lalu`;
	const isHot = days >= 0 && days <= 3;
	const isApproved = !!event.design_approved_at;
	const hasBrief = !!event.design_drive_folder_url;

	return (
		<Link
			href={`/operations/${event.project_id}`}
			className="border-border bg-surface-2 hover:border-primary/40 block space-y-2 rounded-lg border p-3 transition-colors"
		>
			<div className="flex items-baseline justify-between gap-2">
				<p className="text-sm font-semibold leading-tight">
					{event.client_name}
				</p>
				{isHot && !isApproved && (
					<span className="bg-rose-500/15 text-rose-600 dark:text-rose-300 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
						🔥 hot
					</span>
				)}
			</div>
			<p className="text-muted-foreground tabular text-[10px]">
				{event.project_id}
			</p>
			<div className="space-y-0.5 text-xs">
				<p className="tabular text-foreground">
					{formatDateID(event.event_date)}
					<span className="text-muted-foreground ml-0.5">· {dayLabel}</span>
				</p>
				<p className="text-muted-foreground truncate">{event.venue_name}</p>
			</div>

			{hasBrief && event.design_drive_folder_url && (
				<div
					className="text-primary inline-flex items-center gap-1 text-[10px]"
					title={event.design_drive_folder_url}
				>
					<ExternalLink className="h-3 w-3" />
					<span className="truncate font-mono">Drive folder</span>
				</div>
			)}

			<div className="flex items-center gap-1.5 pt-1 text-[10px]">
				{isApproved ? (
					<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 font-medium">
						<CheckCircle2 className="h-3 w-3" />
						Approved
					</span>
				) : hasBrief ? (
					<span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5 font-medium">
						<Sparkles className="h-3 w-3" />
						Pending review
					</span>
				) : (
					<span className="text-primary inline-flex items-center gap-0.5 font-medium">
						<Palette className="h-3 w-3" />
						Need brief
					</span>
				)}
			</div>
		</Link>
	);
}
