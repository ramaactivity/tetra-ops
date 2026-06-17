import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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

export function PageHeader({
	backHref,
	backLabel,
	meta,
	actions,
	className,
}: PageHeaderProps) {
	// UpGradely DNA: the page-level title + description are dropped — the active
	// sidebar item and the topbar page-name pill already give context, so a big
	// standalone title row only leaves dead space. We keep the back-link, the
	// meta slot (status badges on detail pages), and actions as a right-aligned
	// toolbar, all px-5-aligned with the card content below. Renders nothing if
	// there's nothing left to show.
	if (!backHref && !meta && !actions) return null;
	return (
		<header
			className={cn("flex flex-col gap-2 px-5", className)}
			data-slot="page-header"
		>
			{backHref ? (
				<Link
					href={backHref}
					className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft className="size-4" aria-hidden strokeWidth={2} />
					{backLabel ?? "Back"}
				</Link>
			) : null}
			{meta || actions ? (
				<div className="flex flex-wrap items-center gap-3">
					{meta ? (
						<div className="mr-auto flex flex-wrap items-center gap-2">{meta}</div>
					) : null}
					{actions ? (
						<div className="ml-auto flex flex-wrap items-center gap-1.5">
							{actions}
						</div>
					) : null}
				</div>
			) : null}
		</header>
	);
}
