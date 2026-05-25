import {
	Calendar,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	ClipboardList,
	Clock,
	ExternalLink,
	FileText,
	Gift,
	MapPin,
	Package,
	Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID, FRAME_SIZE_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const ID_TIME = (t: string | null) => (t ? t.slice(0, 5) : "—");

function whatsAppLink(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const cleaned = raw.replace(/[^\d+]/g, "");
	if (!cleaned) return null;
	return `https://wa.me/${cleaned.replace(/^\+|^0/, "62")}`;
}

export default async function CrewEventDetailPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const me = await getCurrentUser();
	if (!me) return null;

	const supabase = await createClient();

	const [{ data: event, error }, { data: eventTypesData }] = await Promise.all([
		supabase
			.from("events")
			.select(
				`
			id, project_id, status, client_name, event_category,
			pic_name, pic_wa,
			frame_size, event_date, setup_time, start_time, end_time,
			venue_name, venue_address, venue_city, venue_province, google_maps_url,
			crew_notes, is_migrated_legacy,
			pic_contact:contacts!events_pic_contact_id_fkey(name, phone),
			booker_contact:contacts!events_booker_contact_id_fkey(name, phone),
			package:packages(name, duration_hours),
			backdrop:backdrops(name, type),
			event_bonuses:event_bonuses(quantity, notes, addon:addons(name, unit, category)),
			crew_assignments:crew_assignments!inner(
				role_in_event, fee_amount, bonus_amount, is_paid,
				user:users!crew_assignments_user_id_fkey(id, full_name, tier)
			),
			design_brief_at, design_approved_at, design_drive_folder_url
		`,
			)
			.eq("project_id", projectId)
			.maybeSingle(),
		supabase
			.from("event_types")
			.select("code, label")
			.eq("is_active", true),
	]);

	if (error) {
		return (
			<div className="mx-auto w-full max-w-md px-4 py-6">
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm">{error.message}</p>
				</div>
			</div>
		);
	}
	if (!event) notFound();

	const crewAssignments = (event.crew_assignments ?? []) as Array<{
		role_in_event: string;
		fee_amount: number;
		bonus_amount: number;
		is_paid: boolean;
		user:
			| { id: string; full_name: string; tier: string | null }
			| Array<{ id: string; full_name: string; tier: string | null }>
			| null;
	}>;

	const eventBonuses = (event.event_bonuses ?? []) as Array<{
		quantity: number;
		notes: string | null;
		addon:
			| { name: string; unit: string; category: string }
			| Array<{ name: string; unit: string; category: string }>
			| null;
	}>;

	// Confirm crew is assigned to this event (security check)
	const myAssignment = crewAssignments.find((a) => {
		const u = Array.isArray(a.user) ? a.user[0] : a.user;
		return u?.id === me.profile.id;
	});
	if (!myAssignment) notFound();

	const partnerAssignments = crewAssignments.filter((a) => {
		const u = Array.isArray(a.user) ? a.user[0] : a.user;
		return u?.id !== me.profile.id;
	});

	// Equipment for this event
	const { data: equipmentRows } = await supabase
		.from("inventory_items")
		.select("id, sku, name, category, condition")
		.eq("category", "fixed_asset")
		.eq("current_event_id", event.id);

	const equipment = (equipmentRows ?? []) as Array<{
		id: string;
		sku: string;
		name: string;
		category: string;
		condition: string | null;
	}>;

	// Rekap status for this event
	const { data: rekapData } = await supabase
		.from("crew_rekap")
		.select("id, is_approved")
		.eq("event_id", event.id)
		.maybeSingle();
	const rekap = rekapData as { id: string; is_approved: boolean | null } | null;
	const todayISO = new Date().toISOString().slice(0, 10);
	const isPastOrToday = event.event_date <= todayISO;

	const pkg = Array.isArray(event.package) ? event.package[0] : event.package;
	const backdrop = Array.isArray(event.backdrop)
		? event.backdrop[0]
		: event.backdrop;
	const eventTypeLabelByCode = new Map(
		((eventTypesData ?? []) as Array<{ code: string; label: string }>).map(
			(t) => [t.code, t.label],
		),
	);
	const eventType = event.event_category
		? { label: eventTypeLabelByCode.get(event.event_category) ?? event.event_category }
		: null;
	const picContact = Array.isArray(event.pic_contact)
		? event.pic_contact[0]
		: event.pic_contact;
	const bookerContact = Array.isArray(event.booker_contact)
		? event.booker_contact[0]
		: event.booker_contact;

	const picName = picContact?.name ?? event.pic_name ?? null;
	const picPhone = picContact?.phone ?? event.pic_wa ?? null;

	return (
		<div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
			<Link
				href="/crew/jadwal"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Jadwal
			</Link>

			<header
				className="space-y-2"
				style={{ viewTransitionName: `crew-event-${event.project_id}` }}
			>
				<div className="flex flex-wrap items-start justify-between gap-2">
					<h1 className="text-fluid-h1 font-semibold leading-tight tracking-tight">
						{event.client_name}
					</h1>
					<EventStatusBadge status={event.status} />
				</div>
				<p className="tabular text-fluid-caption text-muted-foreground">
					{event.project_id}
				</p>
				<div className="flex flex-wrap gap-1.5">
					<Badge variant="outline" className="text-[11px]">
						{ROLE_LABELS[myAssignment.role_in_event] ??
							myAssignment.role_in_event}
					</Badge>
					{eventType && (
						<Badge variant="outline" className="text-[11px]">
							{eventType.label}
						</Badge>
					)}
					{event.is_migrated_legacy && (
						<Badge
							variant="secondary"
							className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-[11px]"
						>
							📦 Migrated
						</Badge>
					)}
				</div>
			</header>

			{/* Time & venue card */}
			<section className="border-border-default bg-surface-2 space-y-3 rounded-lg border p-4">
				<div className="flex items-start gap-3">
					<Calendar className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
					<div className="flex-1 space-y-0.5">
						<p className="text-foreground text-sm font-medium">
							{formatDateID(event.event_date)}
						</p>
						<p className="text-muted-foreground tabular text-xs">
							Setup {ID_TIME(event.setup_time)} · Mulai{" "}
							{ID_TIME(event.start_time)} · Selesai {ID_TIME(event.end_time)}
						</p>
					</div>
				</div>
				<div className="flex items-start gap-3">
					<MapPin className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
					<div className="flex-1 space-y-0.5">
						<p className="text-foreground text-sm font-medium">
							{event.venue_name}
						</p>
						{event.venue_address && (
							<p className="text-muted-foreground text-xs">
								{event.venue_address}
							</p>
						)}
						{(event.venue_city || event.venue_province) && (
							<p className="text-muted-foreground text-xs">
								{[event.venue_city, event.venue_province]
									.filter(Boolean)
									.join(", ")}
							</p>
						)}
						{event.google_maps_url && (
							<a
								href={event.google_maps_url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
							>
								Buka Google Maps
								<ExternalLink className="h-3 w-3" />
							</a>
						)}
					</div>
				</div>
			</section>

			{/* PIC card */}
			{(picName || picPhone || bookerContact) && (
				<section className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 space-y-2 rounded-lg border p-4">
					<h2 className="text-amber-900 dark:text-amber-200 text-xs font-semibold uppercase tracking-wider">
						Kontak di hari H
					</h2>
					{picName && (
						<div className="space-y-0.5">
							<p className="text-muted-foreground text-[11px]">PIC Event</p>
							<p className="text-foreground text-sm font-medium">{picName}</p>
							{picPhone && (
								<a
									href={whatsAppLink(picPhone) ?? "#"}
									target="_blank"
									rel="noopener noreferrer"
									className="text-primary tabular inline-flex items-center gap-1 text-sm hover:underline"
								>
									{picPhone}
									<ExternalLink className="h-3 w-3" />
								</a>
							)}
						</div>
					)}
					{bookerContact && (
						<div className="space-y-0.5 border-t border-amber-200 pt-2 dark:border-amber-900">
							<p className="text-muted-foreground text-[11px]">Booker</p>
							<p className="text-foreground text-sm">{bookerContact.name}</p>
							{bookerContact.phone && (
								<a
									href={whatsAppLink(bookerContact.phone) ?? "#"}
									target="_blank"
									rel="noopener noreferrer"
									className="text-primary tabular inline-flex items-center gap-1 text-xs hover:underline"
								>
									{bookerContact.phone}
									<ExternalLink className="h-3 w-3" />
								</a>
							)}
						</div>
					)}
				</section>
			)}

			{/* Service spec card */}
			<section className="border-border-default bg-surface-2 space-y-2 rounded-lg border p-4">
				<h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
					Spec
				</h2>
				<dl className="space-y-1.5 text-sm">
					<DetailRow label="Frame">
						{FRAME_SIZE_LABELS[event.frame_size] ?? event.frame_size}
					</DetailRow>
					<DetailRow label="Package">
						{pkg ? (
							<span>
								{pkg.name}
								{pkg.duration_hours && (
									<span className="text-muted-foreground">
										{" · "}
										{pkg.duration_hours}j
									</span>
								)}
							</span>
						) : (
							<span className="text-muted-foreground">Custom</span>
						)}
					</DetailRow>
					<DetailRow label="Backdrop">
						{backdrop?.name ?? (
							<span className="text-muted-foreground">—</span>
						)}
					</DetailRow>
				</dl>
			</section>

			{/* Crew partner card */}
			{partnerAssignments.length > 0 && (
				<section className="border-border-default bg-surface-2 space-y-2 rounded-lg border p-4">
					<h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
						<Users className="h-3.5 w-3.5" />
						Crew partner
					</h2>
					<div className="space-y-1.5">
						{partnerAssignments.map((a, i) => {
							const u = Array.isArray(a.user) ? a.user[0] : a.user;
							return (
								<div
									key={`${u?.id}-${i}`}
									className="flex items-center justify-between text-sm"
								>
									<span className="text-foreground font-medium">
										{u?.full_name ?? "—"}
									</span>
									<span className="text-muted-foreground text-[11px] uppercase tracking-wider">
										{ROLE_LABELS[a.role_in_event] ?? a.role_in_event}
									</span>
								</div>
							);
						})}
					</div>
				</section>
			)}

			{/* Equipment card */}
			<section className="border-border-default bg-surface-2 space-y-2 rounded-lg border p-4">
				<h2 className="text-muted-foreground flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
					<span className="flex items-center gap-1.5">
						<Package className="h-3.5 w-3.5" />
						Alat di lokasi
					</span>
					{equipment.length > 0 && (
						<span className="text-foreground tabular">
							{equipment.length}
						</span>
					)}
				</h2>
				{equipment.length === 0 ? (
					<p className="text-muted-foreground text-xs italic">
						Belum ada alat di-checkout buat event ini.
					</p>
				) : (
					<div className="space-y-1">
						{equipment.map((eq) => (
							<div
								key={eq.id}
								className="flex items-center justify-between text-sm"
							>
								<span className="text-foreground">{eq.name}</span>
								<span className="text-muted-foreground tabular text-[11px]">
									{eq.sku}
								</span>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Design link */}
			{event.design_drive_folder_url && (
				<section className="border-border-default bg-surface-2 space-y-2 rounded-lg border p-4">
					<h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
						<FileText className="h-3.5 w-3.5" />
						Desain
					</h2>
					<a
						href={event.design_drive_folder_url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
					>
						Buka Google Drive
						<ExternalLink className="h-3.5 w-3.5" />
					</a>
					{event.design_approved_at && (
						<p className="text-emerald-600 dark:text-emerald-400 text-[11px]">
							✓ ACC by owner
						</p>
					)}
				</section>
			)}

			{/* Bonus untuk klien — crew harus tahu biar bisa kasih hari-H */}
			{eventBonuses.length > 0 && (
				<section className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 space-y-2 rounded-lg border p-4">
					<h2 className="text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
						<Gift className="h-3.5 w-3.5" />
						Bonus untuk klien
					</h2>
					<p className="text-emerald-900/80 dark:text-emerald-200/80 text-xs">
						Item gratis yang kita kasih ke klien. Pastikan disiapkan +
						diserahkan hari-H.
					</p>
					<ul className="space-y-1.5">
						{eventBonuses.map((b, idx) => {
							const addon = Array.isArray(b.addon) ? b.addon[0] : b.addon;
							return (
								<li
									key={`${addon?.name ?? "bonus"}-${idx}`}
									className="text-foreground text-sm"
								>
									<span className="font-medium">
										{b.quantity}× {addon?.name ?? "—"}
									</span>
									{addon?.unit && (
										<span className="text-muted-foreground">
											{" "}
											({addon.unit})
										</span>
									)}
									{b.notes && (
										<p className="text-muted-foreground mt-0.5 text-xs italic">
											{b.notes}
										</p>
									)}
								</li>
							);
						})}
					</ul>
				</section>
			)}

			{/* Crew notes */}
			{event.crew_notes && (
				<section className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 space-y-2 rounded-lg border p-4">
					<h2 className="text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
						<Clock className="h-3.5 w-3.5" />
						Catatan untuk crew
					</h2>
					<p className="text-foreground whitespace-pre-line text-sm">
						{event.crew_notes}
					</p>
				</section>
			)}

			{/* Rekap CTA / status */}
			{!event.is_migrated_legacy && (
				<Link
					href={`/crew/jadwal/${event.project_id}/rekap`}
					className={`group flex items-center gap-3 rounded-lg border p-4 transition-colors active:scale-[0.99] ${
						rekap?.is_approved === true
							? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
							: rekap
								? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
								: isPastOrToday
									? "border-primary/30 bg-primary/5 hover:bg-primary/10"
									: "border-border-default bg-surface-2 hover:bg-muted/40"
					}`}
				>
					<div
						className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
							rekap?.is_approved === true
								? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
								: rekap
									? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
									: isPastOrToday
										? "bg-primary/15 text-primary"
										: "bg-muted text-muted-foreground"
						}`}
					>
						{rekap?.is_approved === true ? (
							<CheckCircle2 className="h-5 w-5" />
						) : (
							<ClipboardList className="h-5 w-5" />
						)}
					</div>
					<div className="min-w-0 flex-1 space-y-0.5">
						<p className="text-foreground text-sm font-semibold leading-tight">
							{rekap?.is_approved === true
								? "Rekap sudah approved"
								: rekap?.is_approved === false
									? "Rekap perlu revisi"
									: rekap
										? "Rekap menunggu review owner"
										: isPastOrToday
											? "Submit rekap event"
											: "Rekap (submit setelah event selesai)"}
						</p>
						<p className="text-muted-foreground text-xs leading-snug">
							{rekap?.is_approved === true
								? "Owner sudah approve. Lihat detail."
								: rekap?.is_approved === false
									? "Owner minta revisi — buka untuk update."
									: rekap
										? "Sedang di-review owner. Lihat data submit."
										: isPastOrToday
											? "Tap untuk isi cetak, alat terpakai, foto bukti."
											: "Buka form sekarang, submit nanti pas event beres."}
						</p>
					</div>
					<ChevronRight className="text-muted-foreground/60 h-4 w-4 self-center" />
				</Link>
			)}

			{/* Fee for me */}
			<section className="border-border-default bg-surface-2 space-y-2 rounded-lg border p-4">
				<h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
					Fee gw
				</h2>
				<div className="flex items-baseline justify-between">
					<span className="text-foreground tabular text-lg font-semibold">
						{formatRupiahShort(
							myAssignment.fee_amount + myAssignment.bonus_amount,
						)}
					</span>
					{myAssignment.is_paid ? (
						<span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
							✓ paid
						</span>
					) : (
						<span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
							• unpaid
						</span>
					)}
				</div>
				{myAssignment.bonus_amount > 0 && (
					<p className="text-muted-foreground tabular text-[11px]">
						base {formatRupiahShort(myAssignment.fee_amount)} + bonus{" "}
						{formatRupiahShort(myAssignment.bonus_amount)}
					</p>
				)}
			</section>
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
		<div className="flex items-baseline justify-between gap-3">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="text-foreground text-right text-sm">{children}</dd>
		</div>
	);
}

function formatRupiahShort(amount: number): string {
	if (amount === 0) return "Rp 0";
	return `Rp ${amount.toLocaleString("id-ID")}`;
}
