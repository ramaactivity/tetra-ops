"use client";

import { Archive, Clock, Frame, Inbox, MapPin, Wallet } from "lucide-react";
import Link from "next/link";
import {
	EventStatusDot,
	PaymentStatusDot,
} from "@/components/badges/status-badge";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <OperationsListTable /> — operations list, Vercel deployments lineage.
 *
 * Row anatomy (per user direction — pass 8):
 *   PROJECT     → client name (14/600) + channel tag (11/mono)
 *   JADWAL      → date (13/500) + time range only (12/muted) — NO setup
 *   SPESIFIKASI → package · backdrop (13/500) + venue (12/muted) — NO city
 *   CREW        → Lead / Asst with first-word names only
 *   STATUS      → event dot + payment dot · sisa
 *
 * Typography is locked to 14 / 13 / 12 / 11-mono only. No half-sizes.
 * Crew column is intentionally narrow so the saved width flows to status.
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

const CHANNEL_DOT: Record<string, string> = {
	direct: "bg-[#0070f3]",
	vendor: "bg-amber-500",
	relasi: "bg-violet-500",
};

/* Crew + status column rebalance — crew column is intentionally tight
   (short nicknames only); status column takes the freed flex so payment
   + sisa breathe on one line instead of getting pushed against the wall. */
const COLS_DESKTOP =
	"grid-cols-[minmax(11rem,1.15fr)_minmax(8.5rem,0.85fr)_minmax(14rem,1.5fr)_minmax(6rem,0.55fr)_minmax(10.5rem,1fr)]";

function formatTime(t: string | null): string {
	return t ? t.slice(0, 5) : "—";
}

function formatDayDate(iso: string): string {
	const day = new Date(iso).toLocaleDateString("id-ID", { weekday: "short" });
	return `${day}, ${formatDateID(iso)}`;
}

/** Compact rupiah for outstanding balance pills. 8.450.000 → 8,4jt. */
function formatRupiahCompact(value: number): string {
	if (value >= 1_000_000_000) {
		return `Rp ${(value / 1_000_000_000).toFixed(1).replace(".", ",")}M`;
	}
	if (value >= 1_000_000) {
		return `Rp ${(value / 1_000_000).toFixed(1).replace(".", ",")}jt`;
	}
	if (value >= 1_000) {
		return `Rp ${(value / 1_000).toFixed(0)}rb`;
	}
	return formatRupiah(value);
}

