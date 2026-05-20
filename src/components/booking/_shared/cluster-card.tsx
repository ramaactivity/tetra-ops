import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <ClusterCard /> — top-level grouping container for booking form clusters
 * (Source & Vendor / Event Details / Service Package / Contact & Pricing).
 *
 * Replaces the 11 numbered `<Section>` micro-headers with 4 macro-clusters.
 * Each card scrolls under section nav anchor; status badge optional.
 */

export type ClusterStatus = "ok" | "error" | "empty";

const STATUS_DOT: Record<ClusterStatus, string> = {
	ok: "bg-emerald-500",
	error: "bg-rose-500",
	empty: "bg-border-strong/60",
};

const STATUS_LABEL: Record<ClusterStatus, string> = {
	ok: "Lengkap",
	error: "Ada error",
	empty: "Belum lengkap",
};

interface ClusterCardProps {
	/** Anchor target for section nav jump. */
	id: string;
	title: string;
	description?: string;
	icon?: LucideIcon;
	status?: ClusterStatus;
	children: React.ReactNode;
	className?: string;
}

export function ClusterCard({
	id,
	title,
	description,
	icon: Icon,
	status,
	children,
	className,
}: ClusterCardProps) {
	return (
		<section
			id={id}
			data-slot="cluster-card"
			className={cn(
				"scroll-mt-4 space-y-5 rounded-lg border border-border-default bg-card p-5 md:p-6",
				className,
			)}
		>
			<header className="flex items-start gap-3">
				{Icon ? (
					<div className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
						<Icon className="size-4" aria-hidden strokeWidth={2} />
					</div>
				) : null}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="flex items-baseline gap-2">
						<h3 className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">
							{title}
						</h3>
						{status ? (
							<span
								className={cn(
									"inline-flex items-center gap-1 text-[11px] font-medium",
									status === "ok"
										? "text-emerald-700 dark:text-emerald-400"
										: status === "error"
											? "text-rose-700 dark:text-rose-400"
											: "text-muted-foreground",
								)}
								aria-label={STATUS_LABEL[status]}
							>
								<span
									aria-hidden
									className={cn("size-1.5 rounded-full", STATUS_DOT[status])}
								/>
								{STATUS_LABEL[status]}
							</span>
						) : null}
					</div>
					{description ? (
						<p className="text-[12px] leading-snug text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
			</header>
			<div className="space-y-5">{children}</div>
		</section>
	);
}
