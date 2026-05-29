import {
	CalendarDays,
	CalculatorIcon,
	ClipboardList,
	Clock,
	ExternalLink,
	Frame,
	HardDrive,
	MapPin,
	Package,
	Package2,
	Receipt,
	Tag,
	Users,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { buttonVariants } from "@/components/ui/button";
import { CHANNEL_TYPE_LABELS, formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <ProjectHeroRecap /> — single-glance event recap at the top of the
 * project detail page. Three columns on desktop:
 *
 *   1. Event Info     — date, time, venue, package, backdrop, category
 *   2. Crew incharge  — list of assigned crew with role + fee
 *   3. Financial      — grand total, paid, outstanding, P&L if settled
 *
 * Header strip carries quick-action links (Manage payments, Manage crew,
 * Equipment, Rekap). Footer rendered only when there's a decisive action
 * available (Settle Event when status is in_progress / awaiting_settlement).
 */

type SettlementSummary = {
	revenue_net: number;
	hpp_total: number;
	opex_total: number;
	net_profit: number;
	margin_percentage: number;
	is_loss: boolean;
} | null;

type CrewEntry = {
	name: string;
	role: string;
	tier: string | null;
	fee: number;
};

interface ProjectHeroRecapProps {
	projectId: string;
	clientName: string;
	channel: string;
	eventCategory: string | null;
	eventCategoryLabel: string | null;
	eventDate: string;
	startTime: string | null;
	endTime: string | null;
	venueName: string;
	venueCity: string | null;
	venueAddress: string | null;
	packageName: string | null;
	packageDurationHours: number | null;
	frameSize: string | null;
	backdropName: string | null;
	includeFlashdiskPouch: boolean | null;
	crewAssignments: CrewEntry[];
	grandTotal: number;
	totalPaid: number;
	remainingBalance: number;
	settlement: SettlementSummary;
	canSettle: boolean;
	equipmentCount: number;
	rekapSubmitted: boolean;
	driveFolderUrl: string | null;
}

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

function formatTime(t: string | null): string {
	return t ? t.slice(0, 5) : "—";
}

function formatDayDate(iso: string): string {
	const day = new Date(iso).toLocaleDateString("id-ID", { weekday: "long" });
	return `${day}, ${formatDateID(iso)}`;
}

export function ProjectHeroRecap(props: ProjectHeroRecapProps) {
	const {
		projectId,
		eventDate,
		startTime,
		endTime,
		venueName,
		venueCity,
		venueAddress,
		packageName,
		packageDurationHours,
		frameSize,
		backdropName,
		includeFlashdiskPouch,
		channel,
		eventCategoryLabel,
		crewAssignments,
		grandTotal,
		totalPaid,
		remainingBalance,
		settlement,
		canSettle,
		equipmentCount,
		rekapSubmitted,
		driveFolderUrl,
	} = props;

	const paidPct =
		grandTotal > 0 ? Math.min(100, Math.round((totalPaid / grandTotal) * 100)) : 0;
	const packageDisplay = [
		packageName,
		packageDurationHours ? `${packageDurationHours} jam` : null,
		frameSize,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="overflow-hidden rounded-lg border border-border-default bg-card">
			{/* HEADER STRIP — quick actions */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
				<div className="min-w-0">
					<h2 className="text-[14px] font-semibold leading-snug text-foreground">
						Recap Event
					</h2>
					<p className="text-[12px] leading-snug text-muted-foreground">
						Ringkasan informasi, crew, dan financial event ini.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<Link
						href={`/operations/${projectId}/payments`}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<Receipt className="size-3.5" aria-hidden strokeWidth={2} />
						Payments
					</Link>
					<Link
						href={`/operations/${projectId}/crew`}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<Users className="size-3.5" aria-hidden strokeWidth={2} />
						Crew
					</Link>
					<Link
						href={`/operations/${projectId}/equipment`}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<Package className="size-3.5" aria-hidden strokeWidth={2} />
						Equipment
						{equipmentCount > 0 && (
							<span className="tabular rounded-full bg-secondary px-1.5 text-[10.5px] font-bold">
								{equipmentCount}
							</span>
						)}
					</Link>
					<Link
						href={`/operations/${projectId}/rekap`}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<ClipboardList
							className="size-3.5"
							aria-hidden
							strokeWidth={2}
						/>
						Rekap
						{rekapSubmitted && (
							<span className="tabular rounded-full bg-emerald-500/15 px-1.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">
								✓
							</span>
						)}
					</Link>
				</div>
			</div>

			{/* 3-COLUMN BODY */}
			<div className="grid grid-cols-1 divide-border-subtle md:grid-cols-3 md:divide-x">
				{/* Event Info */}
				<div className="space-y-3 px-5 py-4">
					<span className="eyebrow block">Event Info</span>
					<div className="space-y-2">
						<RecapLine icon={CalendarDays} primary={formatDayDate(eventDate)} strong />
						{startTime && (
							<RecapLine
								icon={Clock}
								primary={`${formatTime(startTime)}${
									endTime ? ` – ${formatTime(endTime)}` : ""
								}`}
							/>
						)}
						<RecapLine
							icon={MapPin}
							primary={venueName}
							secondary={
								[venueCity, venueAddress].filter(Boolean).join(" · ") || null
							}
						/>
						<RecapLine
							icon={Package2}
							primary={packageDisplay || "—"}
						/>
						<RecapLine
							icon={Frame}
							primary={backdropName ?? "Belum ditentukan"}
							muted={!backdropName}
						/>
						<RecapLine
							icon={HardDrive}
							primary={
								includeFlashdiskPouch
									? "Flashdisk Pouch"
									: "Tanpa Flashdisk"
							}
							accent={includeFlashdiskPouch ? "emerald" : undefined}
							muted={!includeFlashdiskPouch}
						/>
						{eventCategoryLabel && (
							<RecapLine icon={Tag} primary={eventCategoryLabel} />
						)}
						<RecapLine
							icon={Tag}
							primary={CHANNEL_TYPE_LABELS[channel] ?? channel}
							secondary="Sales Channel"
							muted
						/>
					</div>
				</div>

				{/* Crew incharge */}
				<div className="space-y-3 px-5 py-4">
					<div className="flex items-center justify-between">
						<span className="eyebrow">Crew Incharge</span>
						<Link
							href={`/operations/${projectId}/crew`}
							className="text-[11.5px] font-medium text-[#0070f3] hover:underline"
						>
							Manage →
						</Link>
					</div>
					{crewAssignments.length === 0 ? (
						<div className="rounded-md border border-dashed border-border-default p-4 text-center">
							<Users
								className="mx-auto size-4 text-muted-foreground/60"
								aria-hidden
							/>
							<p className="mt-1.5 text-[12px] text-muted-foreground">
								Belum ada crew di-assign
							</p>
						</div>
					) : (
						<ul className="space-y-2">
							{crewAssignments.map((c, i) => (
								<li
									key={`${c.name}-${i}`}
									className="flex items-baseline justify-between gap-3"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[13px] font-semibold text-foreground">
											{c.name}
										</div>
										<div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
											<span className="eyebrow !text-[9.5px]">
												{ROLE_LABELS[c.role] ?? c.role}
											</span>
											{c.tier && (
												<>
													<span
														className="text-muted-foreground/40"
														aria-hidden
													>
														·
													</span>
													<span className="capitalize">{c.tier}</span>
												</>
											)}
										</div>
									</div>
									<span className="tabular shrink-0 text-[12.5px] text-muted-foreground">
										{formatRupiah(c.fee)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>

				{/* Financial */}
				<div className="space-y-3 px-5 py-4">
					<div className="flex items-center justify-between">
						<span className="eyebrow">Financial</span>
						<Link
							href={`/operations/${projectId}/payments`}
							className="text-[11.5px] font-medium text-[#0070f3] hover:underline"
						>
							Manage →
						</Link>
					</div>
					<div className="space-y-2">
						<MoneyLine
							label="Grand Total"
							value={grandTotal}
							strong
						/>
						<MoneyLine label="Total Paid" value={totalPaid} />
						<MoneyLine
							label="Outstanding"
							value={remainingBalance}
							tone={remainingBalance > 0 ? "negative" : "default"}
						/>
						{grandTotal > 0 && (
							<div className="space-y-1.5 pt-1.5">
								<div className="flex items-baseline justify-between text-[11.5px] text-muted-foreground">
									<span>Progress pembayaran</span>
									<span className="tabular font-medium">{paidPct}%</span>
								</div>
								<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
									<div
										className={cn(
											"h-full rounded-full transition-all",
											paidPct >= 100
												? "bg-emerald-500"
												: paidPct >= 50
													? "bg-[#0070f3]"
													: "bg-amber-500",
										)}
										style={{ width: `${paidPct}%` }}
									/>
								</div>
							</div>
						)}
					</div>

					{settlement && (
						<div className="space-y-2 border-t border-border-subtle pt-3">
							<div className="flex items-baseline justify-between">
								<span className="eyebrow">P&L</span>
								<span
									className={cn(
										"tabular text-[11.5px] font-semibold",
										settlement.is_loss
											? "text-rose-600 dark:text-rose-400"
											: "text-emerald-700 dark:text-emerald-400",
									)}
								>
									{settlement.is_loss ? "RUGI" : "PROFIT"}
									{" · "}
									{settlement.margin_percentage}%
								</span>
							</div>
							<MoneyLine
								label="Revenue Net"
								value={settlement.revenue_net}
							/>
							<MoneyLine
								label="HPP"
								value={-settlement.hpp_total}
								tone="negative"
							/>
							<MoneyLine
								label="OpEx"
								value={-settlement.opex_total}
								tone="negative"
							/>
							<MoneyLine
								label="Net Profit"
								value={settlement.net_profit}
								tone={settlement.is_loss ? "negative" : "positive"}
								strong
							/>
						</div>
					)}
				</div>
			</div>

			{/* FOOTER — decisive action */}
			{(canSettle || driveFolderUrl) && (
				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-secondary/40 px-5 py-3.5">
					<div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
						{driveFolderUrl && (
							<a
								href={driveFolderUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-[#0070f3] hover:underline"
							>
								<ExternalLink className="size-3" aria-hidden />
								Drive folder
							</a>
						)}
					</div>
					{canSettle && (
						<Link
							href={`/operations/${projectId}/rekap`}
							className={buttonVariants({ variant: "default", size: "lg" })}
						>
							<CalculatorIcon className="size-4" aria-hidden strokeWidth={2} />
							Settle Event
						</Link>
					)}
				</div>
			)}
		</div>
	);
}

type IconCmp = React.ComponentType<{
	className?: string;
	"aria-hidden"?: boolean;
	strokeWidth?: number;
}>;

function RecapLine({
	icon: Icon,
	primary,
	secondary,
	muted = false,
	accent,
	strong = false,
}: {
	icon: IconCmp;
	primary: string;
	secondary?: string | null;
	muted?: boolean;
	accent?: "emerald";
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
		<div className="flex min-w-0 items-start gap-2 leading-snug">
			<Icon
				className={cn("mt-0.5 size-3.5 shrink-0", iconTint)}
				aria-hidden
				strokeWidth={strong ? 2.2 : 2}
			/>
			<div className="min-w-0 flex-1">
				<div
					className={cn(
						"truncate",
						strong ? "text-[13px] font-semibold" : "text-[12.5px]",
						tint,
					)}
				>
					{primary}
				</div>
				{secondary ? (
					<div className="truncate text-[11.5px] text-muted-foreground">
						{secondary}
					</div>
				) : null}
			</div>
		</div>
	);
}

function MoneyLine({
	label,
	value,
	tone = "default",
	strong = false,
}: {
	label: string;
	value: number;
	tone?: "default" | "positive" | "negative";
	strong?: boolean;
}) {
	const toneCls =
		tone === "positive"
			? "text-emerald-700 dark:text-emerald-400"
			: tone === "negative"
				? "text-rose-600 dark:text-rose-400"
				: "text-foreground";
	const sign = value < 0 ? "−" : "";
	const absRupiah = formatRupiah(Math.abs(value));
	return (
		<div className="flex items-baseline justify-between gap-3 leading-snug">
			<span
				className={cn(
					"text-[12px] text-muted-foreground",
					strong && "font-medium",
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"tabular shrink-0",
					strong ? "text-[13.5px] font-semibold" : "text-[12.5px]",
					toneCls,
				)}
			>
				{sign}
				{absRupiah}
			</span>
		</div>
	);
}

export type { CrewEntry as ProjectHeroRecapCrew };
