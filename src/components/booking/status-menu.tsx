"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateEventStatus } from "@/lib/actions/events";
import { EVENT_STATUSES, type EventStatus } from "@/lib/event-status";
import { EVENT_STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

// Lifecycle is automatic (date + settlement); this menu is for manual override
// / correction. Order mirrors the natural flow, cancel last.
const STATUS_DOT: Record<EventStatus, string> = {
	upcoming: "bg-emerald-500",
	in_progress: "bg-[#0070f3]",
	awaiting_settlement: "bg-amber-500",
	completed: "bg-emerald-500",
	cancelled: "bg-rose-500",
};

export function StatusMenu({
	projectId,
	eventId,
	currentStatus,
}: {
	projectId: string;
	eventId: string;
	currentStatus: EventStatus;
}) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleChange(next: EventStatus) {
		if (next === currentStatus) return;
		if (!confirm(`Ubah status ke "${EVENT_STATUS_LABELS[next] ?? next}"?`)) {
			return;
		}
		setError(null);
		startTransition(async () => {
			const result = await updateEventStatus(projectId, eventId, next);
			if (result.error) setError(result.error);
		});
	}

	return (
		<div className="space-y-1">
			<DropdownMenu>
				<DropdownMenuTrigger
					disabled={pending}
					className="border-border-default bg-surface-2 hover:bg-muted data-[state=open]:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors disabled:opacity-50"
				>
					<span
						className={cn(
							"size-1.5 rounded-full",
							STATUS_DOT[currentStatus] ?? "bg-muted-foreground",
						)}
						aria-hidden
					/>
					{pending ? "Updating…" : "Change status"}
					<ChevronDown className="text-muted-foreground size-3.5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					side="bottom"
					sideOffset={6}
					className="w-60"
				>
					<DropdownMenuLabel className="text-muted-foreground text-[11px] font-normal">
						Set status event
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{EVENT_STATUSES.map((opt) => {
						const isCurrent = opt === currentStatus;
						return (
							<DropdownMenuItem
								key={opt}
								onClick={() => handleChange(opt)}
								disabled={isCurrent}
								className={cn("gap-2", isCurrent && "opacity-100")}
							>
								<span
									className={cn("size-1.5 rounded-full", STATUS_DOT[opt])}
									aria-hidden
								/>
								<span className={cn(isCurrent && "font-medium")}>
									{EVENT_STATUS_LABELS[opt] ?? opt}
								</span>
								{isCurrent && (
									<Check className="text-muted-foreground ml-auto size-3.5" />
								)}
							</DropdownMenuItem>
						);
					})}
					<DropdownMenuSeparator />
					<p className="text-muted-foreground px-2 py-1.5 text-[11px] leading-snug">
						Status berubah otomatis sesuai tanggal &amp; settlement. Ubah manual
						hanya untuk koreksi.
					</p>
				</DropdownMenuContent>
			</DropdownMenu>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}
