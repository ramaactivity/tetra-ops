import { Badge } from "@/components/ui/badge";
import {
	EVENT_STATUS_LABELS,
	PAYMENT_STATUS_LABELS,
} from "@/lib/format";

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
