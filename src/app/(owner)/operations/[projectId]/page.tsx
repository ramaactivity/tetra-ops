import {
	Archive,
	CalculatorIcon,
	ChevronLeft,
	ClipboardList,
	ExternalLink,
	Inbox,
	Package,
	Pencil,
	Receipt,
	Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import {
	SendWhatsAppButton,
	type WhatsAppTemplate,
} from "@/components/booking/send-wa-button";
import { StatusMenu } from "@/components/booking/status-menu";
import { DesignCard } from "@/components/event-design/design-card";
import { EventActivityFeed } from "@/components/operations/activity-feed";
import { EventReadinessCard } from "@/components/operations/readiness-card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
	CHANNEL_TYPE_LABELS,
	FRAME_SIZE_LABELS,
	formatDateID,
	formatRupiah,
	SERVICE_TYPE_LABELS,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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

	const [{ data: event, error }, { data: templatesData }] = await Promise.all([
		supabase
			.from("events")
			.select(
				`
			id, project_id, status, channel, client_name, client_wa, client_email,
			service_type, frame_size, package_id, event_category, event_date,
			setup_time, start_time, end_time, venue_name, venue_address, venue_city,
			base_price, addons_total, discount_amount, gross_up_pph_amount,
			grand_total, total_paid, remaining_balance, payment_status,
			crew_notes, created_at, updated_at,
			is_migrated_legacy, legacy_invoice_number,
			design_brief_at, design_approved_at, design_drive_folder_url,
			backdrop_id, vendor_decor_markup,
			backdrop:backdrops(name, type, rental_price),
			event_type:event_types(label),
			package:packages(id, name, base_price, duration_hours),
			event_addons:event_addons(quantity, unit_price, total_price, addon:addons(name, unit, category)),
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
	]);

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
	const eventAddons = (event.event_addons ?? []) as Array<{
		quantity: number;
		unit_price: number;
		total_price: number;
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
					<div className="flex flex-wrap items-center gap-2">
						<EventStatusBadge status={event.status} />
						<Badge variant="outline">
							{CHANNEL_TYPE_LABELS[event.channel] ?? event.channel}
						</Badge>
						{isMigratedLegacy && (
							<Badge
								variant="secondary"
								className="border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
							>
								<Archive className="mr-1 h-3 w-3" />
								Migrated
							</Badge>
						)}
						{isImportedLive && (
							<Badge variant="outline" className="text-muted-foreground">
								<Inbox className="mr-1 h-3 w-3" />
								Imported
							</Badge>
						)}
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
								<Link
									href={`/operations/${event.project_id}/equipment`}
									className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
								>
									<Package className="h-3.5 w-3.5" />
									Equipment
									{equipmentCount > 0 && (
										<span className="bg-primary/15 text-primary tabular ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
											{equipmentCount}
										</span>
									)}
								</Link>
								<Link
									href={`/operations/${event.project_id}/rekap`}
									className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
								>
									<ClipboardList className="h-3.5 w-3.5" />
									Rekap
									{rekapSubmitted && (
										<span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
											✓
										</span>
									)}
								</Link>
								<Link
									href={`/operations/${event.project_id}/edit`}
									className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
								>
									<Pencil className="h-3.5 w-3.5" />
									Edit
								</Link>
								{canSettle && (
									<Link
										href={`/operations/${event.project_id}/settle`}
										className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold"
									>
										<CalculatorIcon className="h-3.5 w-3.5" />
										Settle Event
									</Link>
								)}
							</>
						)}
					</div>
				</div>
				{isMigratedLegacy && (
					<div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
						<Archive className="mt-0.5 h-4 w-4 shrink-0" />
						<div className="space-y-0.5">
							<p className="font-medium">
								Migrated from Phase-2 (read-only archive)
							</p>
							<p className="text-amber-800/80 dark:text-amber-300/80">
								Event ini di-import dari sistem lama untuk referensi
								historis. Tidak ada records payments / settlement / journal /
								earnings — kalau perlu adjust angka, edit langsung kolom event.
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

			<div className="grid gap-4 md:grid-cols-2">
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
							<span className="text-muted-foreground">
								Custom / belum dipilih
							</span>
						)}
					</DetailRow>
					<DetailRow label="Backdrop">
						{(() => {
							const bg = Array.isArray(event.backdrop)
								? event.backdrop[0]
								: event.backdrop;
							if (!bg)
								return (
									<span className="text-muted-foreground">— belum dipilih</span>
								);
							const markup = event.vendor_decor_markup ?? 0;
							return (
								<span>
									{bg.name}
									{bg.type === "rental_owned" && bg.rental_price > 0 && (
										<span className="text-muted-foreground">
											{" · "}
											sewa {formatRupiah(bg.rental_price)}
										</span>
									)}
									{bg.type === "vendor_decor" && markup > 0 && (
										<span className="text-muted-foreground">
											{" · "}
											markup {formatRupiah(markup)}
										</span>
									)}
								</span>
							);
						})()}
					</DetailRow>
				</DetailCard>

				<DetailCard title="Event">
					<DetailRow label="Kategori">
						{(() => {
							const t = Array.isArray(event.event_type)
								? event.event_type[0]
								: event.event_type;
							return t?.label ?? event.event_category;
						})()}
					</DetailRow>
					<DetailRow label="Tanggal">
						{formatDateID(event.event_date)}
					</DetailRow>
					<DetailRow label="Setup">{event.setup_time}</DetailRow>
					<DetailRow label="Start">{event.start_time}</DetailRow>
					<DetailRow label="End">{event.end_time}</DetailRow>
				</DetailCard>

				<DetailCard title="Lokasi">
					<DetailRow label="Venue">{event.venue_name}</DetailRow>
					<DetailRow label="Alamat">{event.venue_address ?? "—"}</DetailRow>
					<DetailRow label="Kota">{event.venue_city ?? "—"}</DetailRow>
				</DetailCard>

				<div className="border-border bg-card space-y-3 rounded-xl border p-5 md:col-span-2">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold tracking-tight">Crew</h3>
						<Link
							href={`/operations/${event.project_id}/crew`}
							className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
						>
							<Users className="h-3.5 w-3.5" />
							Manage
						</Link>
					</div>
					{crewAssignments.length === 0 ? (
						<p className="text-muted-foreground text-sm italic">
							Belum ada crew di-assign.
						</p>
					) : (
						<div className="space-y-1">
							{crewAssignments.map((row, idx) => {
								const u = Array.isArray(row.user) ? row.user[0] : row.user;
								return (
									<div
										key={`${u?.full_name ?? "crew"}-${idx}`}
										className="flex items-baseline justify-between gap-3 text-sm"
									>
										<div>
											<span className="font-medium">{u?.full_name ?? "—"}</span>
											{u?.tier && (
												<span className="text-muted-foreground">
													{" "}
													· {u.tier}
												</span>
											)}
											<span className="text-muted-foreground">
												{" "}
												· {ROLE_LABELS[row.role_in_event] ?? row.role_in_event}
											</span>
										</div>
										<span className="tabular text-muted-foreground">
											{formatRupiah(row.fee_amount)}
										</span>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{eventAddons.length > 0 && (
					<DetailCard title="Add-ons" className="md:col-span-2">
						<div className="space-y-1">
							{eventAddons.map((row, idx) => {
								const addon = Array.isArray(row.addon)
									? row.addon[0]
									: row.addon;
								return (
									<div
										key={`${addon?.name ?? "addon"}-${idx}`}
										className="flex items-baseline justify-between gap-3 text-sm"
									>
										<div>
											<span className="font-medium">{addon?.name ?? "—"}</span>
											<span className="text-muted-foreground">
												{" "}
												· {row.quantity} {addon?.unit ?? ""}
											</span>
										</div>
										<span className="tabular">
											{formatRupiah(row.total_price)}
										</span>
									</div>
								);
							})}
						</div>
					</DetailCard>
				)}

				<div className="border-border bg-card md:col-span-2 space-y-3 rounded-xl border p-5">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold tracking-tight">Financial</h3>
						<Link
							href={`/operations/${event.project_id}/payments`}
							className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium"
						>
							<Receipt className="h-3.5 w-3.5" />
							Manage payments
						</Link>
					</div>
					<dl className="space-y-2">
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
						<DetailRow label="Grand Total">
							<span className="tabular text-foreground font-semibold">
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
							<PaymentStatusBadge status={event.payment_status} />
						</DetailRow>
					</dl>
				</div>

				{event.crew_notes && (
					<DetailCard title="Catatan untuk Crew" className="md:col-span-2">
						<p className="text-foreground whitespace-pre-wrap text-sm">
							{event.crew_notes}
						</p>
					</DetailCard>
				)}

				<DesignCard
					eventId={event.id}
					projectId={event.project_id}
					driveUrl={event.design_drive_folder_url}
					briefAt={event.design_brief_at}
					approvedAt={event.design_approved_at}
					canEdit={canEdit}
				/>

				<EventActivityFeed eventId={event.id} />
			</div>

			{settlement && (
				<div className="border-border bg-card space-y-4 rounded-xl border p-5">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<div className="space-y-0.5">
							<h3 className="text-base font-semibold tracking-tight">
								Settlement
							</h3>
							<p className="text-muted-foreground text-xs">
								Ditutup {formatDateID(settlement.closed_at)}
							</p>
						</div>
						<Badge variant={settlement.is_loss ? "destructive" : "default"}>
							{settlement.is_loss
								? `RUGI · ${settlement.margin_percentage}%`
								: `PROFIT · ${settlement.margin_percentage}%`}
						</Badge>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
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
							<div className="flex items-baseline justify-between border-t border-border pt-2 text-sm font-semibold">
								<dt>Net Profit</dt>
								<dd
									className={
										settlement.is_loss
											? "tabular text-rose-500"
											: "tabular text-emerald-500"
									}
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
								<div className="flex items-baseline justify-between border-t border-border pt-2 text-sm font-semibold">
									<dt>Operating Cash</dt>
									<dd className="tabular text-foreground">
										{formatRupiah(settlement.operating_cash_kept)}
									</dd>
								</div>
							</dl>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function SettlementRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3 text-sm">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-foreground tabular">{value}</dd>
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
