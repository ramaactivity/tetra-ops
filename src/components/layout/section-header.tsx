"use client";

import type * as React from "react";
import { TopbarActionPortal } from "@/components/layouts/topbar-action-portal";
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

// Native type ramp (see globals.css). h1 reads as an iOS-style large title on
// mobile and scales gently up to desktop via the bundled clamp.
const headingClass: Record<NonNullable<SectionHeaderProps["as"]>, string> = {
	h1: "type-display",
	h2: "type-title",
	h3: "type-heading",
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
	// UpGradely DNA: page-level titles (as="h1") are dropped — context comes
	// from the active sidebar item + the topbar page-name pill. Page-level
	// actions teleport to the topbar action slot (top-right). Sub-section
	// headers (as="h2"/"h3") keep their title and inline actions.
	const showTitle = as !== "h1";
	const portalActions = as === "h1" && Boolean(actions);
	const inlineActions = Boolean(actions) && !portalActions;

	if (!showTitle && !actions) return null;

	return (
		<>
			{portalActions ? (
				<TopbarActionPortal>{actions}</TopbarActionPortal>
			) : null}
			{showTitle || inlineActions ? (
				<header
					data-slot="section-header"
					className={cn(
						// px-5 lines the title (and inline actions) up with the inner
						// content of the cards below (which use p-5).
						"flex flex-col gap-2 px-5 sm:flex-row sm:items-end sm:gap-4",
						showTitle ? "sm:justify-between" : "sm:justify-end",
						className,
					)}
					{...props}
				>
					{showTitle ? (
						<div className="flex min-w-0 flex-col gap-1">
							{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
							<Tag className={cn(headingClass[as], "min-w-0 text-foreground")}>
								{title}
							</Tag>
							{description ? (
								<p className="type-secondary leading-snug">{description}</p>
							) : null}
						</div>
					) : null}
					{inlineActions ? (
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							{actions}
						</div>
					) : null}
				</header>
			) : null}
		</>
	);
}
