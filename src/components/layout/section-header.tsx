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
	h1: "text-fluid-h1",
	h2: "text-fluid-h2",
	h3: "text-fluid-h3",
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
					<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{eyebrow}
					</span>
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
					<p className="text-fluid-body text-muted-foreground">
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
