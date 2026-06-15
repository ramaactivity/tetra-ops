import {
	Calendar,
	CheckCircle2,
	ChevronRight,
	ClipboardList,
	Clock,
	Download,
	ExternalLink,
	FileText,
	FolderOpen,
	Gift,
	MapPin,
	Package,
	Users,
	Video,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { Badge } from "@/components/ui/badge";
import { AppHeader, AppScreen } from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { FRAME_SIZE_LABELS, formatDateID } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

const TIER_LABELS: Record<string, string> = {
	senior: "Senior",
	junior: "Junior",
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
				role_in_event,
				user:users!crew_assignments_user_id_fkey(id, full_name, tier)
			),
			design_brief_at, design_approved_at, design_drive_folder_url,
			design_status, drive_folders, drive_folder_url
		`,
			)
			.eq("project_id", projectId)
			.maybeSingle(),
		supabase.from("event_types").select("code, label").eq("is_active", true),
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

	// Equipment, design frames, and rekap status — all keyed by event.id and
	// independent of each other, so fetch in parallel (one DB round-trip
	// instead of three sequential ones).
	const [
		{ data: equipmentRows },
		{ data: designAssets },
		{ data: rekapData },
		{ data: crewRosterRaw },
	] = await Promise.all([
		supabase
			.from("inventory_items")
			.select("id, sku, name, category, condition")
			.eq("category", "fixed_asset")
			.eq("current_event_id", event.id),
		supabase
			.from("event_assets")
			.select("id, label, url, drive_file_id")
			.eq("event_id", event.id)
			.eq("asset_type", "design_frame")
			.order("created_at", { ascending: false }),
		supabase
			.from("crew_rekap")
			.select("id, is_approved")
			.eq("event_id", event.id)
			.maybeSingle(),
		// Partner names: crew can't read peers' `users` rows under RLS, so the
		// crew_assignments embed returns null names. This SECURITY DEFINER RPC
		// returns only safe columns (name, tier, role) for assigned crew.
		supabase.rpc("get_event_crew", { p_event_id: event.id }),
	]);

	const equipment = (equipmentRows ?? []) as Array<{
		id: string;
		sku: string;
		name: string;
		category: string;
		condition: string | null;
	}>;

	// Design frames crew can download (load into dslrbooth) + footage folder.
	const designFrames = (designAssets ?? []) as Array<{
		id: string;
		label: string;
		url: string;
		drive_file_id: string | null;
	}>;
	const driveFolders = (event.drive_folders ?? {}) as Record<
		string,
		{ id?: string; url?: string }
	>;
	const footageFolderUrl =
		driveFolders.Footage?.url ?? event.drive_folder_url ?? null;

	// Crew roster (with real partner names) from the RPC. Falls back to the
	// RLS-limited embed if the RPC isn't available yet — roles still render,
	// peer names degrade to "—".
	const rpcRoster = (crewRosterRaw ?? []) as Array<{
		user_id: string;
		full_name: string;
		tier: string | null;
		role_in_event: string;
	}>;
	const roster =
		rpcRoster.length > 0
			? rpcRoster
			: crewAssignments.map((a) => {
					const u = Array.isArray(a.user) ? a.user[0] : a.user;
					return {
						user_id: u?.id ?? "",
						full_name: u?.full_name ?? "—",
						tier: u?.tier ?? null,
						role_in_event: a.role_in_event,
					};
				});

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
		? {
				label:
					eventTypeLabelByCode.get(event.event_category) ??
					event.event_category,
			}
		: null;
	const picContact = Array.isArray(event.pic_contact)
		? event.pic_contact[0]
		: event.pic_contact;
	const bookerContact = Array.isArray(event.booker_contact)
		? event.booker_contact[0]
		: event.booker_contact;

	const picName = picContact?.name ?? event.pic_name ?? null;
	const picPhone = picContact?.phone ?? event.pic_wa ?? null;

	// Venue often has city == venue_name (e.g. "Braja Mustika") and an address
	// that just repeats the name. Drop anything that duplicates venue_name so the
	// location block doesn't read "Braja Mustika / Braja Mustika".
	const venueRegion = [event.venue_city, event.venue_province]
		.filter((v): v is string => Boolean(v) && v !== event.venue_name)
		.join(", ");
	const venueAddress =
		event.venue_address && event.venue_address !== event.venue_name
			? event.venue_address
			: null;

	return (
		<AppScreen>
			<AppHeader
				title={event.client_name}
				backHref="/crew/jadwal"
				trailing={<EventStatusBadge status={event.status} />}
				subtitle={<span className="eyebrow tabular">{event.project_id}</span>}
			/>

			<div className="mt-3 space-y-4">
				<div className="flex flex-wrap gap-1.5">
					<Badge variant="outline" className="text-[0.6875rem]">
						{ROLE_LABELS[myAssignment.role_in_event] ??
							myAssignment.role_in_event}
					</Badge>
					{eventType && (
						<Badge variant="outline" className="text-[0.6875rem]">
							{eventType.label}
						</Badge>
					)}
					{event.is_migrated_legacy && (
						<Badge
							variant="secondary"
							className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-[0.6875rem]"
						>
							📦 Migrated
						</Badge>
					)}
				</div>

				{/* Time & venue card */}
				<section className="border-border-default bg-surface-2 space-y-3 rounded-2xl border p-4">
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
							{venueAddress && (
								<p className="text-muted-foreground text-xs">{venueAddress}</p>
							)}
							{venueRegion && (
								<p className="text-muted-foreground text-xs">{venueRegion}</p>
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
					<section className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 space-y-2 rounded-2xl border p-4">
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

				{/* Crew partner card — who you're working with on the day */}
				{roster.length > 1 && (
					<section className="border-border-default bg-surface-2 space-y-3 rounded-2xl border p-4">
						<h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
							<Users className="h-3.5 w-3.5" />
							Tim crew
						</h2>
						<ul className="space-y-2.5">
							{roster.map((m, i) => {
								const isMe = m.user_id === me.profile.id;
								const tierLabel = m.tier
									? (TIER_LABELS[m.tier] ?? m.tier)
									: null;
								return (
									<li
										key={m.user_id || `${m.role_in_event}-${i}`}
										className="flex items-center justify-between gap-3 text-sm"
									>
										<span className="flex min-w-0 items-center gap-2">
											<span className="text-foreground truncate font-medium">
												{m.full_name ?? "—"}
											</span>
											{isMe && (
												<span className="bg-primary/10 text-primary shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
													Kamu
												</span>
											)}
										</span>
										<span className="text-muted-foreground shrink-0 text-[11px] uppercase tracking-wider">
											{ROLE_LABELS[m.role_in_event] ?? m.role_in_event}
											{tierLabel ? ` · ${tierLabel}` : ""}
										</span>
									</li>
								);
							})}
						</ul>
					</section>
				)}

				{/* Service spec card */}
				<section className="border-border-default bg-surface-2 space-y-2 rounded-2xl border p-4">
					<h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
						Spec
					</h2>
					<dl className="space-y-1.5 text-sm">
						<DetailRow label="Paket">
							{pkg?.name ?? (
								<span className="text-muted-foreground">Custom</span>
							)}
						</DetailRow>
						<DetailRow label="Frame">
							{FRAME_SIZE_LABELS[event.frame_size] ?? event.frame_size}
						</DetailRow>
						<DetailRow label="Backdrop">
							{backdrop?.name ?? (
								<span className="text-muted-foreground">—</span>
							)}
						</DetailRow>
					</dl>
				</section>

				{/* Equipment card */}
				<section className="border-border-default bg-surface-2 space-y-2 rounded-2xl border p-4">
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
					<section className="border-border-default bg-surface-2 space-y-2 rounded-2xl border p-4">
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

				{/* Design frames — download to load into dslrbooth */}
				{designFrames.length > 0 && (
					<section className="border-border-default bg-surface-2 space-y-2 rounded-2xl border p-4">
						<h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
							<Download className="h-3.5 w-3.5" />
							Design Frame
						</h2>
						<ul className="space-y-1.5">
							{designFrames.map((f) => (
								<li
									key={f.id}
									className="flex items-center justify-between gap-2"
								>
									<span className="truncate text-sm text-foreground">
										{f.label}
									</span>
									<a
										href={
											f.drive_file_id
												? `https://drive.google.com/uc?export=download&id=${f.drive_file_id}`
												: f.url
										}
										className="text-primary inline-flex shrink-0 items-center gap-1 text-xs font-medium hover:underline"
									>
										<Download className="h-3.5 w-3.5" />
										Download
									</a>
								</li>
							))}
						</ul>
					</section>
				)}

				{/* Footage — upload langsung di Google Drive */}
				{footageFolderUrl && (
					<section className="border-border-default bg-surface-2 space-y-2 rounded-2xl border p-4">
						<h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
							<Video className="h-3.5 w-3.5" />
							Footage
						</h2>
						<p className="text-muted-foreground text-[12px]">
							Upload footage yang kamu ambil langsung ke folder Drive ini.
						</p>
						<a
							href={footageFolderUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium hover:bg-primary/90"
						>
							<FolderOpen className="h-4 w-4" />
							Upload footage di Google Drive
							<ExternalLink className="h-3.5 w-3.5" />
						</a>
					</section>
				)}

				{/* Bonus untuk klien — crew harus tahu biar bisa kasih hari-H */}
				{eventBonuses.length > 0 && (
					<section className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 space-y-2 rounded-2xl border p-4">
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
					<section className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 space-y-2 rounded-2xl border p-4">
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
						className={`group flex items-center gap-3 rounded-2xl border p-4 transition-colors active:scale-[0.99] ${
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
							className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
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
			</div>
		</AppScreen>
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
