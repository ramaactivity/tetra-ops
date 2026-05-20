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
	title,
	backHref,
	backLabel,
	meta,
	description,
	actions,
	className,
}: PageHeaderProps) {
	return (
		<header className={cn("space-y-3", className)} data-slot="page-header">
			{backHref ? (
				<Link
					href={backHref}
					className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft className="size-4" aria-hidden strokeWidth={2} />
					{backLabel ?? "Back"}
				</Link>
			) : null}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1 space-y-2">
					<h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[32px]">
						{title}
					</h1>
					{meta ? (
						<div className="flex flex-wrap items-center gap-2">{meta}</div>
					) : null}
					{description ? (
						<p className="text-[13px] leading-snug text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{actions ? (
					<div className="flex flex-wrap items-center gap-1.5">{actions}</div>
				) : null}
			</div>
		</header>
	);
}
