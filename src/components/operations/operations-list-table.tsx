"use client";

import {
	Archive,
	Clock,
	HardDrive,
	Inbox,
	MapPin,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import {
	EventStatusDot,
	PaymentStatusDot,
} from "@/components/badges/status-badge";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <OperationsListTable /> — Vercel data-table row redesigned for scan.
 *
 * Each cell answers ONE question:
 *   PROJECT     → Who is this for + which project ID?
 *   JADWAL      → When?
 *   SPESIFIKASI → What package + where?
 *   CREW        → Who's running it (Lead + Asisten)?
 *   STATUS      → Where in the workflow + any outstanding action?
 *
 * Each cell has one primary fact (14px font-medium foreground) + one
 * supporting fact (12px muted). Channel + backdrop chips have been
 * absorbed into plain text with a · separator to kill visual chip noise.
 * Outstanding (Sisa) moves from the project column to the status column
 * so action-required info sits next to the workflow indicator.
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

const COLS_DESKTOP =
	"grid-cols-[minmax(15rem,1.5fr)_minmax(9rem,0.9fr)_minmax(14rem,1.4fr)_minmax(9rem,0.9fr)_minmax(9.5rem,auto)]";

function formatTime(t: string | null): string {
	return t ? t.slice(0, 5) : "—";
}

function formatDayDate(iso: string): string {
	const day = new Date(iso).toLocaleDateString("id-ID", { weekday: "short" });
	return `${day}, ${formatDateID(iso)}`;
}

/** Compact rupiah for outstanding balance pills. Rp 8.450.000 → Rp 8,45jt. */
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

function prettyBackdrop(c: string): string {
	return c.charAt(0).toUpperCase() + c.slice(1);
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
						const packageLabel = formatPackageLabel(ev);

						return (
							<Link
								key={ev.id}
								href={`/operations/${ev.project_id}`}
								style={{
									viewTransitionName: `event-${ev.project_id}`,
								}}
								className={cn(
									"group grid items-start gap-4 border-b border-border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-secondary/60",
									COLS_DESKTOP,
								)}
							>
								{/* Project & Klien */}
								<div className="flex min-w-0 flex-col gap-1">
									<div className="flex items-center gap-1.5 min-w-0">
										<span className="truncate text-[14px] font-semibold leading-tight text-foreground">
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
									<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight">
										<span className="tabular font-mono text-[11px] text-muted-foreground">
											{ev.project_id}
										</span>
										<span
											className="text-muted-foreground/40"
											aria-hidden
										>
											·
										</span>
										<ChannelTag channel={ev.channel} />
									</div>
								</div>

								{/* Jadwal */}
								<div className="flex flex-col gap-1 tabular leading-tight">
									<div className="text-[13px] font-medium text-foreground">
										{formatDayDate(ev.event_date)}
									</div>
									<TimeLine
										setupTime={ev.setup_time}
										startTime={ev.start_time}
										endTime={ev.end_time}
									/>
								</div>

								{/* Spesifikasi */}
								<div className="flex min-w-0 flex-col gap-1 leading-tight">
									<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
										<span className="text-[13px] font-medium text-foreground">
											{packageLabel}
										</span>
										{ev.include_flashdisk_pouch && (
											<span
												className="inline-flex items-center gap-0.5 text-[10.5px] font-mono font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
												title="Include flashdisk pouch"
											>
												<HardDrive className="size-2.5" />
												FD
											</span>
										)}
									</div>
									<div className="inline-flex items-center gap-1 truncate text-[12px] text-muted-foreground">
										<MapPin
											className="size-3 shrink-0"
											aria-hidden
											strokeWidth={2}
										/>
										<span className="truncate">
											{ev.venue_name}
											{ev.venue_city && (
												<span className="text-muted-foreground/60">
													{" · "}
													{ev.venue_city}
												</span>
											)}
										</span>
									</div>
								</div>

								{/* Crew */}
								<CrewLine
									crew={crew}
									highlightUserId={highlightUserId}
								/>

								{/* Status */}
								<div className="flex flex-col items-end gap-1 leading-tight">
									<EventStatusDot status={ev.status} />
									<div className="flex items-center gap-1.5">
										<PaymentStatusDot
											status={ev.payment_status}
											className="text-[12px]"
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

			{/* Mobile cards */}
			<div className="space-y-2 p-3 md:hidden">
				{events.map((ev) => {
					const crew = crewByEvent.get(ev.id) ?? [];
					const sisa = ev.remaining_balance ?? 0;
					const packageLabel = formatPackageLabel(ev);
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
								<div className="min-w-0 flex-1">
									<div className="truncate text-[14px] font-semibold leading-tight text-foreground">
										{ev.client_name}
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight">
										<span className="tabular font-mono text-[11px] text-muted-foreground">
											{ev.project_id}
										</span>
										<span
											className="text-muted-foreground/40"
											aria-hidden
										>
											·
										</span>
										<ChannelTag channel={ev.channel} />
									</div>
								</div>
								<EventStatusDot status={ev.status} />
							</div>
							<div className="grid grid-cols-2 gap-x-3 gap-y-2.5 tabular leading-tight">
								<div>
									<span className="eyebrow block !text-[9.5px]">
										Jadwal
									</span>
									<div className="mt-0.5 text-[13px] text-foreground">
										{formatDayDate(ev.event_date)}
									</div>
									<TimeLine
										setupTime={ev.setup_time}
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
								<div className="col-span-2 border-t border-border-subtle pt-2">
									<div className="flex items-center gap-1.5">
										<span className="text-[13px] font-medium text-foreground">
											{packageLabel}
										</span>
										{ev.include_flashdisk_pouch && (
											<span
												className="inline-flex items-center gap-0.5 text-[10.5px] font-mono font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
												title="Include flashdisk pouch"
											>
												<HardDrive className="size-2.5" />
												FD
											</span>
										)}
									</div>
									<div className="mt-0.5 inline-flex items-center gap-1 truncate text-[12px] text-muted-foreground">
										<MapPin
											className="size-3 shrink-0"
											aria-hidden
											strokeWidth={2}
										/>
										<span className="truncate">
											{ev.venue_name}
											{ev.venue_city && (
												<span className="text-muted-foreground/60">
													{" · "}
													{ev.venue_city}
												</span>
											)}
										</span>
									</div>
								</div>
								<div className="col-span-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
									<PaymentStatusDot
										status={ev.payment_status}
										className="text-[12px]"
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

function formatPackageLabel(ev: EventRow): string {
	const parts: string[] = [];
	if (ev.package_name) {
		// Title-case the package name (Vercel/Stripe pattern — never SHOUTING).
		parts.push(prettyPackageName(ev.package_name));
	} else if (ev.frame_size || ev.package_duration_hours) {
		const fallback = [
			ev.frame_size,
			ev.package_duration_hours ? `${ev.package_duration_hours} jam` : null,
		]
			.filter(Boolean)
			.join(" · ");
		if (fallback) parts.push(fallback);
	}
	if (ev.backdrop_color && ev.backdrop_color !== "custom") {
		parts.push(prettyBackdrop(ev.backdrop_color));
	}
	return parts.length > 0 ? parts.join(" · ") : "—";
}

function prettyPackageName(name: string): string {
	// "4R UNLIMITED 3 JAM" → "4R Unlimited 3 Jam"
	return name
		.toLowerCase()
		.split(/\s+/)
		.map((word) => {
			if (/^\d/.test(word)) return word.toUpperCase();
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(" ");
}

function ChannelTag({ channel }: { channel: string }) {
	const dot = CHANNEL_DOT[channel] ?? "bg-muted-foreground/50";
	return (
		<span
			className="inline-flex items-center gap-1 text-[11px] font-mono font-medium uppercase tracking-wide text-muted-foreground"
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
	setupTime,
	startTime,
	endTime,
	className,
}: {
	setupTime: string | null;
	startTime: string | null;
	endTime: string | null;
	className?: string;
}) {
	if (!startTime && !setupTime) {
		return null;
	}
	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 text-[12px] leading-tight text-muted-foreground",
				className,
			)}
		>
			<Clock
				className="size-3 shrink-0 text-muted-foreground/70"
				aria-hidden
				strokeWidth={2}
			/>
			{startTime ? (
				<span className="text-foreground/85">
					{formatTime(startTime)}
					{endTime && ` – ${formatTime(endTime)}`}
				</span>
			) : null}
			{setupTime && (
				<>
					{startTime && (
						<span className="text-muted-foreground/40" aria-hidden>
							·
						</span>
					)}
					<span>
						<span className="text-muted-foreground/70">setup</span>{" "}
						{formatTime(setupTime)}
					</span>
				</>
			)}
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
	if (crew.length === 0) {
		return (
			<div className="flex flex-col gap-1 leading-tight">
				<div className="flex items-center gap-2">
					<span className="eyebrow w-10 shrink-0 !text-[9.5px]">
						Lead
					</span>
					<span className="text-[12.5px] text-muted-foreground/60 italic">
						—
					</span>
				</div>
			</div>
		);
	}
	const lead = crew.find((c) => c.role_in_event === "lead");
	const others = crew.filter((c) => c.role_in_event !== "lead");

	const leadName = lead?.nickname ?? lead?.full_name ?? null;
	const asistenName = others[0]?.nickname ?? others[0]?.full_name ?? null;
	const extra = others.length > 1 ? others.length - 1 : 0;
	const isHighlight = (uid?: string) => highlightUserId === uid;

	const labelCls = compact
		? "eyebrow w-9 shrink-0 !text-[9px]"
		: "eyebrow w-10 shrink-0 !text-[9.5px]";
	const nameCls = compact ? "text-[12px]" : "text-[13px]";

	return (
		<div className="flex flex-col gap-1 leading-tight">
			<div className="flex items-center gap-2 min-w-0">
				<span className={labelCls}>Lead</span>
				{leadName ? (
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
						{leadName}
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
				{asistenName ? (
					<span
						className={cn(
							"truncate",
							nameCls,
							isHighlight(others[0]?.user_id)
								? "font-semibold text-foreground"
								: "text-muted-foreground",
						)}
						title={others[0]?.full_name}
					>
						{asistenName}
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
