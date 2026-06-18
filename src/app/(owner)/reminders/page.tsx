import {
	AlertTriangle,
	CalendarClock,
	CheckCircle2,
	Clock,
	Inbox,
	MessageCircle,
	Users,
} from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { ReminderBatchClient } from "@/components/reminders/batch-client";
import {
	BUCKET_DESCRIPTIONS,
	BUCKET_LABELS,
	BUCKET_TEMPLATE_HINT,
	type ReminderBucket,
} from "@/components/reminders/buckets";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type EventRow = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	client_wa: string;
	pic_name: string | null;
	pic_wa: string | null;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	venue_name: string;
	due_date: string | null;
	total_paid: number;
	remaining_balance: number;
	grand_total: number;
	payment_status: string;
	booker_contact: { name: string | null; phone: string | null } | null;
	pic_contact: { name: string | null; phone: string | null } | null;
	package: { name: string | null; duration_hours: number | null } | null;
	crew_assignments: Array<{
		role_in_event: string;
		user: { full_name: string | null; nickname: string | null } | null;
	}>;
};

type LastReminder = {
	event_id: string;
	template_code: string;
	sent_at: string;
};

const BUCKETS: ReminderBucket[] = [
	"h3_pelunasan",
	"h7_dp",
	"h1_konfirmasi",
	"overdue",
];

