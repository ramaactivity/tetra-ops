"use client";

import {
	Archive,
	CalendarDays,
	Clock,
	Frame,
	HardDrive,
	Inbox,
	MapPin,
	Package2,
	Tag,
} from "lucide-react";
import Link from "next/link";
import {
	EventStatusDot,
	PaymentStatusDot,
} from "@/components/badges/status-badge";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <OperationsListTable /> — pass 9 redesign.
 *
 * Every row renders three logical lines per cell so the table reads as a
 * dense Vercel-deployments-style information panel:
 *
 *   PROJECT          → client name (wrap up to 2 lines) + channel · category
 *   WAKTU & TEMPAT   → 📅 date / 🕐 time range / 📍 venue
 *   DETAIL PAKET     → 📦 paket / 💾 flashdisk yes-no / 🖼 backdrop
 *   CREW             → Lead / Asst (first-word names only)
 *   STATUS           → event status / payment status / Sisa amount
 *
 * Typography lock: 14/600 client name only · 13/500 primary facts ·
 * 12/400 secondary facts · 11/mono channel + eyebrow.
 */

export type EventRow = {
	id: string;
	project_id: string;
	status: string;
	channel: string;
	client_name: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	end_time: string | null;
	frame_size: string | null;
	backdrop_color: string | null;
	include_flashdisk_pouch: boolean | null;
	venue_name: string;
	venue_city: string | null;
	grand_total: number;
	remaining_balance: number | null;
	payment_status: string;
	is_migrated_legacy: boolean | null;
	legacy_invoice_number: string | null;
	package_name: string | null;
	package_duration_hours: number | null;
	backdrop_name: string | null;
	backdrop_type: string | null;
	event_category: string | null;
	event_category_label: string | null;
};

export type CrewChip = {
	user_id: string;
	full_name: string;
	nickname: string | null;
	tier: "senior" | "junior" | null;
	role_in_event: string;
};

interface Props {
	events: EventRow[];
	crewByEventEntries: Array<[string, CrewChip[]]>;
	crewFilter: string;
}

// Channel + category dots removed decorative palette per DESIGN.md §867.
// Channel: primary (in-house signal) vs muted (external/3rd party).
// Category: all neutral — the text label is the signal. If we need
// stronger visual scan later, prefer lucide icons over color (icons
// also work for color-blind users).
const CHANNEL_DOT: Record<string, string> = {
	direct: "bg-foreground",
	vendor: "bg-muted-foreground/60",
	relasi: "bg-muted-foreground/60",
};

const CATEGORY_DOT: Record<string, string> = {
	wedding: "bg-muted-foreground/50",
	birthday: "bg-muted-foreground/50",
	wisuda: "bg-muted-foreground/50",
	gathering: "bg-muted-foreground/50",
	reuni: "bg-muted-foreground/50",
	corporate: "bg-foreground",
	instansi: "bg-muted-foreground/50",
	event: "bg-muted-foreground/50",
};

/* Three substantive columns + crew (narrow) + status (right-aligned).
   Waktu & Tempat gets the most flex so venue lines breathe; Detail Paket
   and Crew get tighter. Status is right-aligned at the auto end. */
const COLS_DESKTOP =
	"grid-cols-[minmax(13rem,1.15fr)_minmax(13rem,1.55fr)_minmax(12rem,1fr)_minmax(6rem,0.45fr)_minmax(11rem,0.85fr)]";

function formatTime(t: string | null): string {
	return t ? t.slice(0, 5) : "—";
}

function formatDayDate(iso: string): string {
	const day = new Date(iso).toLocaleDateString("id-ID", { weekday: "short" });
	return `${day}, ${formatDateID(iso)}`;
}

/** "4R UNLIMITED 3 JAM" → "4R Unlimited 3 Jam". Numbers stay upper. */
function prettyPackageName(name: string): string {
	return name
		.toLowerCase()
		.split(/\s+/)
		.map((word) =>
			/^\d/.test(word)
				? word.toUpperCase()
				: word.charAt(0).toUpperCase() + word.slice(1),
		)
		.join(" ");
}

/** "Padma Ananda Saputra" → "Padma". Nicknames stay one-word. */
function firstWord(name: string): string {
	return name.trim().split(/\s+/)[0] ?? name;
}

