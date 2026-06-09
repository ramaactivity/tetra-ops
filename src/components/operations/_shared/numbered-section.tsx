import type * as React from "react";
import { SectionCard } from "@/components/operations/_shared/section-card";

/**
 * <NumberedSection /> — the operations-cluster section DNA, shared by the
 * New Booking form and the rekap edit form. A collapsible SectionCard with a
 * numbered eyebrow header: `01 · CETAK` (primary tabular step · uppercase
 * title). Keeps every multi-step form on one consistent shell.
 */
export function NumberedSection({
	step,
	title,
	description,
	badge,
	defaultOpen = true,
	children,
}: {
	step: number;
	title: React.ReactNode;
	description?: React.ReactNode;
	/** Optional right-aligned header slot (e.g. an Include/Skip badge). */
	badge?: React.ReactNode;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const stepLabel = step.toString().padStart(2, "0");
	const titleText = typeof title === "string" ? title.toUpperCase() : title;
	return (
		<SectionCard
			title={
				<span className="eyebrow text-muted-foreground">
					<span className="tabular text-primary">{stepLabel}</span>
					<span className="mx-1.5 text-muted-foreground/50">·</span>
					<span className="text-foreground">{titleText}</span>
				</span>
			}
			subtitle={description}
			actions={badge}
			defaultOpen={defaultOpen}
		>
			<div className="space-y-4">{children}</div>
		</SectionCard>
	);
}
