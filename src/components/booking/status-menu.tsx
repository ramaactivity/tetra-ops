"use client";

import { ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateEventStatus } from "@/lib/actions/events";
import { EVENT_STATUS_LABELS } from "@/lib/format";

const STATUS_OPTIONS = [
	"draft",
	"confirmed",
	"design_brief",
	"design_approved",
	"upcoming",
	"in_progress",
	"awaiting_settlement",
	"completed",
	"cancelled",
	"archived",
] as const;

type Status = (typeof STATUS_OPTIONS)[number];

export function StatusMenu({
	projectId,
	eventId,
	currentStatus,
}: {
	projectId: string;
	eventId: string;
	currentStatus: Status;
}) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleChange(next: Status) {
		if (next === currentStatus) return;
		if (
			!confirm(
				`Ubah status ke "${EVENT_STATUS_LABELS[next] ?? next}"?`,
			)
		) {
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
					className="border-border bg-card hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium disabled:opacity-50"
				>
					{pending ? "Updating…" : "Change status"}
					<ChevronDown className="h-3.5 w-3.5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuGroup>
						<DropdownMenuLabel className="text-muted-foreground text-xs">
							Set event status
						</DropdownMenuLabel>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					{STATUS_OPTIONS.map((opt) => (
						<DropdownMenuItem
							key={opt}
							onClick={() => handleChange(opt)}
							disabled={opt === currentStatus}
							className="cursor-pointer text-xs"
						>
							{EVENT_STATUS_LABELS[opt] ?? opt}
							{opt === currentStatus && (
								<span className="text-muted-foreground ml-auto">current</span>
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}
