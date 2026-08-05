import {
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
	Navigation,
	Package,
	Sparkles,
	Star,
	User,
	Users,
	Video,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge } from "@/components/badges/status-badge";
import { TbcNudgePanel } from "@/components/crew/tbc-nudge-panel";
import { WhatsAppIcon } from "@/components/icons/whatsapp";
import { AppHeader, AppScreen, CrewAvatar } from "@/components/ui/mobile";
import { getCurrentUser } from "@/lib/auth/get-user";
import { listMissingFields } from "@/lib/events/tbc";
import { FRAME_SIZE_LABELS, venueLabel } from "@/lib/format";
import {
	formatScheduleInline,
	hasBreak,
	parseSegments,
} from "@/lib/schedule/segments";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

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
			pic_name, pic_wa, include_flashdisk_pouch,
			frame_size, event_date, event_date_is_estimate,
			setup_time, start_time, end_time, session_segments, backdrop_id,
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
			// inventory_items_safe: proyeksi tanpa kolom biaya. Tabel dasarnya
			// owner-only sejak 20260721g, dan halaman crew memang tidak butuh biaya.
			.from("inventory_items_safe")
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
		avatar_url: string | null;
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
						avatar_url: null as string | null,
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

	// Daftar TBC dihitung dari sumber yang sama dengan reminder H-7/H-3 owner,
	// supaya crew tidak pernah melihat "kosong" untuk sesuatu yang menurut
	// sistem sudah lengkap (atau sebaliknya).
	const tbcMissing = listMissingFields({
		event_date_is_estimate: event.event_date_is_estimate as boolean | null,
		venue_name: event.venue_name as string | null,
		start_time: event.start_time as string | null,
		frame_size: event.frame_size as string | null,
		backdrop_id: event.backdrop_id as string | null,
		pic_name: picName,
		pic_wa: picPhone,
	});

	// Multi-sesi (acara dengan jeda): booth buka → tutup → buka lagi. Crew HARUS
	// tahu boothnya berhenti di tengah, jadi tampilkan rincian sesi + jeda.
	const segments = parseSegments(event.session_segments);
	const scheduleHasBreak = hasBreak(segments);

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

	// Hero context — full date, a friendly countdown, my tier, includes flag.
	const fullDate = new Intl.DateTimeFormat("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(new Date(`${event.event_date}T00:00:00`));
	const t0 = new Date();
	t0.setHours(0, 0, 0, 0);
	const evDay = new Date(`${event.event_date}T00:00:00`);
	const daysUntil = Math.round((evDay.getTime() - t0.getTime()) / 86_400_000);
	const countdownLabel =
		daysUntil === 0
			? "Hari ini"
			: daysUntil === 1
				? "Besok"
				: daysUntil > 1
					? `${daysUntil} hari lagi`
					: daysUntil === -1
						? "Kemarin"
						: `${Math.abs(daysUntil)} hari lalu`;
	const countdownSoon = daysUntil >= 0 && daysUntil <= 2;
	const myTier = roster.find((m) => m.user_id === me.profile.id)?.tier ?? null;
	const includeFlashdiskPouch =
		(event.include_flashdisk_pouch as boolean | null) ?? null;
	const ownerWaHref = "https://wa.me/6281288150041";

	return (
		<AppScreen>
			<AppHeader
				title={event.client_name}
				backHref="/crew/jadwal"
				largeTitle={false}
			/>

			<div className="mt-3 space-y-4">
				{/* ── Hero — the at-a-glance event card (Lokasi merged in) ── */}
				<section className="overflow-hidden rounded-[16px] border border-border-default bg-card shadow-[var(--shadow-level-3)]">
					<div className="p-5">
						<div className="flex items-center justify-between gap-2">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold",
									countdownSoon
										? "bg-[#059669] text-white"
										: "bg-surface-3 text-muted-foreground",
								)}
							>
								<Clock className="size-3.5" />
								{countdownLabel}
							</span>
							<EventStatusBadge status={event.status} />
						</div>

						<h1 className="type-display mt-3 text-balance">
							{event.client_name}
						</h1>

						<div className="mt-3 flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 text-[0.8125rem]">
								<Star className="size-3.5 text-primary" />
								<span className="text-muted-foreground">Peran kamu</span>
								<span className="font-semibold text-foreground">
									{ROLE_LABELS[myAssignment.role_in_event] ??
										myAssignment.role_in_event}
									{myTier ? ` · ${TIER_LABELS[myTier] ?? myTier}` : ""}
								</span>
							</span>
							{eventType && (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 text-[0.8125rem] font-medium text-foreground">
									<Sparkles className="size-3.5 text-muted-foreground" />
									{eventType.label}
								</span>
							)}
							{pkg?.name && (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 text-[0.8125rem] font-medium text-foreground">
									<Package className="size-3.5 text-muted-foreground" />
									{pkg.name}
								</span>
							)}
						</div>
					</div>

					{/* Time strip — start time is the hero */}
					<div className="border-t border-dashed border-border-default bg-surface-3/40 p-4">
						<p className="type-label mb-2.5 text-foreground">
							{fullDate}
							{event.event_date_is_estimate ? (
								<span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
									TBC
								</span>
							) : null}
						</p>
						<div className="grid grid-cols-3 gap-2">
							<TimeCell label="Setup" time={ID_TIME(event.setup_time)} />
							<TimeCell label="Mulai" time={ID_TIME(event.start_time)} hero />
							<TimeCell label="Selesai" time={ID_TIME(event.end_time)} />
						</div>
						{scheduleHasBreak && (
							<div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/70 p-2.5 dark:border-amber-900/70 dark:bg-amber-950/20">
								<Clock className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
								<div className="min-w-0">
									<p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
										Acara dengan jeda — booth berhenti di tengah
									</p>
									<p className="type-num mt-0.5 text-[0.9375rem] text-foreground">
										{formatScheduleInline(
											event.start_time,
											event.end_time,
											segments,
										)}
									</p>
								</div>
							</div>
						)}
					</div>

					{/* Lokasi — merged into the hero */}
					<div className="border-t border-border-default p-4">
						<span className="eyebrow">Lokasi</span>
						<div className="mt-2 flex items-start gap-3">
							<span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-primary">
								<MapPin className="size-[1.15rem]" />
							</span>
							<div className="min-w-0 flex-1">
								<p className="type-body-strong">
									{venueLabel(event.venue_name)}
								</p>
								{venueAddress && (
									<p className="type-secondary mt-0.5">{venueAddress}</p>
								)}
								{venueRegion && (
									<p className="type-secondary mt-0.5">{venueRegion}</p>
								)}
							</div>
						</div>
						{event.google_maps_url && (
							<a
								href={event.google_maps_url}
								target="_blank"
								rel="noopener noreferrer"
								className="press tap mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-2 text-foreground transition-colors active:bg-surface-3"
							>
								<Navigation className="size-4 text-primary" />
								<span className="type-body-strong">Buka di Maps</span>
							</a>
						)}
					</div>
				</section>

				{/* ── Tim crew (avatars) — right after the hero ── */}
				{roster.length > 1 && (
					<section className="rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]">
						<span className="eyebrow flex items-center gap-1.5">
							<Users className="size-3.5" />
							Tim crew
						</span>
						<ul className="mt-3 space-y-3">
							{roster.map((m, i) => {
								const isMe = m.user_id === me.profile.id;
								const tierLabel = m.tier
									? (TIER_LABELS[m.tier] ?? m.tier)
									: null;
								return (
									<li
										key={m.user_id || `${m.role_in_event}-${i}`}
										className="flex items-center gap-3"
									>
										<CrewAvatar name={m.full_name ?? "?"} src={m.avatar_url} />
										<div className="flex min-w-0 flex-1 items-center gap-2">
											<span className="type-body-strong truncate">
												{m.full_name ?? "—"}
											</span>
											{isMe && (
												<span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide">
													Kamu
												</span>
											)}
										</div>
										<span className="shrink-0 text-right text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
											{ROLE_LABELS[m.role_in_event] ?? m.role_in_event}
											{tierLabel ? ` · ${tierLabel}` : ""}
										</span>
									</li>
								);
							})}
						</ul>
					</section>
				)}

				{/* ── Detail paket — after Tim crew ── */}
				<section className="rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]">
					<span className="eyebrow">Detail paket</span>
					<dl className="mt-1 divide-y divide-border-subtle">
						<DetailRow label="Paket">
							{pkg?.name ?? (
								<span className="text-muted-foreground">Custom</span>
							)}
						</DetailRow>
						<DetailRow label="Frame">
							{FRAME_SIZE_LABELS[event.frame_size] ?? event.frame_size}
						</DetailRow>
						{pkg?.duration_hours ? (
							<DetailRow label="Durasi">{pkg.duration_hours} jam</DetailRow>
						) : null}
						<DetailRow label="Flashdisk & Pouch">
							{includeFlashdiskPouch === null ? (
								<span className="text-muted-foreground">—</span>
							) : includeFlashdiskPouch ? (
								<span className="font-semibold text-emerald-600 dark:text-emerald-400">
									Termasuk
								</span>
							) : (
								<span className="text-muted-foreground">Tidak termasuk</span>
							)}
						</DetailRow>
						<DetailRow label="Backdrop">
							{backdrop?.name ?? (
								<span className="text-muted-foreground">—</span>
							)}
						</DetailRow>
					</dl>
				</section>

				{/* Apa yang masih TBC + jalan buat crew mengingatkan owner. Sengaja
				    DI ATAS blok kontak: kalau lokasi/jam belum pasti, itu yang perlu
				    crew lihat duluan, bukan nomor telepon. */}
				<TbcNudgePanel projectId={event.project_id} missing={tbcMissing} />

				{/* ── Kontak hari-H — contact rows ── */}
				{(picName || bookerContact) && (
					<section className="rounded-[16px] border border-amber-300/60 bg-amber-50/60 p-4 shadow-[var(--shadow-level-2)] dark:border-amber-900/70 dark:bg-amber-950/20">
						<span className="eyebrow text-amber-700 dark:text-amber-400">
							Kontak hari-H
						</span>
						<div className="mt-3 space-y-2">
							{picName ? (
								<ContactRow role="PIC Event" name={picName} phone={picPhone} />
							) : (
								// Jangan diam-diam menghilangkan barisnya: crew perlu tahu
								// bedanya "PIC belum ditentukan" dan "lupa ditampilkan".
								<p className="text-[12.5px] text-amber-900/70 dark:text-amber-200/70">
									PIC Event · <span className="font-medium">menyusul</span>
								</p>
							)}
							{bookerContact && (
								<ContactRow
									role="Booker"
									name={bookerContact.name}
									phone={bookerContact.phone}
								/>
							)}
						</div>
					</section>
				)}

				{/* Equipment card */}
				<section className="space-y-2 rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]">
					<h2 className="eyebrow flex items-center justify-between">
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
						<p className="type-secondary italic">
							Belum ada alat disiapin buat event ini.
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
					<section className="space-y-2 rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]">
						<h2 className="eyebrow flex items-center gap-1.5">
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
					<section className="space-y-2 rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]">
						<h2 className="eyebrow flex items-center gap-1.5">
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
					<section className="space-y-2 rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]">
						<h2 className="eyebrow flex items-center gap-1.5">
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
							className="bg-[#059669] dark:bg-[#0b9e6a] text-white inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium hover:bg-[#047857] dark:hover:bg-[#059669]"
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

				{/* Butuh bantuan — chat owner (Acuy) via WhatsApp */}
				<a
					href={ownerWaHref}
					target="_blank"
					rel="noopener noreferrer"
					className="press tap flex items-center gap-3 rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)] transition-colors active:bg-surface-3"
				>
					<span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#25D366]/15 text-[#25D366]">
						<WhatsAppIcon className="size-5" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="type-body-strong">Butuh bantuan?</p>
						<p className="type-secondary mt-0.5">
							Ada yang bingung atau mau ditanyain? Chat Acuy (owner).
						</p>
					</div>
					<ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/50" />
				</a>
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
		<div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-1 last:pb-1">
			<dt className="type-secondary shrink-0">{label}</dt>
			<dd className="type-body-strong min-w-0 text-right">{children}</dd>
		</div>
	);
}

