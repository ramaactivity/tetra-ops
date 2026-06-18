"use client";

import type { ReactNode } from "react";
import { TopbarActionPortal } from "@/components/layouts/topbar-action-portal";
import { cn } from "@/lib/utils";

/**
 * <PageHeader /> — operations-cluster page header.
 *
 * Shape (top-down):
 *   - optional back link ("← Operations") in muted caption color
 *   - title (h1, 28px / 32px sm:, tight tracking)
 *   - optional meta line directly under title (mono ID, status pill,
 *     tags — caller composes via the `meta` slot to avoid baking a
 *     specific badge stack into the primitive)
 *   - optional description (one paragraph, body-tone)
 *   - actions slot floats to the right of title row, wraps on
 *     narrow viewports
 *
 * Matches the existing /operations/[projectId] header so booking
 * pages, rekap, payments, etc. all read identical at a glance.
 */

interface PageHeaderProps {
	title: ReactNode;
	backHref?: string;
	backLabel?: string;
	meta?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}

export function PageHeader({ meta, actions, className }: PageHeaderProps) {
	// UpGradely DNA: title/description dropped (sidebar + topbar pill give
	// context). Back navigation now lives in the topbar page-name pill (global
	// rule), so it's no longer rendered here — only the meta slot + portaled
	// actions remain. `backHref`/`backLabel` are still accepted for callers but
	// intentionally unused. Renders nothing if there's nothing left to show.
	if (!meta && !actions) return null;
	return (
		<>
			{/* Page-level actions teleport to the topbar action slot (top-right). */}
			{actions ? <TopbarActionPortal>{actions}</TopbarActionPortal> : null}
			{meta ? (
				<header
					className={cn("flex flex-col gap-2 px-5", className)}
					data-slot="page-header"
				>
					<div className="flex flex-wrap items-center gap-2">{meta}</div>
				</header>
			) : null}
		</>
	);
}
