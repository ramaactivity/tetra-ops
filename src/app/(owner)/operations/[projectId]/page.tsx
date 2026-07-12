import {
	Activity,
	Archive,
	Building2,
	FileText,
	Inbox,
	Mail,
	Pencil,
	Phone,
	Sparkles,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentStatusBadge } from "@/components/badges/status-badge";
import type { AssignmentRow } from "@/components/booking/crew-assignment-list";
import { CrewSlotAssign } from "@/components/booking/crew-slot-assign";
import { DeleteEventButton } from "@/components/booking/delete-event-button";
import {
	SendWhatsAppButton,
	type WhatsAppTemplate,
} from "@/components/booking/send-wa-button";
import { StatusMenu } from "@/components/booking/status-menu";
import { EventDriveCard } from "@/components/drive/event-drive-card";
import { DesignCard } from "@/components/event-design/design-card";
import { Container } from "@/components/layout/container";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { EventActivityFeed } from "@/components/operations/activity-feed";
import {
	ProjectHeroRecap,
	type ProjectHeroRecapCrew,
} from "@/components/operations/project-hero-recap";
import { EventReadinessCard } from "@/components/operations/readiness-card";
import { PdfDownloadMenu } from "@/components/pdf/download-menu";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { getDriveStatus } from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
import { getAssignableCrew } from "@/lib/crew/assignable";
import { applyDateTransitions } from "@/lib/event-status-transition";
import {
	CHANNEL_TYPE_LABELS,
	type DesignStatus,
	EVENT_STATUS_LABELS,
	FRAME_SIZE_LABELS,
	formatDateID,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function EventDetailPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const supabase = await createClient();
	const me = await getCurrentUser();

	// Lazy self-heal date-driven statuses (Hobby = 1 cron/day) so a directly
	// opened, just-passed event reads correctly. Best-effort, never crashes.
	try {
		await applyDateTransitions(createAdminClient());
	} catch {
		// ignore — nightly cron is the backstop
	}
	const canEdit =
		me?.profile.role === "super_admin" || me?.profile.role === "owner";

	const [
		{ data: event, error },
		{ data: templatesData },
		{ data: eventTypesData },
		driveStatus,
	] = await Promise.all([
		supabase
			.from("events")
			.select(
				`
			id, project_id, status, channel, client_name, client_wa, client_email,
			pic_name, pic_wa,
			service_type, frame_size, package_id, event_category, event_date,
			setup_time, start_time, end_time, session_segments, venue_name, venue_address, venue_city, venue_province,
			base_price, addons_total, discount_amount, gross_up_pph_amount,
			grand_total, total_paid, remaining_balance, payment_status,
			vendor_commission_mode, vendor_commission_amount,
			include_flashdisk_pouch,
			crew_notes, created_at, updated_at,
			is_migrated_legacy, legacy_invoice_number,
			booker_contact:contacts!events_booker_contact_id_fkey(id, name, phone, type, legacy_contact_id),
			pic_contact:contacts!events_pic_contact_id_fkey(id, name, phone, type, legacy_contact_id),
			design_brief_at, design_approved_at, design_drive_folder_url, design_status,
			drive_folder_id, drive_folder_url, drive_folder_created_at,
			backdrop_id, vendor_decor_markup,
			backdrop:backdrops(name, type, rental_price),
			package:packages(id, name, base_price, duration_hours),
			event_addons:event_addons(quantity, unit_price, total_price, addon:addons(name, unit, category)),
			event_bonuses:event_bonuses(quantity, notes, addon:addons(name, unit, category)),
			crew_assignments:crew_assignments(id, user_id, role_in_event, fee_amount, bonus_amount, fee_override_reason, user:users!crew_assignments_user_id_fkey(full_name, tier, phone_wa)),
			settlement:event_settlements(
				id, revenue_net, hpp_total, opex_total, total_biaya, net_profit,
				margin_percentage, is_loss, sinking_total, owner_pool_total,
				owner_pool_per_person, operating_cash_kept, closed_at
			)
		`,
			)
			.eq("project_id", projectId)
			.maybeSingle(),
		supabase
			.from("whatsapp_templates")
			.select("code, name, description, template_body")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		supabase.from("event_types").select("code, label").eq("is_active", true),
		getDriveStatus(),
	]);

	if (error) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
					<p className="text-sm font-medium text-destructive">
						Gagal memuat event: {error.message}
					</p>
				</div>
			</Container>
		);
	}

	if (!event) notFound();

	// Design frames — SAME store as the Asset & Design page (event_assets), so
	// the Design card here stays in sync with that page (no separate silo).
	const { data: designFramesRaw } = await supabase
		.from("event_assets")
		.select("id, label, url, drive_file_id")
		.eq("event_id", event.id)
		.eq("asset_type", "design_frame")
		.order("created_at", { ascending: false });
	const designFrames = (designFramesRaw ?? []) as Array<{
		id: string;
		label: string;
		url: string;
		drive_file_id: string | null;
	}>;

	const eventTypeLabelByCode = new Map(
		((eventTypesData ?? []) as Array<{ code: string; label: string }>).map(
			(t) => [t.code, t.label],
		),
	);

	const pkg = Array.isArray(event.package) ? event.package[0] : event.package;
	const eventAddons = (event.event_addons ?? []) as Array<{
		quantity: number;
		unit_price: number;
		total_price: number;
		addon:
			| { name: string; unit: string; category: string }
			| Array<{ name: string; unit: string; category: string }>
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
	const crewAssignments = (event.crew_assignments ?? []) as Array<{
		id: string;
		user_id: string;
		role_in_event: string;
		fee_amount: number;
		bonus_amount: number | null;
		fee_override_reason: string | null;
		user:
			| { full_name: string; tier: string | null; phone_wa: string | null }
			| Array<{
					full_name: string;
					tier: string | null;
					phone_wa: string | null;
			  }>
			| null;
	}>;
	const crewAssignmentRows: AssignmentRow[] = crewAssignments.map((row) => {
		const u = Array.isArray(row.user) ? row.user[0] : row.user;
		return {
			id: row.id,
			user_id: row.user_id,
			role_in_event: row.role_in_event,
			fee_amount: row.fee_amount,
			bonus_amount: row.bonus_amount ?? 0,
			fee_override_reason: row.fee_override_reason,
			user: {
				full_name: u?.full_name ?? "—",
				tier: u?.tier ?? null,
				phone_wa: u?.phone_wa ?? null,
			},
		};
	});
	const templates = (templatesData ?? []) as WhatsAppTemplate[];
	const settlement = Array.isArray(event.settlement)
		? event.settlement[0]
		: event.settlement;
	const isMigratedLegacy = !!event.is_migrated_legacy;
	// Crew can be managed inline on this page, except for read-only legacy archives.
	const canManageCrew = canEdit && !isMigratedLegacy;
	const isImportedLive = !isMigratedLegacy && !!event.legacy_invoice_number;
	const canSettle =
		!isMigratedLegacy &&
		!settlement &&
		(event.status === "in_progress" || event.status === "awaiting_settlement");

	const bookerContact = Array.isArray(event.booker_contact)
		? event.booker_contact[0]
		: event.booker_contact;
	const picContact = Array.isArray(event.pic_contact)
		? event.pic_contact[0]
		: event.pic_contact;
	const picDisplayName = picContact?.name ?? event.pic_name ?? null;
	const picDisplayPhone = picContact?.phone ?? event.pic_wa ?? null;
	const [{ count: equipmentCountRaw }, { data: rekapData }, assignableCrew] =
		await Promise.all([
			supabase
				.from("inventory_items")
				.select("id", { count: "exact", head: true })
				.eq("category", "fixed_asset")
				.eq("current_event_id", event.id),
			supabase
				.from("crew_rekap")
				.select("id, is_approved")
				.eq("event_id", event.id)
				.maybeSingle(),
			canManageCrew
				? getAssignableCrew(supabase, event.id, event.event_date)
				: Promise.resolve([]),
		]);
	const equipmentCount = equipmentCountRaw ?? 0;
	const rekapSubmitted = !!rekapData;

	const backdrop = Array.isArray(event.backdrop)
		? event.backdrop[0]
		: event.backdrop;

	const recapCrew: ProjectHeroRecapCrew[] = crewAssignments.map((row) => {
		const u = Array.isArray(row.user) ? row.user[0] : row.user;
		return {
			name: u?.full_name ?? "—",
			role: row.role_in_event,
			tier: u?.tier ?? null,
			fee: row.fee_amount,
		};
	});

	function crewByRole(role: string) {
		const ca = crewAssignments.find((a) => a.role_in_event === role);
		if (!ca) return null;
		const u = Array.isArray(ca.user) ? ca.user[0] : ca.user;
		return u?.full_name ?? null;
	}

	const eventForWA = {
		project_id: event.project_id,
		client_name: event.client_name,
		client_wa: event.client_wa,
		event_date: event.event_date,
		setup_time: event.setup_time,
		start_time: event.start_time,
		end_time: event.end_time,
		session_segments: event.session_segments,
		venue_name: event.venue_name,
		due_date: null,
		total_paid: event.total_paid,
		remaining_balance: event.remaining_balance,
		package_name: pkg?.name ?? null,
		duration_hours: pkg?.duration_hours ?? null,
		crew_lead: crewByRole("lead"),
		crew_asisten: crewByRole("asisten"),
	};

	const categoryLabel = event.event_category
		? (eventTypeLabelByCode.get(event.event_category) ?? event.event_category)
		: null;

	// Potongan langsung vendor (upfront_cut) — dipotong dari payment flow,
	// jadi kas yang ditunggu = grand_total − potongan ("Tetra terima").
	const vendorCutAmount =
		event.vendor_commission_mode === "upfront_cut"
			? Number(event.vendor_commission_amount) || 0
			: 0;
	const billableTotal = Math.max(0, (event.grand_total ?? 0) - vendorCutAmount);

	// One canonical spec for every header action so the whole bar reads as a
	// single, uniform control group (height, radius, surface, type all match).
	const headerActionCls =
		"inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-border-default bg-card px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50";

	// Status dot tones for the emerald hero pill (light dots read on emerald).
	const HERO_STATUS_DOT: Record<string, string> = {
		upcoming: "bg-emerald-300",
		in_progress: "bg-sky-300",
		awaiting_settlement: "bg-amber-300",
		completed: "bg-emerald-300",
		cancelled: "bg-rose-300",
	};

	return (
		<Container size="xl" className="space-y-3">
			<TopbarEntityPortal name={event.client_name} />
			{/* === HEADER === */}
			<div className="space-y-4">
				{/* Emerald hero — the event identity, presented with a clear
				    hierarchy: eyebrow (channel · kategori) → name → project id,
				    with the status as a translucent pill on the right. */}
				<section className="overflow-hidden rounded-[20px] bg-[#059669] p-5 text-white shadow-[var(--shadow-level-3)]">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
								{CHANNEL_TYPE_LABELS[event.channel] ?? event.channel}
								{categoryLabel ? ` · ${categoryLabel}` : ""}
							</p>
							<h1
								className="mt-2 break-words text-[28px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[34px]"
								style={{ viewTransitionName: `event-${event.project_id}` }}
							>
								{event.client_name}
							</h1>
							<p className="tabular mt-2 font-mono text-[12.5px] text-white/65">
								{event.project_id}
							</p>
						</div>
						<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm">
							<span
								className={cn(
									"size-1.5 rounded-full",
									HERO_STATUS_DOT[event.status] ?? "bg-white",
								)}
								aria-hidden
							/>
							{EVENT_STATUS_LABELS[event.status] ?? event.status}
						</span>
					</div>

					{(isMigratedLegacy || isImportedLive) && (
						<div className="mt-4 flex flex-wrap items-center gap-1.5">
							{isMigratedLegacy && (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
									<Archive className="size-3" strokeWidth={2} aria-hidden />
									Migrated
								</span>
							)}
							{isImportedLive && (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
									<Inbox className="size-3" strokeWidth={2} aria-hidden />
									Imported
								</span>
							)}
						</div>
					)}
				</section>

				{/* Action toolbar — one horizontal-scroll row (no stacking) */}
				{!isMigratedLegacy && (
					<div className="hide-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 [&>*]:shrink-0">
						<StatusMenu
							projectId={event.project_id}
							eventId={event.id}
							currentStatus={
								event.status as Parameters<
									typeof StatusMenu
								>[0]["currentStatus"]
							}
						/>
						<SendWhatsAppButton
							event={eventForWA}
							templates={templates}
							size="sm"
						/>
						<PdfDownloadMenu
							options={[
								{
									label: "Invoice",
									href: `/api/pdf/invoice/${event.project_id}`,
									hint: "Tagihan ke klien",
								},
								{
									label: "Quotation",
									href: `/api/pdf/quotation/${event.project_id}`,
									hint: "Estimasi pre-DP",
								},
								{
									label: "BAST",
									href: `/api/pdf/bast/${event.project_id}`,
									hint: "Berita Acara Serah Terima",
								},
							]}
						/>
						<Link
							href={`/operations/${event.project_id}/edit`}
							className={headerActionCls}
						>
							<Pencil className="size-3.5" aria-hidden strokeWidth={2} />
							Edit
						</Link>
						{!settlement && (
							<DeleteEventButton
								eventId={event.id}
								projectId={event.project_id}
								clientName={event.client_name}
							/>
						)}
					</div>
				)}

				{isMigratedLegacy && (
					<div className="flex items-start gap-2 rounded-[12px] border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-800 dark:text-amber-300">
						<Archive
							className="mt-0.5 size-3.5 shrink-0"
							aria-hidden
							strokeWidth={2}
						/>
						<div className="space-y-0.5">
							<p className="font-semibold">
								Migrated from Phase-2 (read-only archive)
							</p>
							<p className="text-amber-700/80 dark:text-amber-400/80">
								Event ini di-import dari sistem lama untuk referensi historis.
								Tidak ada records payments / settlement / journal / earnings.
								{event.legacy_invoice_number && (
									<>
										{" "}
										Original invoice:{" "}
										<span className="tabular font-mono">
											{event.legacy_invoice_number}
										</span>
										.
									</>
								)}
							</p>
						</div>
					</div>
				)}
			</div>

			{/* === HERO RECAP === */}
			<ProjectHeroRecap
				projectId={event.project_id}
				clientName={event.client_name}
				channel={event.channel}
				eventCategory={event.event_category}
				eventCategoryLabel={categoryLabel}
				eventDate={event.event_date}
				startTime={event.start_time}
				endTime={event.end_time}
				sessionSegments={event.session_segments}
				venueName={event.venue_name}
				venueCity={event.venue_city ?? null}
				venueAddress={event.venue_address ?? null}
				packageName={pkg?.name ?? null}
				packageDurationHours={pkg?.duration_hours ?? null}
				frameSize={
					event.frame_size
						? (FRAME_SIZE_LABELS[event.frame_size] ?? event.frame_size)
						: null
				}
				backdropName={backdrop?.name ?? null}
				includeFlashdiskPouch={event.include_flashdisk_pouch}
				crewAssignments={recapCrew}
				crewSlot={
					canManageCrew ? (
						<CrewSlotAssign
							projectId={event.project_id}
							eventId={event.id}
							assignments={crewAssignmentRows}
							availableCrew={assignableCrew}
							event={eventForWA}
						/>
					) : undefined
				}
				grandTotal={event.grand_total ?? 0}
				totalPaid={event.total_paid ?? 0}
				remainingBalance={event.remaining_balance ?? 0}
				vendorCutAmount={vendorCutAmount}
				settlement={
					settlement
						? {
								revenue_net: settlement.revenue_net,
								hpp_total: settlement.hpp_total,
								opex_total: settlement.opex_total,
								net_profit: settlement.net_profit,
								margin_percentage: settlement.margin_percentage,
								is_loss: settlement.is_loss,
							}
						: null
				}
				canSettle={canSettle}
				equipmentCount={equipmentCount}
				rekapSubmitted={rekapSubmitted}
				driveFolderUrl={event.drive_folder_url ?? null}
			/>

			{/* === READINESS (collapsible, defaults open) === */}
			<CollapsibleCard
				icon={<Sparkles className="size-4" aria-hidden strokeWidth={2} />}
				title="Kesiapan Event"
				subtitle="Checklist progres menuju hari-H — pembayaran, crew, design, rekap."
				defaultOpen
				bodyClassName="!p-0"
			>
				<EventReadinessCard
					projectId={event.project_id}
					eventId={event.id}
					eventDate={event.event_date}
					status={event.status}
					paymentStatus={event.payment_status}
					totalPaid={event.total_paid ?? 0}
					remainingBalance={event.remaining_balance ?? 0}
					crewCount={crewAssignments.length}
					designStatus={(event.design_status ?? "belum") as DesignStatus}
					rekapSubmitted={rekapSubmitted}
				/>
			</CollapsibleCard>

			{/* === DETAIL CARDS (collapsible, default closed) === */}
			<div className="space-y-3">
				{/* Two independent columns — compact (no wasted width), and each
				    column flows on its own so opening a card never leaves a blank
				    beside a still-collapsed neighbour. */}
				<div className="grid items-start gap-3 md:grid-cols-2">
					<div className="space-y-3">
						<CollapsibleCard
							icon={<Phone className="size-4" aria-hidden strokeWidth={2} />}
							title="Klien & Kontak"
							subtitle="Nama, WA, email, booker, dan PIC event."
						>
							<dl className="space-y-2.5">
								<DetailRow label="Klien">{event.client_name}</DetailRow>
								<DetailRow label="WA Klien">
									{event.client_wa && event.client_wa !== "-" ? (
										<a
											href={`https://wa.me/${event.client_wa.replace(/^\+|^0/, "62")}`}
											target="_blank"
											rel="noopener noreferrer"
											className="tabular inline-flex items-center gap-1 text-[#0070f3] hover:underline"
										>
											{event.client_wa}
										</a>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</DetailRow>
								{event.client_email && (
									<DetailRow label="Email">
										<a
											href={`mailto:${event.client_email}`}
											className="inline-flex items-center gap-1 text-[#0070f3] hover:underline"
										>
											<Mail className="size-3" aria-hidden strokeWidth={2} />
											{event.client_email}
										</a>
									</DetailRow>
								)}
								{bookerContact && (
									<DetailRow label="Booker">
										<span className="block space-y-0.5">
											<span className="block">{bookerContact.name}</span>
											{bookerContact.phone && (
												<a
													href={`https://wa.me/${bookerContact.phone.replace(/^\+|^0/, "62")}`}
													target="_blank"
													rel="noopener noreferrer"
													className="tabular inline-flex items-center gap-1 text-[11.5px] text-[#0070f3] hover:underline"
												>
													{bookerContact.phone}
												</a>
											)}
										</span>
									</DetailRow>
								)}
								{(picDisplayName || picDisplayPhone) && (
									<DetailRow label="PIC Event">
										<span className="block space-y-0.5">
											{picDisplayName && (
												<span className="block font-medium text-foreground">
													{picDisplayName}
												</span>
											)}
											{picDisplayPhone && (
												<a
													href={`https://wa.me/${picDisplayPhone.replace(/^\+|^0/, "62")}`}
													target="_blank"
													rel="noopener noreferrer"
													className="tabular inline-flex items-center gap-1 text-[11.5px] text-[#0070f3] hover:underline"
												>
													{picDisplayPhone}
												</a>
											)}
											<span className="block text-[10.5px] text-muted-foreground">
												Crew kontak orang ini di hari H
											</span>
										</span>
									</DetailRow>
								)}
							</dl>
						</CollapsibleCard>

						<CollapsibleCard
							icon={
								<Building2 className="size-4" aria-hidden strokeWidth={2} />
							}
							title="Lokasi"
							subtitle={event.venue_name}
						>
							<dl className="space-y-2.5">
								<DetailRow label="Venue">{event.venue_name}</DetailRow>
								<DetailRow label="Alamat">
									{event.venue_address ?? "—"}
								</DetailRow>
								<DetailRow label="Kota">{event.venue_city ?? "—"}</DetailRow>
								<DetailRow label="Provinsi">
									{event.venue_province ?? "—"}
								</DetailRow>
							</dl>
						</CollapsibleCard>
					</div>
					<div className="space-y-3">
						<CollapsibleCard
							icon={<FileText className="size-4" aria-hidden strokeWidth={2} />}
							title="Service & Package"
							subtitle={
								pkg
									? `${pkg.name} · ${pkg.duration_hours}j`
									: "Custom / belum dipilih"
							}
						>
							<dl className="space-y-2.5">
								<DetailRow label="Service">
									{SERVICE_TYPE_LABELS[event.service_type] ??
										event.service_type}
								</DetailRow>
								<DetailRow label="Frame">
									{FRAME_SIZE_LABELS[event.frame_size] ?? event.frame_size}
								</DetailRow>
								<DetailRow label="Package">
									{pkg ? (
										<span>
											{pkg.name}
											<span className="tabular text-muted-foreground">
												{" · "}
												{pkg.duration_hours}j · {formatRupiah(pkg.base_price)}
											</span>
										</span>
									) : (
										<span className="text-muted-foreground">
											Custom / belum dipilih
										</span>
									)}
								</DetailRow>
								<DetailRow label="Backdrop">
									{(() => {
										if (!backdrop)
											return (
												<span className="text-muted-foreground">
													— belum dipilih
												</span>
											);
										const markup = event.vendor_decor_markup ?? 0;
										return (
											<span>
												{backdrop.name}
												{backdrop.type === "rental_owned" &&
													backdrop.rental_price > 0 && (
														<span className="tabular text-muted-foreground">
															{" · "}
															sewa {formatRupiah(backdrop.rental_price)}
														</span>
													)}
												{backdrop.type === "vendor_decor" && markup > 0 && (
													<span className="tabular text-muted-foreground">
														{" · "}
														markup {formatRupiah(markup)}
													</span>
												)}
											</span>
										);
									})()}
								</DetailRow>
								<DetailRow label="Flashdisk">
									{event.include_flashdisk_pouch ? (
										<span className="font-medium text-emerald-700 dark:text-emerald-400">
											Termasuk Flashdisk Pouch
										</span>
									) : (
										<span className="text-muted-foreground">
											Tidak termasuk
										</span>
									)}
								</DetailRow>
							</dl>
						</CollapsibleCard>

						<CollapsibleCard
							icon={<Wallet className="size-4" aria-hidden strokeWidth={2} />}
							title="Financial"
							subtitle={`Grand total ${formatRupiah(event.grand_total ?? 0)} · Outstanding ${formatRupiah(event.remaining_balance ?? 0)}`}
							actions={
								<Link
									href={`/operations/${event.project_id}/payments`}
									className={headerActionCls}
								>
									Manage payments
								</Link>
							}
						>
							<dl className="space-y-2.5">
								<DetailRow label="Base Price" align="right">
									<span className="tabular text-muted-foreground">
										{event.base_price ? formatRupiah(event.base_price) : "—"}
									</span>
								</DetailRow>
								<DetailRow label="Add-ons" align="right">
									<span className="tabular text-muted-foreground">
										{event.addons_total
											? formatRupiah(event.addons_total)
											: "—"}
									</span>
								</DetailRow>
								<DetailRow label="Discount" align="right">
									<span className="tabular text-muted-foreground">
										{event.discount_amount
											? `−${formatRupiah(event.discount_amount)}`
											: "—"}
									</span>
								</DetailRow>
								<DetailRow label="Gross-up PPh" align="right">
									<span className="tabular text-muted-foreground">
										{event.gross_up_pph_amount
											? formatRupiah(event.gross_up_pph_amount)
											: "—"}
									</span>
								</DetailRow>
								<div className="border-t border-border-subtle pt-2.5">
									<DetailRow label="Grand Total" strong align="right">
										<span className="tabular font-semibold text-foreground">
											{event.grand_total
												? formatRupiah(event.grand_total)
												: "—"}
										</span>
									</DetailRow>
								</div>
								{vendorCutAmount > 0 && (
									<>
										<DetailRow label="Potongan Vendor" align="right">
											<span className="tabular text-rose-600 dark:text-rose-400">
												−{formatRupiah(vendorCutAmount)}
											</span>
										</DetailRow>
										<DetailRow label="Tetra Terima" strong align="right">
											<span className="tabular font-semibold text-emerald-700 dark:text-emerald-400">
												{formatRupiah(billableTotal)}
											</span>
										</DetailRow>
									</>
								)}
								<DetailRow label="Total Paid" align="right">
									<span className="tabular text-emerald-700 dark:text-emerald-400">
										{event.total_paid ? formatRupiah(event.total_paid) : "—"}
									</span>
								</DetailRow>
								<DetailRow label="Remaining" strong align="right">
									<span
										className={cn(
											"tabular font-semibold",
											(event.remaining_balance ?? 0) > 0
												? "text-rose-600 dark:text-rose-400"
												: "text-foreground",
										)}
									>
										{event.remaining_balance
											? formatRupiah(event.remaining_balance)
											: "—"}
									</span>
								</DetailRow>
								<DetailRow label="Status" align="right">
									<PaymentStatusBadge status={event.payment_status} />
								</DetailRow>
							</dl>
						</CollapsibleCard>
					</div>
				</div>

				{eventAddons.length > 0 && (
					<CollapsibleCard
						icon={<Sparkles className="size-4" aria-hidden strokeWidth={2} />}
						title="Add-ons"
						subtitle={`${eventAddons.length} item${eventAddons.length === 1 ? "" : "s"}`}
						className="md:col-span-2"
					>
						<ul className="divide-y divide-border-subtle">
							{eventAddons.map((row, idx) => {
								const addon = Array.isArray(row.addon)
									? row.addon[0]
									: row.addon;
								return (
									<li
										key={`${addon?.name ?? "addon"}-${idx}`}
										className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
									>
										<div className="min-w-0 flex-1">
											<div className="truncate text-[13px] font-semibold text-foreground">
												{addon?.name ?? "—"}
											</div>
											<div className="text-[11.5px] text-muted-foreground">
												{row.quantity} {addon?.unit ?? ""}
											</div>
										</div>
										<span className="tabular text-[13px] font-medium">
											{formatRupiah(row.total_price)}
										</span>
									</li>
								);
							})}
						</ul>
					</CollapsibleCard>
				)}

				{eventBonuses.length > 0 && (
					<CollapsibleCard
						icon={<Sparkles className="size-4" aria-hidden strokeWidth={2} />}
						title="Bonus untuk Klien"
						subtitle="Item gratis (internal). Crew harus kasih saat acara."
						className="md:col-span-2"
					>
						<div className="space-y-2">
							{eventBonuses.map((row, idx) => {
								const addon = Array.isArray(row.addon)
									? row.addon[0]
									: row.addon;
								return (
									<div
										key={`${addon?.name ?? "bonus"}-${idx}`}
										className="rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/5 p-3"
									>
										<div className="flex items-baseline justify-between gap-3">
											<div className="min-w-0 flex-1">
												<div className="truncate text-[13px] font-semibold text-foreground">
													{addon?.name ?? "—"}
												</div>
												<div className="text-[11.5px] text-muted-foreground">
													{row.quantity} {addon?.unit ?? ""}
												</div>
											</div>
											<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
												Gratis
											</span>
										</div>
										{row.notes && (
											<p className="mt-1.5 text-[11.5px] italic text-muted-foreground">
												"{row.notes}"
											</p>
										)}
									</div>
								);
							})}
						</div>
					</CollapsibleCard>
				)}

				{event.crew_notes && (
					<CollapsibleCard
						icon={<FileText className="size-4" aria-hidden strokeWidth={2} />}
						title="Catatan untuk Crew"
						subtitle="Briefing dari owner ke crew."
						className="md:col-span-2"
					>
						<p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
							{event.crew_notes}
						</p>
					</CollapsibleCard>
				)}

				{settlement && (
					<CollapsibleCard
						icon={<Wallet className="size-4" aria-hidden strokeWidth={2} />}
						title="Settlement Detail"
						subtitle={`Ditutup ${formatDateID(settlement.closed_at)} · ${
							settlement.is_loss ? "RUGI" : "PROFIT"
						} ${settlement.margin_percentage}%`}
						className="md:col-span-2"
					>
						<div className="grid gap-5 sm:grid-cols-2">
							<dl className="space-y-2">
								<SettlementRow
									label="Revenue Net"
									value={formatRupiah(settlement.revenue_net)}
								/>
								<SettlementRow
									label="HPP"
									value={`−${formatRupiah(settlement.hpp_total)}`}
								/>
								<SettlementRow
									label="OpEx"
									value={`−${formatRupiah(settlement.opex_total)}`}
								/>
								<SettlementRow
									label="Total Biaya"
									value={`−${formatRupiah(settlement.total_biaya)}`}
								/>
								<div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
									<dt className="text-[13px] font-semibold text-foreground">
										Net Profit
									</dt>
									<dd
										className={cn(
											"tabular text-[13.5px] font-semibold",
											settlement.is_loss
												? "text-rose-600 dark:text-rose-400"
												: "text-emerald-700 dark:text-emerald-400",
										)}
									>
										{formatRupiah(settlement.net_profit)}
									</dd>
								</div>
							</dl>

							{!settlement.is_loss && (
								<dl className="space-y-2">
									<SettlementRow
										label="Sinking Funds"
										value={formatRupiah(settlement.sinking_total)}
									/>
									<SettlementRow
										label={`Owner Pool (× ${formatRupiah(
											settlement.owner_pool_per_person,
										)})`}
										value={formatRupiah(settlement.owner_pool_total)}
									/>
									<div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
										<dt className="text-[13px] font-semibold text-foreground">
											Operating Cash
										</dt>
										<dd className="tabular text-[13.5px] font-semibold text-foreground">
											{formatRupiah(settlement.operating_cash_kept)}
										</dd>
									</div>
								</dl>
							)}
						</div>
					</CollapsibleCard>
				)}
			</div>

			{/* === DRIVE + DESIGN (always visible — have inline actions) === */}
			<div className="grid gap-3 md:grid-cols-2">
				<EventDriveCard
					projectId={event.project_id}
					folderUrl={event.drive_folder_url ?? null}
					folderCreatedAt={event.drive_folder_created_at ?? null}
					canEdit={canEdit}
					driveConfigured={driveStatus.configured}
					driveConfigMissing={driveStatus.missing}
				/>

				<DesignCard
					eventId={event.id}
					projectId={event.project_id}
					frames={designFrames}
					briefAt={event.design_brief_at}
					designStatus={(event.design_status ?? "belum") as DesignStatus}
					canEdit={canEdit}
				/>
			</div>

			{/* === ACTIVITY FEED (collapsible, default closed) === */}
			<CollapsibleCard
				icon={<Activity className="size-4" aria-hidden strokeWidth={2} />}
				title="Activity"
				subtitle="Timeline status, payments, dan perubahan event."
				bodyClassName="!p-0"
			>
				<EventActivityFeed eventId={event.id} />
			</CollapsibleCard>
		</Container>
	);
}

function SettlementRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt
				className={cn(
					"text-[12px] text-muted-foreground",
					/\d/.test(label) && "tabular",
				)}
			>
				{label}
			</dt>
			<dd className="tabular text-[13px] text-foreground">{value}</dd>
		</div>
	);
}

function DetailRow({
	label,
	children,
	strong = false,
	align = "left",
}: {
	label: string;
	children: React.ReactNode;
	strong?: boolean;
	/** Value alignment — left for text (default), right for money columns. */
	align?: "left" | "right";
}) {
	return (
		<div className="grid grid-cols-[7rem_1fr] items-baseline gap-4">
			<dt className="eyebrow pt-px leading-snug">{label}</dt>
			<dd
				className={cn(
					"min-w-0 text-[13px] leading-snug",
					align === "right" ? "text-right" : "text-left",
					strong ? "font-semibold text-foreground" : "text-foreground",
				)}
			>
				{children}
			</dd>
		</div>
	);
}