/** One slot in the event time strip — "Mulai" is the emphasized hero. */
function TimeCell({
	label,
	time,
	hero,
}: {
	label: string;
	time: string;
	hero?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2.5",
				hero
					? "bg-[#059669] text-white"
					: "bg-card text-foreground ring-1 ring-border-subtle",
			)}
		>
			<span
				className={cn(
					"text-[0.625rem] font-semibold uppercase tracking-wide",
					hero ? "text-primary-foreground/80" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"type-num leading-none",
					hero ? "text-[1.5rem]" : "text-[1.1rem]",
				)}
			>
				{time}
			</span>
		</div>
	);
}

/** WhatsApp contact button — clear green WA glyph + tappable number. */
/**
 * Display an Indonesian number with a leading 0 and dashed groups of 4
 * (0821-3320-0110) for readability. DB stays raw; this is display-only.
 */
function formatPhoneId(raw: string | null | undefined): string {
	if (!raw) return "";
	let d = raw.replace(/\D/g, "");
	if (d.startsWith("62")) d = `0${d.slice(2)}`;
	else if (d.startsWith("8")) d = `0${d}`;
	else if (!d.startsWith("0")) d = `0${d}`;
	return d.replace(/(\d{4})(?=\d)/g, "$1-");
}

/** A hari-H contact row — name + role left, formatted WA number right. */
function ContactRow({
	role,
	name,
	phone,
}: {
	role: string;
	name: string;
	phone: string | null | undefined;
}) {
	const href = whatsAppLink(phone);
	const inner = (
		<>
			<span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#25D366]/15 text-[#128C4B] dark:text-[#3ddc84]">
				{phone ? (
					<WhatsAppIcon className="size-[1.1rem]" />
				) : (
					<User className="size-[1.1rem]" />
				)}
			</span>
			<div className="min-w-0 flex-1">
				<p className="type-body-strong truncate">{name}</p>
				<p className="type-caption">{role}</p>
			</div>
			{phone ? (
				<span className="type-num shrink-0 text-[0.9375rem] font-semibold text-[#128C4B] dark:text-[#3ddc84]">
					{formatPhoneId(phone)}
				</span>
			) : null}
		</>
	);
	if (phone && href) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="press tap flex items-center gap-3 rounded-2xl bg-card/60 p-2.5 transition-colors active:bg-amber-100/60 dark:bg-amber-950/30 dark:active:bg-amber-900/30"
			>
				{inner}
			</a>
		);
	}
	return (
		<div className="flex items-center gap-3 rounded-2xl bg-card/60 p-2.5 dark:bg-amber-950/30">
			{inner}
		</div>
	);
}
