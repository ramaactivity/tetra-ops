import { Badge } from "@/components/ui/badge";
import {
	DOC_STATUS_LABEL,
	DOC_TYPE_LABEL,
	type DocStatus,
	type DocType,
} from "@/lib/documents/types";

const STATUS_VARIANT: Record<
	DocStatus,
	"neutral" | "info" | "success" | "danger" | "outline"
> = {
	draft: "neutral",
	sent: "info",
	accepted: "success",
	rejected: "danger",
	void: "outline",
};

export function DocStatusBadge({ status }: { status: DocStatus }) {
	return (
		<Badge variant={STATUS_VARIANT[status]}>{DOC_STATUS_LABEL[status]}</Badge>
	);
}

export function DocTypeBadge({ type }: { type: DocType }) {
	return <Badge variant="outline">{DOC_TYPE_LABEL[type]}</Badge>;
}
