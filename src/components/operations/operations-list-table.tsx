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
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <OperationsListTable /> — Vercel deployments-list DNA.
 *
 * Each row is a single <Link> with a grid layout. The whole row is the
 * click target (middle-click opens new tab natively). Vertical rhythm:
 * date+time aligned to top, chips aligned to baseline, status right.
 * No nested click handlers, no standalone chevron button.
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

const CHANNEL_TONE: Record<string, string> = {
	direct:
		"border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	vendor:
		"border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	relasi:
		"border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

const BACKDROP_TONE: Record<string, string> = {
	merah: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
	gold: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	putih:
		"border-zinc-300/40 bg-zinc-100 text-zinc-700 dark:bg-zinc-500/10 dark:text-zinc-300",
	silver:
		"border-slate-400/25 bg-slate-400/10 text-slate-700 dark:text-slate-300",
	custom:
		"border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

const COLS_DESKTOP =
	"grid-cols-[minmax(15rem,1.5fr)_minmax(8.5rem,0.9fr)_minmax(13rem,1.3fr)_minmax(8rem,0.9fr)_minmax(7.5rem,auto)]";

function formatTime(t: string | null): string {
	return t ? t.slice(0, 5) : "—";
}

function formatDayDate(iso: string): string {
	const day = new Date(iso).toLocaleDateString("id-ID", { weekday: "short" });
	return `${day}, ${formatDateID(iso)}`;
}

export function OperationsListTable({
	events,
	crewByEventEntries,
	crewFilter,
}: Props) {
	const crewByEvent = new Map(crewByEventEntries);
	const highlightUserId = crewFilter || undefined;

	return (
		<div className="overflow-hidden rounded-xl border border-border-default bg-card">
			{/* Desktop list-rows */}
			<div className="hidden md:block">
				<div
					className={cn(
						"grid items-center gap-4 border-b border-border-subtle bg-surface-3/40 px-5 py-2.5",
						COLS_DESKTOP,
					)}
				>
					<span className="eyebrow !text-[10px]">Project</span>
					<span className="eyebrow !text-[10px]">Jadwal</span>
					<span className="eyebrow !text-[10px]">Spesifikasi</span>
					<span className="eyebrow !text-[10px]">Crew</span>
					<span className="eyebrow !text-[10px] text-right">Status</span>
				</div>

				<div className="divide-y divide-border-subtle">
					{events.map((ev) => {
						const crew = crewByEvent.get(ev.id) ?? [];
						const spec = [
							ev.frame_size,
							ev.package_duration_hours
								? `${ev.package_duration_hours}j`
								: null,
						]
							.filter(Boolean)
							.join(" · ");

						return (
							<Link
								key={ev.id}
								href={`/operations/${ev.project_id}`}
								style={{
									viewTransitionName: `event-${ev.project_id}`,
								}}
								className={cn(
									"group grid items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-3/60",
									COLS_DESKTOP,
								)}
							>
								{/* Project & Klien */}
								<div className="flex min-w-0 flex-col gap-1.5">
									<div className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
										{ev.client_name}
									</div>
									<div className="flex flex-wrap items-center gap-1.5">
										<span className="tabular inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
											{ev.project_id}
											{ev.is_migrated_legacy && (
												<Archive
													className="size-2.5 text-amber-600 dark:text-amber-400"
													aria-label="Migrated"
												/>
											)}
											{!ev.is_migrated_legacy &&
												ev.legacy_invoice_number && (
													<Inbox
														className="size-2.5"
														aria-label={`Imported (${ev.legacy_invoice_number})`}
													/>
												)}
										</span>
										<ChannelChip channel={ev.channel} />
										{(ev.remaining_balance ?? 0) > 0 && (
											<SisaChip
												value={ev.remaining_balance ?? 0}
											/>
										)}
									</div>
								</div>

								{/* Jadwal */}
								<div className="flex flex-col gap-1 tabular">
									<div className="text-sm font-medium text-foreground">
										{formatDayDate(ev.event_date)}
									</div>
									{(ev.setup_time || ev.start_time) && (
										<div className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
											<Clock
												className="size-3 shrink-0"
												aria-hidden
											/>
											{ev.setup_time && (
												<span>
													<span className="text-muted-foreground/70">
														setup
													</span>{" "}
													{formatTime(ev.setup_time)}
												</span>
											)}
											{ev.start_time && (
												<>
													{ev.setup_time && (
														<span className="text-muted-foreground/40">
															·
														</span>
													)}
													<span className="text-foreground/85">
														{formatTime(ev.start_time)}
														{ev.end_time &&
															` – ${formatTime(ev.end_time)}`}
													</span>
												</>
											)}
										</div>
									)}
								</div>

								{/* Spesifikasi */}
								<div className="flex min-w-0 flex-col gap-1.5">
									<div className="flex flex-wrap items-center gap-1.5">
										{spec && (
											<span className="text-sm font-medium text-foreground">
												{spec}
											</span>
										)}
										{ev.include_flashdisk_pouch && (
											<span
												className="inline-flex h-[18px] items-center gap-0.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
												title="Include flashdisk pouch"
											>
												<HardDrive className="size-2.5" />
												FD
											</span>
										)}
										{ev.package_name && (
											<span
												className={cn(
													"inline-flex h-[18px] items-center rounded px-1.5 text-[10px] font-medium uppercase tracking-wide",
													ev.backdrop_color
														? (BACKDROP_TONE[ev.backdrop_color] ?? "")
														: "border border-primary/30 bg-primary/10 text-primary",
												)}
											>
												{ev.package_name}
												{ev.backdrop_color &&
													ev.backdrop_color !== "custom" &&
													` · ${ev.backdrop_color}`}
											</span>
										)}
									</div>
									<div className="inline-flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
										<MapPin
											className="size-3 shrink-0"
											aria-hidden
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
								<div className="flex flex-col items-end gap-1">
									<EventStatusBadge status={ev.status} />
									<PaymentStatusBadge status={ev.payment_status} />
								</div>
							</Link>
						);
					})}
				</div>
			</div>

			{/* Mobile cards */}
			<div className="space-y-2.5 p-3 md:hidden">
				{events.map((ev) => {
					const crew = crewByEvent.get(ev.id) ?? [];
					return (
						<Link
							key={ev.id}
							href={`/operations/${ev.project_id}`}
							style={{
								viewTransitionName: `event-${ev.project_id}`,
							}}
							className="block rounded-lg border border-border-default bg-card p-3.5 transition-colors active:bg-surface-3"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-semibold text-foreground">
										{ev.client_name}
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-1.5">
										<span className="tabular font-mono text-[10.5px] text-muted-foreground">
											{ev.project_id}
										</span>
										<ChannelChip channel={ev.channel} />
										{(ev.remaining_balance ?? 0) > 0 && (
											<SisaChip
												value={ev.remaining_balance ?? 0}
											/>
										)}
									</div>
								</div>
								<div className="flex flex-col items-end gap-1">
									<EventStatusBadge status={ev.status} />
									<PaymentStatusBadge status={ev.payment_status} />
								</div>
							</div>
							<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 tabular text-[12px]">
								<div className="text-muted-foreground">
									<span className="eyebrow !text-[9px] block">
										Jadwal
									</span>
									<span className="text-foreground">
										{formatDayDate(ev.event_date)}
									</span>
									{ev.start_time && (
										<span className="block text-[11px] text-muted-foreground">
											{formatTime(ev.start_time)}
											{ev.end_time &&
												` – ${formatTime(ev.end_time)}`}
										</span>
									)}
								</div>
								<div className="min-w-0 text-muted-foreground">
									<span className="eyebrow !text-[9px] block">
										Crew
									</span>
									<CrewLine
										crew={crew}
										highlightUserId={highlightUserId}
										compact
									/>
								</div>
							</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
}

function ChannelChip({ channel }: { channel: string }) {
	return (
		<span
			className={cn(
				"inline-flex h-[18px] items-center rounded border px-1.5 text-[10px] font-medium uppercase tracking-wider",
				CHANNEL_TONE[channel] ?? "",
			)}
		>
			{CHANNEL_TYPE_LABELS[channel] ?? channel}
		</span>
	);
}

function SisaChip({ value }: { value: number }) {
	return (
		<span
			className="tabular inline-flex h-[18px] items-center gap-0.5 rounded border border-rose-500/25 bg-rose-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wider text-rose-700 dark:text-rose-300"
			title={`Sisa ${formatRupiah(value)}`}
		>
			<Wallet className="size-2.5" />
			Sisa
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
	if (crew.length === 0) {
		return (
			<span className="text-[12px] italic text-muted-foreground/60">—</span>
		);
	}
	const lead = crew.find((c) => c.role_in_event === "lead");
	const others = crew.filter((c) => c.role_in_event !== "lead");

	const leadName = lead?.nickname ?? lead?.full_name ?? null;
	const asistenName = others[0]?.nickname ?? others[0]?.full_name ?? null;
	const extra = others.length > 1 ? others.length - 1 : 0;
	const isHighlight = (uid?: string) => highlightUserId === uid;

	const nameCls = compact ? "text-[12px]" : "text-sm";
	const subCls = compact ? "text-[11px]" : "text-[12.5px]";

	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			{leadName && (
				<div className="flex min-w-0 items-center gap-1.5">
					<span
						className="size-1.5 shrink-0 rounded-full bg-emerald-500"
						aria-hidden
						title="Lead"
					/>
					<span
						className={cn(
							"truncate leading-snug",
							nameCls,
							isHighlight(lead?.user_id)
								? "font-semibold text-foreground"
								: "text-foreground/90",
						)}
						title={lead?.full_name}
					>
						{leadName}
					</span>
				</div>
			)}
			{(asistenName || !leadName) && (
				<div className="flex min-w-0 items-center gap-1.5">
					<span
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							asistenName ? "bg-sky-500/80" : "bg-muted-foreground/30",
						)}
						aria-hidden
						title="Asisten"
					/>
					<span
						className={cn(
							"truncate leading-snug",
							subCls,
							asistenName
								? isHighlight(others[0]?.user_id)
									? "font-semibold text-foreground"
									: "text-muted-foreground"
								: "text-muted-foreground/60",
						)}
						title={others[0]?.full_name}
					>
						{asistenName ?? "—"}
						{extra > 0 && (
							<span className="text-muted-foreground/60">
								{" "}
								+{extra}
							</span>
						)}
					</span>
				</div>
			)}
		</div>
	);
}
