import { Tag } from "lucide-react";
import type { ReactNode } from "react";
import {
	EventStatusBadge,
	PaymentStatusBadge,
} from "@/components/badges/status-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * <MetaBadge /> — composed inline meta line for operations PageHeader.
 *
 * Renders: monospace project ID · status pill · payment status (opt) ·
 * channel/category tag chips. Each segment is optional so consumers
 * can compose just what fits the page (booking edit shows status +
 * tags; rekap shows custom status pill + crew meta — pass via
 * `extra` slot for those cases).
 *
 * Uses existing EventStatusBadge / PaymentStatusBadge / Badge — does
 * NOT introduce new badge primitives.
 */

interface MetaBadgeProps {
	projectId?: string;
	/** Existing EventStatusBadge prop type — narrowed to string for flexibility */
	status?: string;
	paymentStatus?: string;
	/** Channel / category tag labels (short text chips). */
	tags?: Array<{ label: string; tone?: "default" | "outline" | "warning" }>;
	/** Slot for additional ad-hoc badges (e.g. "Imported", "Migrated"). */
	extra?: ReactNode;
	className?: string;
}

export function MetaBadge({
	projectId,
	status,
	paymentStatus,
	tags,
	extra,
	className,
}: MetaBadgeProps) {
	const hasAnything =
		Boolean(projectId) ||
		Boolean(status) ||
		Boolean(paymentStatus) ||
		(tags && tags.length > 0) ||
		Boolean(extra);
	if (!hasAnything) return null;

	return (
		<div
			className={cn("flex flex-wrap items-center gap-2", className)}
			data-slot="meta-badge"
		>
			{projectId ? (
				<span className="tabular font-mono text-[12px] text-muted-foreground">
					{projectId}
				</span>
			) : null}
			{projectId && (status || paymentStatus || tags?.length || extra) ? (
				<span className="text-muted-foreground/40" aria-hidden>
					·
				</span>
			) : null}
			{status ? <EventStatusBadge status={status} /> : null}
			{paymentStatus ? <PaymentStatusBadge status={paymentStatus} /> : null}
			{tags?.map((t) => (
				<Badge key={t.label} variant={t.tone ?? "default"} className="gap-1">
					<Tag className="size-2.5" aria-hidden strokeWidth={2.5} />
					{t.label}
				</Badge>
			))}
			{extra}
		</div>
	);
}