function prettyChannel(channel: string): string {
	return CHANNEL_TYPE_LABELS[channel] ?? channel;
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

/** "Padma Ananda Saputra" → "Padma". Nicknames stay as-is. */
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

/** Backdrop label prefers the FK'd name; falls back to legacy color enum. */
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
			{/* Desktop list-rows */}
			<div className="hidden md:block">
				<div
					className={cn(
						"grid items-center gap-4 border-b border-border-default bg-secondary px-5 py-2.5",
						COLS_DESKTOP,
					)}
				>
					<span className="eyebrow">Project</span>
					<span className="eyebrow">Jadwal</span>
					<span className="eyebrow">Spesifikasi</span>
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
									"group grid items-start gap-4 border-b border-border-subtle px-5 py-3.5 transition-colors last:border-b-0 hover:bg-secondary/60",
									COLS_DESKTOP,
								)}
							>
								{/* PROJECT */}
								<div className="flex min-w-0 flex-col gap-1">
									<div className="flex min-w-0 items-center gap-1.5">
										<span className="truncate text-[14px] font-semibold leading-snug text-foreground">
											{ev.client_name}
										</span>
										{ev.is_migrated_legacy && (
											<Archive
												className="size-3 shrink-0 text-amber-600 dark:text-amber-500"
												aria-label="Migrated"
												strokeWidth={2}
											/>
										)}
										{!ev.is_migrated_legacy &&
											ev.legacy_invoice_number && (
												<Inbox
													className="size-3 shrink-0 text-muted-foreground"
													aria-label={`Imported (${ev.legacy_invoice_number})`}
													strokeWidth={2}
												/>
											)}
									</div>
									<ChannelTag channel={ev.channel} />
								</div>

								{/* JADWAL */}
								<div className="flex flex-col gap-1 tabular leading-snug">
									<div className="text-[13px] font-medium text-foreground">
										{formatDayDate(ev.event_date)}
									</div>
									<TimeLine
										startTime={ev.start_time}
										endTime={ev.end_time}
									/>
								</div>

								{/* SPESIFIKASI */}
								<div className="flex min-w-0 flex-col gap-1 leading-snug">
									<SpecLine
										pkg={pkg}
										backdrop={bd}
										fd={ev.include_flashdisk_pouch}
									/>
									<VenueLine venue={ev.venue_name} />
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
										className="!text-[13px]"
									/>
									<div className="flex items-center gap-1.5">
										<PaymentStatusDot
											status={ev.payment_status}
											className="!text-[12px]"
										/>
										{sisa > 0 && (
											<>
												<span
													className="text-muted-foreground/40"
													aria-hidden
												>
													·
												</span>
												<span
													className="tabular inline-flex items-center gap-0.5 text-[12px] font-medium text-rose-600 dark:text-rose-400"
													title={`Sisa ${formatRupiah(sisa)}`}
												>
													<Wallet
														className="size-2.5"
														aria-hidden
														strokeWidth={2.5}
													/>
													{formatRupiahCompact(sisa)}
												</span>
											</>
										)}
									</div>
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
								<div className="min-w-0 flex-1 space-y-1">
									<div className="truncate text-[14px] font-semibold leading-snug text-foreground">
										{ev.client_name}
									</div>
									<ChannelTag channel={ev.channel} />
								</div>
								<EventStatusDot
									status={ev.status}
									className="!text-[13px]"
								/>
							</div>
							<div className="grid grid-cols-2 gap-x-3 gap-y-2.5 tabular leading-snug">
								<div>
									<span className="eyebrow block !text-[9.5px]">
										Jadwal
									</span>
									<div className="mt-0.5 text-[13px] text-foreground">
										{formatDayDate(ev.event_date)}
									</div>
									<TimeLine
										startTime={ev.start_time}
										endTime={ev.end_time}
										className="mt-0.5"
									/>
								</div>
								<div className="min-w-0">
									<span className="eyebrow block !text-[9.5px]">
										Crew
									</span>
									<div className="mt-0.5">
										<CrewLine
											crew={crew}
											highlightUserId={crewFilter || undefined}
											compact
										/>
									</div>
								</div>
								<div className="col-span-2 border-t border-border-subtle pt-2 space-y-1">
									<SpecLine
										pkg={pkg}
										backdrop={bd}
										fd={ev.include_flashdisk_pouch}
									/>
									<VenueLine venue={ev.venue_name} />
								</div>
								<div className="col-span-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
									<PaymentStatusDot
										status={ev.payment_status}
										className="!text-[12px]"
									/>
									{sisa > 0 && (
										<span
											className="tabular inline-flex items-center gap-1 text-[12px] font-medium text-rose-600 dark:text-rose-400"
											title={`Sisa ${formatRupiah(sisa)}`}
										>
											<Wallet
												className="size-3"
												aria-hidden
												strokeWidth={2.5}
											/>
											Sisa {formatRupiahCompact(sisa)}
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

function ChannelTag({ channel }: { channel: string }) {
	const dot = CHANNEL_DOT[channel] ?? "bg-muted-foreground/50";
	return (
		<span
			className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium uppercase tracking-wide text-muted-foreground"
			title={`Channel: ${prettyChannel(channel)}`}
		>
			<span
				className={cn("inline-block size-1.5 shrink-0 rounded-full", dot)}
				aria-hidden
			/>
			{prettyChannel(channel)}
		</span>
	);
}

function TimeLine({
	startTime,
	endTime,
	className,
}: {
	startTime: string | null;
	endTime: string | null;
	className?: string;
}) {
	if (!startTime) return null;
	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 text-[12px] text-muted-foreground",
				className,
			)}
		>
			<Clock
				className="size-3 shrink-0 text-muted-foreground/70"
				aria-hidden
				strokeWidth={2}
			/>
			<span className="text-foreground/85">
				{formatTime(startTime)}
				{endTime && ` – ${formatTime(endTime)}`}
			</span>
		</div>
	);
}

function SpecLine({
	pkg,
	backdrop,
	fd,
}: {
	pkg: string;
	backdrop: string | null;
	fd: boolean | null;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
			<span className="truncate text-[13px] font-medium text-foreground">
				{pkg}
			</span>
			{fd && (
				<span
					className="inline-flex items-center gap-0.5 text-[10.5px] font-mono font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
					title="Include flashdisk pouch"
				>
					FD
				</span>
			)}
			{backdrop && (
				<>
					<span
						className="text-muted-foreground/40"
						aria-hidden
					>
						·
					</span>
					<span className="inline-flex min-w-0 items-center gap-1 truncate text-[12px] text-muted-foreground">
						<Frame
							className="size-3 shrink-0 text-muted-foreground/70"
							aria-hidden
							strokeWidth={2}
						/>
						<span className="truncate">{backdrop}</span>
					</span>
				</>
			)}
		</div>
	);
}

function VenueLine({ venue }: { venue: string }) {
	return (
		<div className="inline-flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
			<MapPin
				className="size-3 shrink-0 text-muted-foreground/70"
				aria-hidden
				strokeWidth={2}
			/>
			<span className="truncate">{venue}</span>
		</div>
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
		<div className="flex flex-col gap-1 leading-snug">
			<div className="flex items-center gap-2 min-w-0">
				<span className={labelCls}>Lead</span>
				{leadDisplay ? (
					<span
						className={cn(
							"truncate",
							nameCls,
							isHighlight(lead?.user_id)
								? "font-semibold text-foreground"
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
