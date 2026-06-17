import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <FilterBar /> — the one responsive shell every filter bar in the app shares,
 * so list-page filtering looks and behaves identically everywhere.
 *
 * Layout:
 * - **Mobile** (`< sm`): the search input gets its own full-width row, and the
 *   filter controls sit in ONE tidy horizontal-scroll row (no messy wrapping).
 * - **Desktop** (`sm+`): everything collapses to a single inline wrapping row,
 *   with the search inline at the start (matches the long-standing Vercel chrome).
 *
 * Every direct control is forced `shrink-0` so the scroll row keeps each control
 * at its natural width instead of squashing them. Pass the search input via the
 * `search` prop (optional — date-only bars omit it) and the controls as children.
 *
 * Usage:
 *   <FilterBar search={<FilterSearchInput … />}>
 *     <NativeSelect … />
 *     <MonthPicker … />
 *     {hasFilters && <ClearLink … />}
 *   </FilterBar>
 */
export function FilterBar({
	search,
	children,
	className,
	/** Width clamp for the inline (desktop) search. */
	searchClassName = "sm:min-w-[200px] sm:max-w-[280px] sm:flex-1",
}: {
	search?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	searchClassName?: string;
}) {
	return (
		<div className={cn("space-y-2", className)}>
			{search ? <div className="sm:hidden">{search}</div> : null}

			<div className="hide-scrollbar flex items-center gap-2 overflow-x-auto pb-1 [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
				{search ? (
					<div className={cn("hidden sm:block", searchClassName)}>{search}</div>
				) : null}
				{children}
			</div>
		</div>
	);
}
