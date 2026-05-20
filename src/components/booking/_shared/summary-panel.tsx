"use client";

import { CalendarDays, Clock, MapPin, User2, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type NavItem, SectionNav } from "./section-nav";

export interface AddonLine {
	name: string;
	qty: number;
	total: number;
}

/**
 * <SummaryPanel /> — sticky right rail showing live event summary +
 * pricing breakdown + section progress + save action. Desktop only
 * (≥lg); mobile falls back to the form's existing sticky bottom bar.
 *
 * All numbers update live via React state from the form root.
 */

export interface SummaryPanelProps {
	/** Event facts (omit blocks when not yet filled). */
	eventDate?: string; // formatted "24 Mei 2026"
	eventTimeRange?: string; // formatted "11:00–14:00"
	/** Mini-timeline (HH:MM each). Rendered when at least one is set. */
	eventTimeline?: {
		setup?: string;
		start?: string;
		end?: string;
	};
	venueName?: string;
	venueCity?: string;
	clientName?: string;
	picName?: string;
	picContact?: string;

	/** Pricing — always shown when basePrice > 0. */
	basePrice: number;
	addonsTotal: number;
	/** Per-addon breakdown (name + qty + total). Optional. */
	addonLines?: AddonLine[];
	backdropContribution: number;
	discount: number;
	grossUp: number;
	grandTotal: number;

	/** Vendor commission summary (only rendered when present). */
	vendor?: {
		mode: "commission" | "upfront_cut";
		valueType: "percent" | "flat";
		value: number; // % for commission+percent, rupiah otherwise
		amount: number; // computed rupiah Tetra pays vendor / vendor cut
	};

	/** Progress nav. */
	navItems: NavItem[];

	/** Save action. */
	pending: boolean;
	submitLabel: string;
	onCancel: () => void;
	className?: string;
}

