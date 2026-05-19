"use client";

import { CheckCircle2, FileText, Lock } from "lucide-react";
import Link from "next/link";
import { ReopenButton } from "./reopen-button";

type Props = {
	eventId: string;
	projectId: string;
	settledAt: string;
	closedByName: string | null;
	netProfit: number;
	isReopened: boolean;
	journalEntryId: string | null;
	isSuperAdmin: boolean;
};

export function SettledBanner({
	eventId,
	projectId,
	settledAt,
	closedByName,
	isReopened,
	journalEntryId,
	isSuperAdmin,
}: Props) {
	return (
		<aside className="sticky top-0 z-20 -mx-4 border-b border-border-default bg-surface-2/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3">
						{isReopened ? (
							<Lock className="h-4 w-4 text-amber-700" />
						) : (
							<CheckCircle2 className="h-4 w-4 text-foreground" />
						)}
					</div>
					<div>
						<p className="text-sm font-semibold tracking-tight text-foreground">
							{isReopened ? "Settlement reopened" : "Event settled"}
						</p>
						<p className="text-[11px] text-muted-foreground">
							<time dateTime={settledAt}>
								{new Date(settledAt).toLocaleString("id-ID", {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</time>
							{closedByName && (
								<>
									{" · "}
									<span className="text-foreground">by {closedByName}</span>
								</>
							)}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-1.5">
					{journalEntryId && (
						<Link
							href={`/finance?journal=${journalEntryId}`}
							className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-link hover:bg-surface-3 hover:text-link-deep"
						>
							<FileText className="h-3.5 w-3.5" />
							View journal
						</Link>
					)}
					<ReopenButton
						eventId={eventId}
						projectId={projectId}
						isSuperAdmin={isSuperAdmin}
						isReopened={isReopened}
					/>
				</div>
			</div>
		</aside>
	);
}