function packageLabel(ev: EventRow): string {
	if (ev.package_name) return prettyPackageName(ev.package_name);
	const fallback = [
		ev.frame_size,
		ev.package_duration_hours ? `${ev.package_duration_hours} jam` : null,
	]
		.filter(Boolean)
		.join(" · ");
	return fallback || "—";
}

function backdropLabel(ev: EventRow): string | null {
	if (ev.backdrop_name) return ev.backdrop_name;
	if (ev.backdrop_color && ev.backdrop_color !== "custom") {
		return ev.backdrop_color.charAt(0).toUpperCase() + ev.backdrop_color.slice(1);
	}
	return null;
}

export function OperationsListTable({
	events,
	crewByEventEntries,
	crewFilter,
}: Props) {
	const crewByEvent = new Map(crewByEventEntries);
	const highlightUserId = crewFilter || undefined;

	return (
		<div className="overflow-hidden rounded-lg border border-border-default bg-card">
			{/* DESKTOP */}
			<div className="hidden md:block">
				<div
					className={cn(
						"grid items-center gap-5 border-b border-border-default bg-secondary px-5 py-2.5",
						COLS_DESKTOP,
					)}
				>
					<span className="eyebrow">Project</span>
					<span className="eyebrow">Waktu & Tempat</span>
					<span className="eyebrow">Detail Paket</span>
					<span className="eyebrow">Crew</span>
					<span className="eyebrow text-right">Status</span>
				</div>

				<div>
					{events.map((ev) => {
						const crew = crewByEvent.get(ev.id) ?? [];
						const sisa = ev.remaining_balance ?? 0;
						const pkg = packageLabel(ev);
						const bd = backdropLabel(ev);

						return (
							<Link
								key={ev.id}
								href={`/operations/${ev.project_id}`}
								style={{
									viewTransitionName: `event-${ev.project_id}`,
								}}
								className={cn(
									"group grid items-start gap-5 border-b border-border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-secondary/60",
									COLS_DESKTOP,
								)}
							>
								{/* PROJECT */}
								<div className="flex min-w-0 flex-col gap-1.5">
									<div className="flex min-w-0 items-start gap-1.5">
										<span className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-foreground">
											{ev.client_name}
										</span>
										{ev.is_migrated_legacy && (
											<Archive
												className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-500"
												aria-label="Migrated"
												strokeWidth={2}
											/>
										)}
										{!ev.is_migrated_legacy &&
											ev.legacy_invoice_number && (
												<Inbox
													className="mt-0.5 size-3 shrink-0 text-muted-foreground"
													aria-label={`Imported (${ev.legacy_invoice_number})`}
													strokeWidth={2}
												/>
											)}
									</div>
									<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<ChannelTag channel={ev.channel} />
										{ev.event_category && (
											<CategoryTag
												code={ev.event_category}
												label={ev.event_category_label}
											/>
										)}
									</div>
								</div>

								{/* WAKTU & TEMPAT */}
								<div className="flex min-w-0 flex-col gap-1 tabular leading-snug">
									<MetaLine
										icon={CalendarDays}
										primary={formatDayDate(ev.event_date)}
										strong
									/>
									{ev.start_time && (
										<MetaLine
											icon={Clock}
											primary={`${formatTime(ev.start_time)}${
												ev.end_time
													? ` – ${formatTime(ev.end_time)}`
													: ""
											}`}
										/>
									)}
									<MetaLine
										icon={MapPin}
										primary={ev.venue_name}
										muted
									/>
								</div>

								{/* DETAIL PAKET */}
								<div className="flex min-w-0 flex-col gap-1 leading-snug">
									<MetaLine
										icon={Package2}
										primary={pkg}
										strong
									/>
									<MetaLine
										icon={HardDrive}
										primary={
											ev.include_flashdisk_pouch
												? "Flashdisk Pouch"
												: "Tanpa Flashdisk"
										}
										muted={!ev.include_flashdisk_pouch}
										accent={
											ev.include_flashdisk_pouch
												? "emerald"
												: undefined
										}
									/>
									<MetaLine
										icon={Frame}
										primary={bd ?? "Belum ditentukan"}
										muted={!bd}
									/>
								</div>

								{/* CREW */}
								<CrewLine
									crew={crew}
									highlightUserId={highlightUserId}
								/>

								{/* STATUS */}
								<div className="flex flex-col items-end gap-1 leading-snug">
									<EventStatusDot
										status={ev.status}
										className="!text-[13px] !font-semibold"
									/>
									<PaymentStatusDot
										status={ev.payment_status}
										className="!text-[12.5px]"
									/>
									{sisa > 0 ? (
										<span
											className="tabular text-[13px] font-medium text-rose-600 dark:text-rose-400"
											title={`Sisa pembayaran`}
										>
											{formatRupiah(sisa)}
										</span>
									) : (
										<span
											className="tabular text-[12px] text-muted-foreground/50"
											aria-hidden
										>
											—
										</span>
									)}
								</div>
							</Link>
						);
					})}
				</div>
			</div>

			{/* MOBILE */}
			<div className="space-y-2 p-3 md:hidden">
				{events.map((ev) => {
					const crew = crewByEvent.get(ev.id) ?? [];
					const sisa = ev.remaining_balance ?? 0;
					const pkg = packageLabel(ev);
					const bd = backdropLabel(ev);
					return (
						<Link
							key={ev.id}
							href={`/operations/${ev.project_id}`}
							style={{
								viewTransitionName: `event-${ev.project_id}`,
							}}
							className="flex flex-col gap-3 rounded-md border border-border-default bg-card p-3.5 transition-colors active:bg-secondary"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 flex-1 space-y-1.5">
									<div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-foreground">
										{ev.client_name}
									</div>
									<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<ChannelTag channel={ev.channel} />
										{ev.event_category && (
											<CategoryTag
												code={ev.event_category}
												label={ev.event_category_label}
											/>
										)}
									</div>
								</div>
								<EventStatusDot
									status={ev.status}
									className="shrink-0 !text-[13px] !font-semibold"
								/>
							</div>
							<div className="grid grid-cols-2 gap-x-3 gap-y-2.5 leading-snug">
								<div className="space-y-1 tabular">
									<span className="eyebrow block !text-[9.5px]">
										Waktu & Tempat
									</span>
									<MetaLine
										icon={CalendarDays}
										primary={formatDayDate(ev.event_date)}
										strong
									/>
									{ev.start_time && (
										<MetaLine
											icon={Clock}
											primary={`${formatTime(ev.start_time)}${
												ev.end_time
													? ` – ${formatTime(ev.end_time)}`
													: ""
											}`}
										/>
									)}
									<MetaLine
										icon={MapPin}
										primary={ev.venue_name}
										muted
									/>
								</div>
								<div className="space-y-1">
									<span className="eyebrow block !text-[9.5px]">
										Detail Paket
									</span>
									<MetaLine icon={Package2} primary={pkg} strong />
									<MetaLine
										icon={HardDrive}
										primary={
											ev.include_flashdisk_pouch
												? "Flashdisk"
												: "Tanpa Flashdisk"
										}
										muted={!ev.include_flashdisk_pouch}
										accent={
											ev.include_flashdisk_pouch
												? "emerald"
												: undefined
										}
									/>
									<MetaLine
										icon={Frame}
										primary={bd ?? "Belum ditentukan"}
										muted={!bd}
									/>
								</div>
								<div className="col-span-2 border-t border-border-subtle pt-2">
									<span className="eyebrow block !text-[9.5px]">
										Crew
									</span>
									<div className="mt-1">
										<CrewLine
											crew={crew}
											highlightUserId={crewFilter || undefined}
											compact
										/>
									</div>
								</div>
								<div className="col-span-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
									<PaymentStatusDot
										status={ev.payment_status}
										className="!text-[12.5px]"
									/>
									{sisa > 0 && (
										<span className="tabular text-[13px] font-medium text-rose-600 dark:text-rose-400">
											Sisa {formatRupiah(sisa)}
										</span>
									)}
								</div>
							</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
}

/**
 * <MetaLine /> — single-icon + value row used inside Waktu & Tempat and
 * Detail Paket cells. Vercel-style: 14×14 stroked icon at muted-fg tone,
 * 12/400 body text. The `accent` prop lets a row borrow a semantic tint
 * (e.g. emerald when "Flashdisk Pouch" is included).
 */
type IconCmp = React.ComponentType<{
	className?: string;
	"aria-hidden"?: boolean;
	strokeWidth?: number;
}>;

function MetaLine({
	icon: Icon,
	primary,
	muted = false,
	accent,
	strong = false,
}: {
	icon: IconCmp;
	primary: string;
	muted?: boolean;
	accent?: "emerald";
	/** Row-1 of a cell: bolder weight + tighter color. */
	strong?: boolean;
}) {
	const tint =
		accent === "emerald"
			? "text-emerald-700 dark:text-emerald-400"
			: muted
				? "text-muted-foreground"
				: "text-foreground";
	const iconTint =
		accent === "emerald"
			? "text-emerald-700/80 dark:text-emerald-400/80"
			: "text-muted-foreground/70";
	return (
		<div
			className={cn(
				"inline-flex min-w-0 items-center gap-1.5 leading-snug",
				strong ? "text-[13px] font-semibold" : "text-[12.5px]",
				tint,
			)}
		>
			<Icon
				className={cn("size-3.5 shrink-0", iconTint)}
				aria-hidden
				strokeWidth={strong ? 2.2 : 2}
			/>
			<span className="truncate">{primary}</span>
		</div>
	);
}

function ChannelTag({ channel }: { channel: string }) {
	const dot = CHANNEL_DOT[channel] ?? "bg-muted-foreground/50";
	const label = CHANNEL_TYPE_LABELS[channel] ?? channel;
	return (
		<span
			className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium uppercase tracking-wide text-muted-foreground"
			title={`Channel: ${label}`}
		>
			<span
				className={cn("inline-block size-1.5 shrink-0 rounded-full", dot)}
				aria-hidden
			/>
			{label}
		</span>
	);
}

function CategoryTag({
	code,
	label,
}: {
	code: string;
	label: string | null;
}) {
	const dot = CATEGORY_DOT[code] ?? "bg-muted-foreground/50";
	const displayed = label ?? code;
	return (
		<span
			className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium uppercase tracking-wide text-muted-foreground"
			title={`Kategori: ${displayed}`}
		>
			<span
				className={cn("inline-block size-1.5 shrink-0 rounded-full", dot)}
				aria-hidden
			/>
			<Tag
				className="size-2.5 shrink-0 text-muted-foreground/60"
				aria-hidden
				strokeWidth={2.5}
			/>
			{displayed}
		</span>
	);
}

function CrewLine({
	crew,
	highlightUserId,
	compact = false,
}: {
	crew: CrewChip[];
	highlightUserId?: string;
	compact?: boolean;
}) {
	const lead = crew.find((c) => c.role_in_event === "lead");
	const others = crew.filter((c) => c.role_in_event !== "lead");

	const leadDisplay = lead
		? firstWord(lead.nickname ?? lead.full_name)
		: null;
	const asistenSource = others[0];
	const asistenDisplay = asistenSource
		? firstWord(asistenSource.nickname ?? asistenSource.full_name)
		: null;
	const extra = others.length > 1 ? others.length - 1 : 0;
	const isHighlight = (uid?: string) => highlightUserId === uid;

	const labelCls = compact
		? "eyebrow w-10 shrink-0 !text-[9.5px]"
		: "eyebrow w-9 shrink-0 !text-[10px]";
	const nameCls = "text-[13px] leading-snug";

	return (
		<div className="flex flex-col gap-1.5 leading-snug">
			<div className="flex items-center gap-2 min-w-0">
				<span className={labelCls}>Lead</span>
				{leadDisplay ? (
					<span
						className={cn(
							"truncate font-semibold",
							nameCls,
							isHighlight(lead?.user_id)
								? "text-foreground"
								: "text-foreground",
						)}
						title={lead?.full_name}
					>
						{leadDisplay}
					</span>
				) : (
					<span
						className={cn(nameCls, "text-muted-foreground/60 italic")}
					>
						—
					</span>
				)}
			</div>
			<div className="flex items-center gap-2 min-w-0">
				<span className={labelCls}>Asst</span>
				{asistenDisplay ? (
					<span
						className={cn(
							"truncate",
							nameCls,
							isHighlight(asistenSource?.user_id)
								? "font-semibold text-foreground"
								: "text-muted-foreground",
						)}
						title={asistenSource?.full_name}
					>
						{asistenDisplay}
						{extra > 0 && (
							<span className="text-muted-foreground/60">
								{" "}
								+{extra}
							</span>
						)}
					</span>
				) : (
					<span
						className={cn(nameCls, "text-muted-foreground/60 italic")}
					>
						—
					</span>
				)}
			</div>
		</div>
	);
}
