import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <SectionHeader /> — page-top + section-top header pattern.
 *
 * Replaces ad-hoc `<h1 className="text-3xl">...</h1>` with a
 * standardized title + description + actions slot. Always uses
 * text-fluid-h1 (or h2/h3 via `as`) so mobile shrinks naturally.
 *
 * Usage:
 *   <SectionHeader
 *     title="Operations"
 *     description="Semua event yang sedang berjalan"
 *     actions={<Button>Buat event</Button>}
 *   />
 */

interface SectionHeaderProps
	extends Omit<React.ComponentProps<"header">, "title"> {
	title: React.ReactNode;
	description?: React.ReactNode;
	actions?: React.ReactNode;
	/** Heading level + size. Default = "h1" with text-fluid-h1. */
	as?: "h1" | "h2" | "h3";
	/** Eyebrow / category label above the title (uppercase tracking-wide). */
	eyebrow?: React.ReactNode;
}

const headingClass: Record<NonNullable<SectionHeaderProps["as"]>, string> = {
	h1: "text-[24px] sm:text-[28px] leading-[1.15] tracking-[-0.025em]",
	h2: "text-[20px] sm:text-[22px] leading-[1.2] tracking-[-0.02em]",
	h3: "text-[16px] sm:text-[18px] leading-[1.25] tracking-[-0.015em]",
};

export function SectionHeader({
	title,
	description,
	actions,
	eyebrow,
	as = "h1",
	className,
	...props
}: SectionHeaderProps) {
	const Tag = as;
	return (
		<header
			data-slot="section-header"
			className={cn(
				"flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4",
				className,
			)}
			{...props}
		>
			<div className="flex min-w-0 flex-col gap-1">
				{eyebrow ? (
					<span className="eyebrow">{eyebrow}</span>
				) : null}
				<Tag
					className={cn(
						headingClass[as],
						"min-w-0 truncate font-semibold text-foreground",
					)}
				>
					{title}
				</Tag>
				{description ? (
					<p className="text-[14px] leading-snug text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			) : null}
		</header>
	);
}
