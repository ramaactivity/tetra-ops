import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared rekap UI primitives — one consistent design language across the
 * rekap page, summary, and the big input form. Section card + header keep
 * spacing, typography, and icons uniform so the whole flow reads as one piece.
 *
 * Scale (matches the rest of the app):
 *   - section title  13.5px / semibold
 *   - description    12px / muted
 *   - field label    13px / medium
 *   - eyebrow        11px mono uppercase (.eyebrow)
 */

export function RekapCard({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<section
			className={cn(
				"rounded-[1.25rem] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)]",
				className,
			)}
		>
			{children}
		</section>
	);
}

export function SectionHeader({
	icon: Icon,
	title,
	description,
	badge,
	className,
}: {
	icon?: LucideIcon;
	title: React.ReactNode;
	description?: React.ReactNode;
	badge?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-start justify-between gap-3", className)}>
			<div className="flex min-w-0 items-start gap-2.5">
				{Icon ? (
					<span className="bg-secondary text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl">
						<Icon className="size-4" strokeWidth={2} aria-hidden />
					</span>
				) : null}
				<div className="min-w-0">
					<h3 className="type-heading text-foreground">{title}</h3>
					{description ? (
						<p className="type-secondary mt-1 leading-snug">{description}</p>
					) : null}
				</div>
			</div>
			{badge ? <div className="shrink-0">{badge}</div> : null}
		</div>
	);
}

export function FieldLabel({
	htmlFor,
	children,
	hint,
	className,
}: {
	htmlFor?: string;
	children: React.ReactNode;
	hint?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-baseline justify-between gap-2", className)}>
			<label
				htmlFor={htmlFor}
				className="text-[13px] font-medium text-foreground"
			>
				{children}
			</label>
			{hint ? (
				<span className="text-[11px] text-muted-foreground">{hint}</span>
			) : null}
		</div>
	);
}

/**
 * Shared input chrome — 44px touch target, 16px text. The 16px is deliberate:
 * iOS Safari zooms the viewport when a focused input is < 16px, which feels
 * broken. 12px radius matches the softer mobile language.
 */
export const REKAP_INPUT =
	"h-11 w-full rounded-xl border border-border-default bg-background px-3.5 text-[1rem] text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none";