function todayPlus(days: number): string {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + days);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayISO(): string {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const BUCKET_ICONS: Record<ReminderBucket, typeof Clock> = {
	h3_pelunasan: Clock,
	h7_dp: CalendarClock,
	h1_konfirmasi: Users,
	overdue: AlertTriangle,
};

const BUCKET_ACCENT: Record<
	ReminderBucket,
	"amber" | "sky" | "emerald" | "rose"
> = {
	h3_pelunasan: "amber",
	h7_dp: "sky",
	h1_konfirmasi: "emerald",
	overdue: "rose",
};

const BUCKET_HINTS: Record<ReminderBucket, string> = {
	h3_pelunasan: "Sisa belum lunas",
	h7_dp: "DP belum masuk",
	h1_konfirmasi: "Konfirmasi besok",
	overdue: "Lewat, belum lunas",
};

export default async function RemindersPage({
	searchParams,
}: {
	searchParams: Promise<{ bucket?: string }>;
}) {
	const params = await searchParams;
	const activeBucket: ReminderBucket = BUCKETS.includes(
		params.bucket as ReminderBucket,
	)
		? (params.bucket as ReminderBucket)
		: "h3_pelunasan";

	const me = await getCurrentUser();
	if (
		!me ||
		(me.profile.role !== "super_admin" && me.profile.role !== "owner")
	) {
		return (
			<div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Hanya owner / super_admin
					</p>
				</div>
			</div>
		);
	}

	const supabase = await createClient();

	const today = todayISO();
	const h7 = todayPlus(7);
	const h3 = todayPlus(3);
	const h1 = todayPlus(1);

	// Fetch all events that could appear in any bucket (today..today+7 + overdue),
	// plus active templates, plus last-reminder per event.
	const [eventsResult, templatesResult, remindersResult] = await Promise.all([
		supabase
			.from("events")
			.select(
				`
				id, project_id, status, client_name, client_wa, pic_name, pic_wa,
				event_date, setup_time, start_time, venue_name, due_date,
				total_paid, remaining_balance, grand_total, payment_status,
				booker_contact:contacts!events_booker_contact_id_fkey(name, phone),
				pic_contact:contacts!events_pic_contact_id_fkey(name, phone),
				package:packages(name, duration_hours),
				crew_assignments:crew_assignments(role_in_event, user:users!crew_assignments_user_id_fkey(full_name, nickname))
			`,
			)
			.is("deleted_at", null)
			.eq("is_migrated_legacy", false)
			.in("status", ["upcoming", "in_progress"])
			.gte("event_date", todayPlus(-90))
			.lte("event_date", h7)
			.order("event_date", { ascending: true })
			.limit(300),
		supabase
			.from("whatsapp_templates")
			.select("code, name, description, template_body")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		supabase
			.from("event_reminders_log")
			.select("event_id, template_code, sent_at")
			.order("sent_at", { ascending: false })
			.limit(500),
	]);

	if (eventsResult.error) {
		return (
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat events: {eventsResult.error.message}
					</p>
				</div>
			</div>
		);
	}

	const allEvents = (eventsResult.data ?? []) as unknown as EventRow[];
	const templates = templatesResult.data ?? [];
	const reminders = (remindersResult.data ?? []) as LastReminder[];

	// Build last-reminder map: event_id → most recent
	const lastByEvent = new Map<string, LastReminder>();
	for (const r of reminders) {
		if (!lastByEvent.has(r.event_id)) lastByEvent.set(r.event_id, r);
	}

	// Bucket assignment
	function bucketOf(e: EventRow): ReminderBucket | null {
		const d = e.event_date;
		const unpaid = e.payment_status !== "paid";
		const hasNoDp = e.payment_status === "unpaid" || e.total_paid === 0;
		if (d < today) {
			if (unpaid && e.remaining_balance > 0) return "overdue";
			return null;
		}
		if (d === h1) return "h1_konfirmasi";
		if (d === h3 && unpaid) return "h3_pelunasan";
		if (d === h7 && hasNoDp) return "h7_dp";
		// fall-through events still useful for "Custom send" but excluded from buckets
		return null;
	}

	const counts: Record<ReminderBucket, number> = {
		h3_pelunasan: 0,
		h7_dp: 0,
		h1_konfirmasi: 0,
		overdue: 0,
	};
	const eventsInBucket: EventRow[] = [];
	for (const e of allEvents) {
		const b = bucketOf(e);
		if (b) counts[b]++;
		if (b === activeBucket) eventsInBucket.push(e);
	}

	const suggestedTemplateCode = BUCKET_TEMPLATE_HINT[activeBucket];
	const suggestedTemplate = templates.find(
		(t) => t.code === suggestedTemplateCode,
	);

	// Resolve crew lead/asisten for the variable substitution payload
	function nameForRole(e: EventRow, role: string): string {
		const a = e.crew_assignments?.find((x) => x.role_in_event === role);
		return a?.user?.nickname ?? a?.user?.full_name ?? "";
	}

	// Build payload for client component (only what's needed to send)
	const clientPayload = eventsInBucket.map((e) => {
		const clientPhone = e.client_wa || e.booker_contact?.phone || "";
		const picPhone = e.pic_wa || e.pic_contact?.phone || "";
		const recipientPhone = clientPhone || picPhone;
		const recipientLabel: "client" | "pic" = clientPhone ? "client" : "pic";

		return {
			event_id: e.id,
			project_id: e.project_id,
			client_name: e.client_name,
			recipient_phone: recipientPhone,
			recipient_label: recipientLabel,
			vars: {
				project_id: e.project_id,
				client_name: e.client_name,
				event_date: formatDateID(e.event_date),
				setup_time: e.setup_time ? e.setup_time.slice(0, 5) : "—",
				start_time: e.start_time ? e.start_time.slice(0, 5) : "—",
				venue_name: e.venue_name,
				due_date: e.due_date ? formatDateID(e.due_date) : "—",
				dp_amount: formatRupiah(e.total_paid ?? 0),
				remaining_balance: formatRupiah(e.remaining_balance ?? 0),
				package_name: e.package?.name ?? "—",
				duration_hours: String(e.package?.duration_hours ?? "—"),
				crew_lead: nameForRole(e, "lead") || "—",
				crew_asisten: nameForRole(e, "asisten") || "—",
				drive_link: "—",
				reminder_count: "1",
			},
		};
	});

	const totalCount =
		counts.h3_pelunasan + counts.h7_dp + counts.h1_konfirmasi + counts.overdue;

	return (
		<Container size="xl" className="space-y-3 md:space-y-3">
			<SectionHeader
				title="Reminders"
				actions={
					<Badge
						variant="outline"
						className="bg-card h-9 gap-1.5 rounded-full px-3.5 text-[13px] font-medium"
					>
						<Inbox className="size-3.5" />
						{totalCount} event butuh reminder
					</Badge>
				}
			/>

			{/* Hero — KPI breakdown per bucket, same shape every page uses. */}
			<KpiRow>
				{BUCKETS.map((b) => (
					<KpiCard
						key={b}
						label={BUCKET_LABELS[b]}
						value={String(counts[b])}
						hint={BUCKET_HINTS[b]}
						icon={BUCKET_ICONS[b]}
						accent={BUCKET_ACCENT[b]}
					/>
				))}
			</KpiRow>

			{/* Bucket selector — one horizontal-scroll row (no wrapping), ink-on
			    active pill family. The hero above carries the counts. */}
			<div className="border-border-subtle bg-card overflow-hidden rounded-2xl border shadow-[var(--shadow-level-2)]">
				<div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
					<span className="text-muted-foreground shrink-0 text-[11px] font-semibold uppercase tracking-wider sm:w-16">
						Bucket
					</span>
					<div className="hide-scrollbar -mx-3 flex min-w-0 items-center gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-1 sm:px-0 [&>*]:shrink-0">
						{BUCKETS.map((b) => {
							const Icon = BUCKET_ICONS[b];
							const isActive = activeBucket === b;
							return (
								<Link
									key={b}
									href={`/reminders?bucket=${b}`}
									aria-current={isActive ? "true" : undefined}
									className={cn(
										"inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
										isActive
											? "border-[#059669] bg-[#059669] text-white shadow-[var(--shadow-level-1)]"
											: "border-border-default bg-card text-foreground/70 hover:bg-secondary hover:text-foreground",
									)}
								>
									<Icon className="size-4 shrink-0" />
									<span>{BUCKET_LABELS[b]}</span>
								</Link>
							);
						})}
					</div>
				</div>
			</div>
			<p className="type-caption text-muted-foreground -mt-2 px-1">
				{BUCKET_DESCRIPTIONS[activeBucket]}
			</p>

			{/* Suggested template — floating card */}
			<div className="border-border-subtle bg-card rounded-2xl border p-4 shadow-[var(--shadow-level-2)] sm:p-5">
				<div className="flex items-center gap-2">
					<MessageCircle className="text-muted-foreground size-4 shrink-0" />
					<span className="text-foreground text-sm font-medium">
						Template default untuk bucket ini
					</span>
				</div>
				{suggestedTemplate ? (
					<div className="mt-3 space-y-2.5">
						<div className="flex flex-wrap items-center gap-2">
							<Badge>{suggestedTemplate.name}</Badge>
							<code className="text-muted-foreground bg-secondary rounded-md px-1.5 py-0.5 text-xs">
								{suggestedTemplate.code}
							</code>
						</div>
						<pre className="text-muted-foreground bg-secondary max-h-44 overflow-auto rounded-xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap">
							{suggestedTemplate.template_body}
						</pre>
					</div>
				) : (
					<div className="text-muted-foreground mt-3 text-sm">
						Template <code>{suggestedTemplateCode}</code> tidak ditemukan. Cek{" "}
						<Link
							href="/settings/whatsapp-templates"
							className="text-primary underline-offset-2 hover:underline"
						>
							/settings/whatsapp-templates
						</Link>
						.
					</div>
				)}
			</div>

			{/* Events list + batch send */}
			{eventsInBucket.length === 0 ? (
				<EmptyState
					icon={CheckCircle2}
					title="Tidak ada event di bucket ini"
					description={`Bucket di-evaluasi berdasarkan tanggal hari ini (${formatDateID(today)}).`}
				/>
			) : (
				<ReminderBatchClient
					bucket={activeBucket}
					suggestedTemplate={
						suggestedTemplate
							? {
									code: suggestedTemplate.code,
									name: suggestedTemplate.name,
									template_body: suggestedTemplate.template_body,
								}
							: null
					}
					allTemplates={templates.map((t) => ({
						code: t.code,
						name: t.name,
						template_body: t.template_body,
					}))}
					events={clientPayload}
					lastReminderByEvent={Object.fromEntries(
						eventsInBucket
							.map((e) => [e.id, lastByEvent.get(e.id)])
							.filter(([, v]) => v != null) as Array<[string, LastReminder]>,
					)}
					eventsMeta={eventsInBucket.map((e) => ({
						id: e.id,
						project_id: e.project_id,
						client_name: e.client_name,
						event_date: e.event_date,
						event_date_label: formatDateID(e.event_date),
						venue_name: e.venue_name,
						payment_status: e.payment_status,
						remaining_balance: e.remaining_balance,
						remaining_balance_label: formatRupiah(e.remaining_balance),
					}))}
				/>
			)}
		</Container>
	);
}
