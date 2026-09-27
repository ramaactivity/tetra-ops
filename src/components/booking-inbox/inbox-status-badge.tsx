import { INBOX_STATUS_LABEL, type InboxStatus } from "@/lib/booking-inbox/core";
import { cn } from "@/lib/utils";

const TONE: Record<InboxStatus, string> = {
	baru: "bg-sky-100 text-sky-800",
	diproses: "bg-amber-100 text-amber-800",
	jadi_event: "bg-emerald-100 text-emerald-800",
	dibatalkan: "bg-secondary text-muted-foreground",
};

export function InboxStatusBadge({ status }: { status: InboxStatus }) {
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-semibold",
				TONE[status],
			)}
		>
			{INBOX_STATUS_LABEL[status]}
		</span>
	);
}
