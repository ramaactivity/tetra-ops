import { Badge } from "@/components/ui/badge";
import {
	EVENT_STATUS_LABELS,
	PAYMENT_STATUS_LABELS,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status indicators — two flavors:
 *
 * 1. `<EventStatusBadge />` / `<PaymentStatusBadge />` — pill badge for
 *    list cells, kept for back-compat.
 * 2. `<EventStatusDot />` / `<PaymentStatusDot />` — Vercel deployments
 *    inline pattern: status dot + label on one line. Scans faster in
 *    dense tables because the dot color + the text live on the same
 *    baseline.
 */

type Variant =
	| "default"
	| "secondary"
	| "destructive"
	| "outline"
	| "success"
	| "warning"
	| "info";

const EVENT_STATUS_VARIANT: Record<string, Variant> = {
	draft: "outline",
	confirmed: "success",
	design_brief: "info",
	design_approved: "info",
	upcoming: "success",
	in_progress: "info",
	awaiting_settlement: "warning",
	completed: "success",
	cancelled: "destructive",
	archived: "outline",
};

const PAYMENT_STATUS_VARIANT: Record<string, Variant> = {
	unpaid: "outline",
	partial: "warning",
	dp: "warning",
	paid: "success",
	overpaid: "info",
	overdue: "destructive",
};

/* Vercel deployments dot palette — solid dots over an outline ring for
   states that need extra visual weight. Used inline next to status text. */
const DOT_TONE: Record<Variant, string> = {
	default: "bg-muted-foreground",
	secondary: "bg-muted-foreground",
	outline: "bg-muted-foreground/50",
	success: "bg-emerald-500",
	warning: "bg-amber-500",
	info: "bg-[#0070f3]",
	destructive: "bg-rose-500",
};

const TEXT_TONE: Record<Variant, string> = {
	default: "text-foreground",
	secondary: "text-foreground/80",
	outline: "text-muted-foreground",
	success: "text-emerald-700 dark:text-emerald-400",
	warning: "text-amber-700 dark:text-amber-500",
	info: "text-[#0070f3] dark:text-[#3b96ff]",
	destructive: "text-rose-600 dark:text-rose-400",
};

export function EventStatusBadge({ status }: { status: string }) {
	const variant = EVENT_STATUS_VARIANT[status] ?? "outline";
	const label = EVENT_STATUS_LABELS[status] ?? status;
	return <Badge variant={variant}>{label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
	const variant = PAYMENT_STATUS_VARIANT[status] ?? "outline";
	const label = PAYMENT_STATUS_LABELS[status] ?? status;
	return <Badge variant={variant}>{label}</Badge>;
}

interface StatusDotProps {
	variant: Variant;
	label: string;
	className?: string;
	dotClassName?: string;
}

function StatusDot({ variant, label, className, dotClassName }: StatusDotProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-[12.5px] font-medium leading-none",
				TEXT_TONE[variant],
				className,
			)}
		>
			<span
				className={cn(
					"inline-block size-1.5 shrink-0 rounded-full",
					DOT_TONE[variant],
					dotClassName,
				)}
				aria-hidden
			/>
			<span>{label}</span>
		</span>
	);
}

export function EventStatusDot({
	status,
	className,
}: {
	status: string;
	className?: string;
}) {
	const variant = EVENT_STATUS_VARIANT[status] ?? "outline";
	const label = EVENT_STATUS_LABELS[status] ?? status;
	return <StatusDot variant={variant} label={label} className={className} />;
}

export function PaymentStatusDot({
	status,
	className,
}: {
	status: string;
	className?: string;
}) {
	const variant = PAYMENT_STATUS_VARIANT[status] ?? "outline";
	const label = PAYMENT_STATUS_LABELS[status] ?? status;
	return <StatusDot variant={variant} label={label} className={className} />;
}
