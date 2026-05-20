"use client";

import { CalendarDays, MapPin, User2, Wallet } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type NavItem, SectionNav } from "./section-nav";

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
	venueName?: string;
	venueCity?: string;
	clientName?: string;
	picName?: string;
	picContact?: string;

	/** Pricing — always shown when basePrice > 0. */
	basePrice: number;
	addonsTotal: number;
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
	venueName,
	venueCity,
	clientName,
	picName,
	picContact,
	basePrice,
	addonsTotal,
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
				<div className="space-y-1.5">
					<p className="eyebrow flex items-center gap-1.5">
						<CalendarDays className="size-3" aria-hidden strokeWidth={2.25} />
						Event
					</p>
					{eventDate ? (
						<p className="tabular text-[13px] font-medium text-foreground">
							{eventDate}
							{eventTimeRange ? (
								<span className="text-muted-foreground"> · {eventTimeRange}</span>
							) : null}
						</p>
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
							<Row label="Add-ons" value={addonsTotal} />
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