export function SummaryPanel({
	eventDate,
	eventTimeRange,
	eventTimeline,
	venueName,
	venueCity,
	clientName,
	picName,
	picContact,
	basePrice,
	addonsTotal,
	addonLines,
	backdropContribution,
	discount,
	grossUp,
	grandTotal,
	vendor,
	navItems,
	pending,
	submitLabel,
	onCancel,
	className,
}: SummaryPanelProps) {
	const hasEvent = Boolean(eventDate || venueName);
	const hasClient = Boolean(clientName || picName);
	const hasPricing = basePrice > 0;
	const hasTimeline = Boolean(
		eventTimeline &&
			(eventTimeline.setup || eventTimeline.start || eventTimeline.end),
	);

	return (
		<aside
			data-slot="summary-panel"
			className={cn(
				"sticky top-4 flex flex-col gap-5 rounded-lg border border-border-default bg-card p-5",
				className,
			)}
		>
			{/* Event block */}
			{hasEvent ? (
				<div className="space-y-2">
					<p className="eyebrow flex items-center gap-1.5">
						<CalendarDays className="size-3" aria-hidden strokeWidth={2.25} />
						Event
					</p>
					{eventDate ? (
						<p className="tabular text-[13px] font-medium text-foreground">
							{eventDate}
							{!hasTimeline && eventTimeRange ? (
								<span className="text-muted-foreground"> · {eventTimeRange}</span>
							) : null}
						</p>
					) : null}
					{hasTimeline ? (
						<ol className="space-y-1 rounded-md border border-border-default/60 bg-secondary/40 p-2.5 text-[11.5px]">
							{eventTimeline?.setup ? (
								<TimelineRow
									icon={<Clock className="size-3" aria-hidden />}
									label="Setup"
									time={eventTimeline.setup}
								/>
							) : null}
							{eventTimeline?.start ? (
								<TimelineRow
									label="Mulai"
									time={eventTimeline.start}
									emphasis
								/>
							) : null}
							{eventTimeline?.end ? (
								<TimelineRow label="Selesai" time={eventTimeline.end} />
							) : null}
						</ol>
					) : null}
					{venueName ? (
						<p className="flex items-start gap-1 text-[12px] text-muted-foreground">
							<MapPin
								className="mt-[2px] size-3 shrink-0"
								aria-hidden
								strokeWidth={2}
							/>
							<span>
								{venueName}
								{venueCity ? <span> · {venueCity}</span> : null}
							</span>
						</p>
					) : null}
				</div>
			) : null}

			{/* Client block */}
			{hasClient ? (
				<div className="space-y-1.5">
					<p className="eyebrow flex items-center gap-1.5">
						<User2 className="size-3" aria-hidden strokeWidth={2.25} />
						Klien
					</p>
					{clientName ? (
						<p className="text-[13px] font-medium text-foreground">
							{clientName}
						</p>
					) : null}
					{picName ? (
						<p className="text-[12px] text-muted-foreground">
							PIC: {picName}
							{picContact ? (
								<span className="tabular"> · {picContact}</span>
							) : null}
						</p>
					) : null}
				</div>
			) : null}

			{/* Pricing block */}
			{hasPricing ? (
				<div className="space-y-2">
					<p className="eyebrow flex items-center gap-1.5">
						<Wallet className="size-3" aria-hidden strokeWidth={2.25} />
						Pricing
					</p>
					<dl className="space-y-1 text-[12.5px]">
						<Row label="Base price" value={basePrice} />
						{backdropContribution > 0 ? (
							<Row label="Backdrop" value={backdropContribution} />
						) : null}
						{addonsTotal > 0 ? (
							<>
								<Row label="Add-ons" value={addonsTotal} />
								{addonLines && addonLines.length > 0 ? (
									<div className="space-y-0.5 pl-2 text-[11.5px] text-muted-foreground">
										{addonLines.slice(0, 4).map((line) => (
											<div
												key={line.name}
												className="flex items-baseline justify-between gap-2"
											>
												<span className="truncate">
													{line.name}
													{line.qty > 1 ? ` × ${line.qty}` : ""}
												</span>
												<span className="tabular shrink-0">
													{formatRupiah(line.total)}
												</span>
											</div>
										))}
										{addonLines.length > 4 ? (
											<div className="italic text-muted-foreground/70">
												+ {addonLines.length - 4} item lainnya
											</div>
										) : null}
									</div>
								) : null}
							</>
						) : null}
						{discount > 0 ? (
							<Row label="Discount" value={-discount} muted />
						) : null}
						{grossUp > 0 ? <Row label="Gross-up PPh" value={grossUp} /> : null}
						<div className="flex items-baseline justify-between gap-3 border-t border-border-default pt-1.5">
							<dt className="text-[13px] font-medium text-foreground">
								Grand Total
							</dt>
							<dd className="tabular text-[14px] font-semibold text-foreground">
								{formatRupiah(grandTotal)}
							</dd>
						</div>
					</dl>
				</div>
			) : null}

			{/* Vendor block */}
			{vendor && vendor.value > 0 ? (
				<div className="space-y-1.5 rounded-md bg-secondary/60 p-3">
					<p className="eyebrow">Vendor</p>
					{vendor.mode === "upfront_cut" ? (
						<>
							<div className="flex items-baseline justify-between gap-3 text-[12.5px]">
								<dt className="text-muted-foreground">Potongan vendor</dt>
								<dd className="tabular font-medium text-rose-600 dark:text-rose-400">
									− {formatRupiah(vendor.amount)}
								</dd>
							</div>
							<div className="flex items-baseline justify-between gap-3 text-[12.5px]">
								<dt className="font-medium text-foreground">Tetra terima</dt>
								<dd className="tabular font-semibold text-emerald-600 dark:text-emerald-400">
									{formatRupiah(Math.max(0, grandTotal - vendor.amount))}
								</dd>
							</div>
						</>
					) : (
						<>
							<div className="flex items-baseline justify-between gap-3 text-[12.5px]">
								<dt className="text-muted-foreground">
									Komisi vendor
									{vendor.valueType === "percent" ? ` (${vendor.value}%)` : ""}
								</dt>
								<dd className="tabular font-medium text-foreground">
									{formatRupiah(vendor.amount)}
								</dd>
							</div>
							<p className="text-[10.5px] text-muted-foreground">
								Tetra bayar ke vendor setelah event.
							</p>
						</>
					)}
				</div>
			) : null}

			{/* Section progress nav */}
			{navItems.length > 0 ? <SectionNav items={navItems} /> : null}

			{/* Actions */}
			<div className="flex flex-col gap-2 border-t border-border-default pt-4">
				<button
					type="submit"
					form="booking-form"
					disabled={pending}
					className="press-down inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
				>
					{pending ? "Menyimpan…" : submitLabel}
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="inline-flex h-10 items-center justify-center rounded-md border border-border-default bg-card px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
				>
					Cancel
				</button>
			</div>
		</aside>
	);
}

function TimelineRow({
	icon,
	label,
	time,
	emphasis = false,
}: {
	icon?: ReactNode;
	label: string;
	time: string;
	emphasis?: boolean;
}) {
	return (
		<li className="flex items-center justify-between gap-2">
			<span className="flex items-center gap-1.5 text-muted-foreground">
				{icon}
				<span className={cn(emphasis && "font-medium text-foreground")}>
					{label}
				</span>
			</span>
			<span
				className={cn(
					"tabular",
					emphasis
						? "font-semibold text-foreground"
						: "font-medium text-foreground/80",
				)}
			>
				{time}
			</span>
		</li>
	);
}

function Row({
	label,
	value,
	muted = false,
}: {
	label: string;
	value: number;
	muted?: boolean;
}) {
	const isNegative = value < 0;
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd
				className={cn(
					"tabular font-medium",
					isNegative
						? "text-rose-600 dark:text-rose-400"
						: muted
							? "text-muted-foreground"
							: "text-foreground",
				)}
			>
				{isNegative ? "− " : ""}
				{formatRupiah(Math.abs(value))}
			</dd>
		</div>
	);
}
