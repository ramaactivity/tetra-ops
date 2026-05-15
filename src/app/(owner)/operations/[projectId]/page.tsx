import {
	Activity,
	Archive,
	Building2,
	ChevronLeft,
	FileText,
	Inbox,
	Mail,
	Pencil,
	Phone,
	Sparkles,
	Tag,
	Users,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { DeleteEventButton } from "@/components/booking/delete-event-button";
import {
	SendWhatsAppButton,
	type WhatsAppTemplate,
} from "@/components/booking/send-wa-button";
import { StatusMenu } from "@/components/booking/status-menu";
import { EventDriveCard } from "@/components/drive/event-drive-card";
import { DesignCard } from "@/components/event-design/design-card";
import { Container } from "@/components/layout/container";
import { EventActivityFeed } from "@/components/operations/activity-feed";
import {
	ProjectHeroRecap,
	type ProjectHeroRecapCrew,
} from "@/components/operations/project-hero-recap";
import { EventReadinessCard } from "@/components/operations/readiness-card";
import { PdfDownloadMenu } from "@/components/pdf/download-menu";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { getDriveStatus } from "@/lib/actions/drive";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	CHANNEL_TYPE_LABELS,
	FRAME_SIZE_LABELS,
	formatDateID,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
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
			setup_time, start_time, end_time, venue_name, venue_address, venue_city, venue_province,
			base_price, addons_total, discount_amount, gross_up_pph_amount,
			grand_total, total_paid, remaining_balance, payment_status,
			include_flashdisk_pouch,
			crew_notes, created_at, updated_at,
			is_migrated_legacy, legacy_invoice_number,
			booker_contact:contacts!events_booker_contact_id_fkey(id, name, phone, type, legacy_contact_id),
			pic_contact:contacts!events_pic_contact_id_fkey(id, name, phone, type, legacy_contact_id),
			design_brief_at, design_approved_at, design_drive_folder_url,
			drive_folder_id, drive_folder_url, drive_folder_created_at,
			backdrop_id, vendor_decor_markup,
			backdrop:backdrops(name, type, rental_price),
			package:packages(id, name, base_price, duration_hours),
			event_addons:event_addons(quantity, unit_price, total_price, addon:addons(name, unit, category)),
			event_bonuses:event_bonuses(quantity, notes, addon:addons(name, unit, category)),
			crew_assignments:crew_assignments(role_in_event, fee_amount, user:users!crew_assignments_user_id_fkey(full_name, tier)),
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
		role_in_event: string;
		fee_amount: number;
		user:
			| { full_name: string; tier: string | null }
			| Array<{ full_name: string; tier: string | null }>
			| null;
	}>;
	const ROLE_LABELS: Record<string, string> = {
		lead: "Lead",
		asisten: "Asisten",
		crew_c: "Crew C",
	};

	const templates = (templatesData ?? []) as WhatsAppTemplate[];
	const settlement = Array.isArray(event.settlement)
		? event.settlement[0]
		: event.settlement;
	const isMigratedLegacy = !!event.is_migrated_legacy;
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
	const [{ count: equipmentCountRaw }, { data: rekapData }] = await Promise.all(
		[
			supabase
				.from("inventory_items")
				.select("id", { count: "exact", head: true })
				.eq("category", "equipment")
				.eq("current_event_id", event.id),
			supabase
				.from("crew_rekap")
				.select("id, is_approved")
				.eq("event_id", event.id)
				.maybeSingle(),
		],
	);
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

	const headerActionCls = buttonVariants({ variant: "outline", size: "sm" });
	const headerCtaCls = buttonVariants({ variant: "default", size: "sm" });

	return (
		<Container size="xl" className="space-y-5">
			{/* === HEADER === */}
			<div className="space-y-3">
				<Link
					href="/operations"
					className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft className="size-4" aria-hidden strokeWidth={2} />
					Operations
				</Link>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-2">
						<h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[32px]">
							{event.client_name}
						</h1>
						<div className="flex flex-wrap items-center gap-2">
							<span
								className="tabular font-mono text-[12px] text-muted-foreground"
								style={{
									viewTransitionName: `event-${event.project_id}`,
								}}
							>
								{event.project_id}
							</span>
							<span className="text-muted-foreground/40" aria-hidden>
								·
							</span>
							<EventStatusBadge status={event.status} />
							<Badge variant="outline">
								{CHANNEL_TYPE_LABELS[event.channel] ?? event.channel}
							</Badge>
							{categoryLabel && (
								<Badge variant="default" className="gap-1">
									<Tag className="size-2.5" aria-hidden strokeWidth={2.5} />
									{categoryLabel}
								</Badge>
							)}
							{isMigratedLegacy && (
								<Badge variant="warning" className="gap-1">
									<Archive className="size-2.5" aria-hidden strokeWidth={2.5} />
									Migrated
								</Badge>
							)}
							{isImportedLive && (
								<Badge variant="outline" className="gap-1">
									<Inbox className="size-2.5" aria-hidden strokeWidth={2.5} />
									Imported
								</Badge>
							)}
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						{!isMigratedLegacy && (
							<>
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
							</>
						)}
					</div>
				</div>
				{isMigratedLegacy && (
					<div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-800 dark:text-amber-300">
						<Archive
							className="mt-0.5 size-3.5 shrink-0"
							aria-hidden
							strokeWidth={2}
						/>
						<div className="space-y-0.5">
							<p className="font-semibold">Migrated from Phase-2 (read-only archive)</p>
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
				grandTotal={event.grand_total ?? 0}
				totalPaid={event.total_paid ?? 0}
				remainingBalance={event.remaining_balance ?? 0}
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
				subtitle="Checklist progress menuju hari-H — DP, crew, design, equipment, rekap."
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
					designApprovedAt={event.design_approved_at}
					designDriveUrl={event.design_drive_folder_url}
					equipmentCount={equipmentCount}
					rekapSubmitted={rekapSubmitted}
				/>
			</CollapsibleCard>

			{/* === DETAIL CARDS (collapsible, default closed) === */}
			<div className="grid gap-3 md:grid-cols-2">
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
									<Mail
										className="size-3"
										aria-hidden
										strokeWidth={2}
									/>
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
										<span className="block font-medium text-amber-700 dark:text-amber-400">
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
					icon={<Building2 className="size-4" aria-hidden strokeWidth={2} />}
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

				<CollapsibleCard
					icon={<FileText className="size-4" aria-hidden strokeWidth={2} />}
					title="Service & Package"
					subtitle={
						pkg ? `${pkg.name} · ${pkg.duration_hours}j` : "Custom / belum dipilih"
					}
				>
					<dl className="space-y-2.5">
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
												<span className="text-muted-foreground">
													{" · "}
													sewa {formatRupiah(backdrop.rental_price)}
												</span>
											)}
										{backdrop.type === "vendor_decor" && markup > 0 && (
											<span className="text-muted-foreground">
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
								<span className="text-muted-foreground">Tidak termasuk</span>
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
						<DetailRow label="Base Price">
							<span className="tabular">
								{event.base_price ? formatRupiah(event.base_price) : "—"}
							</span>
						</DetailRow>
						<DetailRow label="Add-ons">
							<span className="tabular">
								{event.addons_total ? formatRupiah(event.addons_total) : "—"}
							</span>
						</DetailRow>
						<DetailRow label="Discount">
							<span className="tabular">
								{event.discount_amount
									? `−${formatRupiah(event.discount_amount)}`
									: "—"}
							</span>
						</DetailRow>
						<DetailRow label="Gross-up PPh">
							<span className="tabular">
								{event.gross_up_pph_amount
									? formatRupiah(event.gross_up_pph_amount)
									: "—"}
							</span>
						</DetailRow>
						<DetailRow label="Grand Total" strong>
							<span className="tabular font-semibold text-foreground">
								{event.grand_total ? formatRupiah(event.grand_total) : "—"}
							</span>
						</DetailRow>
						<DetailRow label="Total Paid">
							<span className="tabular">
								{event.total_paid ? formatRupiah(event.total_paid) : "—"}
							</span>
						</DetailRow>
						<DetailRow label="Remaining" strong>
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
						<DetailRow label="Status">
							<PaymentStatusBadge status={event.payment_status} />
						</DetailRow>
					</dl>
				</CollapsibleCard>

				<CollapsibleCard
					icon={<Users className="size-4" aria-hidden strokeWidth={2} />}
					title="Crew Assignments"
					subtitle={
						crewAssignments.length === 0
							? "Belum ada crew di-assign"
							: `${crewAssignments.length} crew · total fee ${formatRupiah(
									crewAssignments.reduce((s, c) => s + c.fee_amount, 0),
								)}`
					}
					actions={
						<Link
							href={`/operations/${event.project_id}/crew`}
							className={headerActionCls}
						>
							Manage
						</Link>
					}
					className="md:col-span-2"
				>
					{crewAssignments.length === 0 ? (
						<div className="rounded-md border border-dashed border-border-default p-6 text-center">
							<Users
								className="mx-auto size-5 text-muted-foreground/60"
								aria-hidden
							/>
							<p className="mt-2 text-[13px] font-medium text-foreground">
								Belum ada crew di-assign
							</p>
							<p className="mt-1 text-[12px] text-muted-foreground">
								Klik Manage untuk assign lead, asisten, dan crew C.
							</p>
						</div>
					) : (
						<ul className="divide-y divide-border-subtle">
							{crewAssignments.map((row, idx) => {
								const u = Array.isArray(row.user) ? row.user[0] : row.user;
								return (
									<li
										key={`${u?.full_name ?? "crew"}-${idx}`}
										className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
									>
										<div className="min-w-0 flex-1">
											<div className="truncate text-[13px] font-semibold text-foreground">
												{u?.full_name ?? "—"}
											</div>
											<div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
												<span className="eyebrow !text-[9.5px]">
													{ROLE_LABELS[row.role_in_event] ??
														row.role_in_event}
												</span>
												{u?.tier && (
													<>
														<span
															className="text-muted-foreground/40"
															aria-hidden
														>
															·
														</span>
														<span className="capitalize">{u.tier}</span>
													</>
												)}
											</div>
										</div>
										<span className="tabular shrink-0 text-[13px] font-medium text-foreground">
											{formatRupiah(row.fee_amount)}
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</CollapsibleCard>

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
					driveUrl={event.design_drive_folder_url}
					briefAt={event.design_brief_at}
					approvedAt={event.design_approved_at}
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
			<dt className="text-[12px] text-muted-foreground">{label}</dt>
			<dd className="tabular text-[13px] text-foreground">{value}</dd>
		</div>
	);
}

function DetailRow({
	label,
	children,
	strong = false,
}: {
	label: string;
	children: React.ReactNode;
	strong?: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<dt className="eyebrow shrink-0 !text-[10px]">{label}</dt>
			<dd
				className={cn(
					"min-w-0 text-right text-[13px]",
					strong ? "font-semibold text-foreground" : "text-foreground",
				)}
			>
				{children}
			</dd>
		</div>
	);
}
